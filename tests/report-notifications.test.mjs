import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { stripTypeScriptTypes } from "node:module";

const moduleSource = readFileSync(new URL("../modules/report-notifications/index.js", import.meta.url), "utf8");
const workerSource = readFileSync(new URL("../service-worker.js", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/20261004130000_admin_report_push.sql", import.meta.url), "utf8");
const edge = readFileSync(new URL("../supabase/functions/report-push/index.ts", import.meta.url), "utf8");

const options = { url: "https://example.supabase.co", key: "public-key", accessToken: "admin-token", userId: "admin-id" };

function harness({ permission = "granted", rows = [{ endpoint: "https://fcm.googleapis.com/push" }], subscribed = true } = {}) {
    const calls = [];
    const subscription = {
        endpoint: "https://fcm.googleapis.com/push",
        toJSON: () => ({ keys: { p256dh: "p256dh", auth: "auth" } }),
        unsubscribe: async () => { calls.push("unsubscribe"); return true; }
    };
    const registration = {
        pushManager: {
            getSubscription: async () => subscribed ? subscription : null,
            subscribe: async config => { calls.push(["subscribe", config]); return subscription; }
        }
    };
    const context = vm.createContext({
        window: { PushManager: {}, Notification: {} },
        navigator: { serviceWorker: {
            getRegistration: async () => registration,
            register: async (...args) => { calls.push(["register", ...args]); return registration; },
            ready: Promise.resolve(registration)
        } },
        Notification: { requestPermission: async () => permission },
        serviceWorkerUrl: "https://qcm-major.fr/service-worker.js",
        serviceWorkerScope: "/",
        Uint8Array, atob, encodeURIComponent,
        fetch: async (url, config) => {
            calls.push(["fetch", url, config]);
            return {
                ok: true,
                json: async () => url.includes("/functions/") ? { publicKey: "BA" } : rows
            };
        }
    });
    vm.runInContext(moduleSource.slice(moduleSource.indexOf("function ensureSupported")).replaceAll("export async function", "async function"), context);
    return { context, calls };
}

test("activation enregistre le service worker puis l’abonnement de l’administrateur", async () => {
    const h = harness({ subscribed: false });
    await h.context.enableReportNotifications(options);
    assert.ok(h.calls.some(call => call[0] === "register"));
    const subscribe = h.calls.find(call => call[0] === "subscribe");
    assert.equal(subscribe[1].userVisibleOnly, true);
    const insert = h.calls.find(call => call[0] === "fetch" && call[2].method === "POST");
    assert.match(insert[1], /admin_push_subscriptions\?on_conflict=user_id,endpoint$/);
    assert.equal(JSON.parse(insert[2].body)[0].user_id, options.userId);
    assert.equal(insert[2].headers.Authorization, "Bearer admin-token");
    const config = h.calls.find(call => call[0] === "fetch" && call[1].includes("/functions/"));
    assert.equal(config[2].headers.Prefer, undefined);
});

test("un refus de permission ne crée aucun abonnement", async () => {
    const h = harness({ permission: "denied" });
    await assert.rejects(h.context.enableReportNotifications(options), /Notifications refusées/);
    assert.equal(h.calls.length, 0);
});

test("une activation sans confirmation Supabase échoue explicitement", async () => {
    const h = harness({ rows: [] });
    await assert.rejects(h.context.enableReportNotifications(options), /n’a pas confirmé/);
});

test("l’état vérifie l’abonnement serveur et la désactivation supprime avant de désabonner", async () => {
    const h = harness();
    assert.equal(await h.context.reportNotificationsEnabled(options), true);
    await h.context.disableReportNotifications(options);
    const deletion = h.calls.findIndex(call => call[0] === "fetch" && call[2].method === "DELETE");
    assert.ok(deletion >= 0);
    assert.equal(h.calls[deletion + 1], "unsubscribe");
});

test("le test push appelle la fonction avec la session administrateur", async () => {
    const h = harness();
    await h.context.testReportNotification(options);
    assert.equal(h.calls[0][2].method, "POST");
    assert.equal(JSON.parse(h.calls[0][2].body).type, "test");
});

test("le service worker affiche une notification sans divulguer le signalement", async () => {
    const handlers = {};
    const notifications = [];
    const self = {
        addEventListener: (event, handler) => { handlers[event] = handler; },
        registration: {
            scope: "https://qcm-major.fr/",
            showNotification: async (...args) => { notifications.push(args); }
        },
        clients: { matchAll: async () => [], openWindow: async url => url }
    };
    vm.runInNewContext(workerSource, { self, URL });
    let completion;
    handlers.push({ waitUntil: promise => { completion = promise; } });
    await completion;
    assert.equal(notifications.length, 1);
    assert.match(notifications[0][0], /Signalements/);
    assert.equal(notifications[0][1].renotify, true);
    assert.equal(notifications[0][1].tag, "qcm-question-reports");
    assert.doesNotMatch(JSON.stringify(notifications), /reporter|@|question_text/);
    let closed = false;
    handlers.notificationclick({
        notification: { close: () => { closed = true; } },
        waitUntil: promise => { completion = promise; }
    });
    assert.equal(await completion, "https://qcm-major.fr/?admin-section=question-reports");
    assert.equal(closed, true);
});

test("le serveur réserve les abonnements aux admins et authentifie l’envoi", () => {
    assert.match(migration, /user_id = auth\.uid\(\)/);
    assert.match(migration, /app_metadata.*role/);
    assert.match(migration, /after insert on public\.question_reports/);
    assert.match(migration, /vault\.decrypted_secrets/);
    assert.match(edge, /database\.auth\.getUser\(token\)/);
    assert.match(edge, /database\.auth\.admin\.getUserById/);
    assert.match(edge, /x-qcm-webhook-secret/);
    assert.match(edge, /error\.statusCode === 404 \|\| error\.statusCode === 410/);
    assert.match(edge, /url\.hostname === "fcm\.googleapis\.com"/);
    assert.doesNotMatch(workerSource, /addEventListener\("fetch"/);
});

function edgeHarness({ admin = true, report = { id: "report-id", status: "pending" }, sendError = null } = {}) {
    let handler;
    const calls = [];
    class WebPushError extends Error {
        constructor(statusCode) {
            super("Push service error");
            this.statusCode = statusCode;
        }
    }
    const subscriptions = [{ user_id: "admin-id", endpoint: "https://fcm.googleapis.com/push", p256dh: "key", auth: "auth" }];
    const database = {
        auth: {
            getUser: async () => ({ data: { user: { id: "admin-id", app_metadata: { role: admin ? "admin" : "candidate" } } } }),
            admin: { getUserById: async () => ({ data: { user: { app_metadata: { role: "admin" } } } }) }
        },
        from(table) {
            let deletion = false;
            return {
                select() { return this; },
                eq() { return this; },
                delete() { deletion = true; return this; },
                maybeSingle: async () => ({ data: report }),
                then(resolve) {
                    if (deletion) calls.push("delete-expired");
                    return Promise.resolve({ data: table === "admin_push_subscriptions" ? subscriptions : report }).then(resolve);
                }
            };
        }
    };
    const source = stripTypeScriptTypes(edge.replace(/^import .*;\r?$/gm, ""));
    const context = {
        Deno: { env: { get: name => name === "QCM_REPORT_PUSH_WEBHOOK_SECRET" ? "webhook-secret" : "configured" }, serve: fn => { handler = fn; } },
        createClient: () => database,
        webpush: {
            WebPushError,
            setVapidDetails() {},
            async sendNotification() {
                calls.push("send");
                if (sendError) throw new WebPushError(sendError);
            }
        },
        Response, URL,
        console: { error: (...args) => { calls.push(["error", ...args]); } }
    };
    vm.runInNewContext(source, context);
    return { handler, calls };
}

function webhookRequest() {
    return new Request("https://example.supabase.co/functions/v1/report-push", {
        method: "POST",
        headers: { "x-qcm-webhook-secret": "webhook-secret" },
        body: JSON.stringify({
            type: "INSERT", schema: "public", table: "question_reports",
            record: { id: "00000000-0000-4000-8000-000000000000" }
        })
    });
}

test("la fonction refuse les demandes non authentifiées et les tests des candidats", async () => {
    const h = edgeHarness({ admin: false });
    const unauthenticated = await h.handler(new Request("https://example.com", { method: "POST" }));
    assert.equal(unauthenticated.status, 401);
    const candidate = await h.handler(new Request("https://example.com", {
        method: "POST", headers: { Authorization: "Bearer candidate-token" }, body: '{"type":"test"}'
    }));
    assert.equal(candidate.status, 403);
    assert.equal(h.calls.includes("send"), false);
});

test("le webhook vérifie le signalement existant avant d’envoyer", async () => {
    const h = edgeHarness({ report: null });
    const result = await h.handler(webhookRequest());
    assert.equal(result.status, 200);
    assert.deepEqual(await result.json(), { sent: 0 });
    assert.equal(h.calls.includes("send"), false);
});

test("le webhook envoie aux abonnements administrateurs et retire les endpoints expirés", async () => {
    for (const [sendError, expectedSent] of [[null, 1], [410, 0]]) {
        const h = edgeHarness({ sendError });
        const result = await h.handler(webhookRequest());
        assert.equal(result.status, 200);
        assert.deepEqual(await result.json(), { sent: expectedSent });
        assert.equal(h.calls.includes("delete-expired"), sendError === 410);
    }
});

test("un échec de livraison est retourné comme erreur, pas comme succès", async () => {
    const h = edgeHarness({ sendError: 503 });
    const result = await h.handler(webhookRequest());
    assert.equal(result.status, 502);
    assert.equal((await result.json()).failed, 1);
});
