import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { sendInactivityReminders } from "../supabase/functions/inactivity-reminders/send.mjs";

function database({ eligible = true } = {}) {
    const calls = [];
    let claimed = false;
    return {
        calls,
        async rpc(name, args) {
            calls.push({ name, args });
            if (name === "claim_qcm_inactivity_email") {
                if (claimed) return { data: [] };
                claimed = true;
                return { data: [{ id: "reservation", email: "candidate@example.com" }] };
            }
            if (name === "confirm_qcm_inactivity_email") return { data: eligible };
            return { data: null };
        }
    };
}

test("sends the published template once and records Resend acceptance", async () => {
    const db = database();
    const requests = [];
    const result = await sendInactivityReminders(db, {
        apiKey: "test-key", templateId: "test-template",
        fetchImpl: async (url, options) => {
            requests.push({ url, options });
            return Response.json({ id: "resend-id" });
        }
    });
    assert.deepEqual(result, { sent: 1 });
    assert.deepEqual(JSON.parse(requests[0].options.body), {
        to: ["candidate@example.com"], template: { id: "test-template" }
    });
    assert.equal(requests[0].options.headers["Idempotency-Key"], "qcm-inactivity/reservation");
    const saved = db.calls.find(call => call.name === "finish_qcm_inactivity_email");
    assert.equal(saved.args.p_status, "sent");
    assert.equal(saved.args.p_resend_id, "resend-id");
});

test("does not send if the candidate returned after reservation", async () => {
    const db = database({ eligible: false });
    const result = await sendInactivityReminders(db, {
        apiKey: "test-key", templateId: "test-template",
        fetchImpl: () => { throw new Error("Should not send"); }
    });
    assert.deepEqual(result, { sent: 0 });
    assert.equal(db.calls.some(call => call.name === "finish_qcm_inactivity_email"), false);
});

test("records definite rejection and ambiguous delivery separately", async () => {
    for (const [status, expected] of [[429, "failed"], [409, "unknown"], [503, "unknown"]]) {
        const db = database();
        await assert.rejects(sendInactivityReminders(db, {
            apiKey: "test-key", templateId: "test-template",
            fetchImpl: async () => Response.json({ error: "failed" }, { status })
        }), /Resend request failed/);
        assert.equal(db.calls.find(call => call.name === "finish_qcm_inactivity_email").args.p_status, expected);
    }
});

test("records an uncertain delivery after a network error without retrying", async () => {
    const db = database();
    await assert.rejects(sendInactivityReminders(db, {
        apiKey: "test-key", templateId: "test-template",
        fetchImpl: async () => { throw new Error("Network timeout"); }
    }), /delivery status is unknown/);
    assert.equal(db.calls.find(call => call.name === "finish_qcm_inactivity_email").args.p_status, "unknown");
    assert.equal(db.calls.filter(call => call.name === "claim_qcm_inactivity_email").length, 1);
});

test("a QCM visit refreshes an expired session before recording", async () => {
    const source = readFileSync(new URL("../app.js", import.meta.url), "utf8");
    const code = source.slice(source.indexOf("async function recordQcmVisit()"), source.indexOf("function showAuthenticatedApp("));
    const calls = [];
    const context = vm.createContext({
        currentAuthenticatedAccount: { id: "candidate" },
        getStoredSupabaseSession: () => ({
            access_token: "expired", refresh_token: "refresh", expires_at: 1, user: { id: "candidate" }
        }),
        isAdminSession: () => false,
        supabase: { auth: { refreshSession: async () => ({
            data: { session: { access_token: "fresh", user: { id: "candidate" } } }
        }) } },
        supabaseRestRequest: async (path, options) => calls.push({ path, token: options.accessToken }),
        console
    });
    vm.runInContext(code, context);
    await vm.runInContext("recordQcmVisit()", context);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].path, "/rpc/record_qcm_visit");
    assert.equal(calls[0].token, "fresh");
});

test("the dashboard reminder RPC is admin-only and includes only accepted emails for the current visit", () => {
    const migration = readFileSync(new URL("../supabase/migrations/20261112180000_admin_inactivity_card_status.sql", import.meta.url), "utf8");
    assert.match(migration, /security definer/i);
    assert.match(migration, /set search_path = ''/i);
    assert.match(migration, /Administrator access required/i);
    assert.match(migration, /m\.activity_at = a\.last_seen_at/i);
    assert.match(migration, /m\.status = 'sent'/i);
    assert.match(migration, /revoke all on function public\.get_admin_current_inactivity_reminders\(\) from public, anon/i);
});
