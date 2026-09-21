import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(testDirectory, "..");
const appJs = readFileSync(`${root}/app.js`, "utf8");

function extractFunction(functionName) {
    const asyncMarker = `async function ${functionName}(`;
    const syncMarker = `function ${functionName}(`;
    const start = appJs.indexOf(asyncMarker) !== -1
        ? appJs.indexOf(asyncMarker)
        : appJs.indexOf(syncMarker);
    assert.notEqual(start, -1, `Unable to find ${functionName}`);

    const bodyStart = appJs.indexOf("{", appJs.indexOf(")", start));
    let depth = 0;
    for (let index = bodyStart; index < appJs.length; index += 1) {
        if (appJs[index] === "{") depth += 1;
        if (appJs[index] === "}") depth -= 1;
        if (depth === 0) return appJs.slice(start, index + 1);
    }

    throw new Error(`Unable to extract ${functionName}`);
}

function createResponse(body, { ok = true, status = 200 } = {}) {
    return {
        ok,
        status,
        async json() {
            return body;
        }
    };
}

function createHarness(fetchBehavior, initialResults = []) {
    const calls = [];
    const storage = new Map();
    const context = {
        supabaseUrl: "https://example.supabase.co",
        supabaseAnonKey: "anon-test-key",
        resultsStorageKey: "bm4-results",
        resultsSyncStorageKey: "bm4-results-sync-v1",
        supabaseSessionStorageKey: "bm4-supabase-session",
        supabase: { auth: {} },
        pendingResultSync: { upserts: [], deletes: [] },
        currentSupabaseSession: { access_token: "access-token" },
        resultsCache: [],
        window: {
            sessionStorage: {
                getItem: () => null,
                setItem: () => {},
                removeItem: () => {}
            }
        },
        localStorage: {
            setItem(key, value) {
                storage.set(key, value);
            },
            getItem(key) {
                return storage.get(key) || null;
            }
        },
        fetch: async (url, options) => {
            calls.push({ url, options });
            return fetchBehavior(calls.at(-1));
        },
        JSON,
        Error,
        String,
        Number,
        Date,
        console
    };

    const functions = [
        "buildSupabaseHeaders",
        "supabaseRestRequest",
        "getStoredSupabaseSession",
        "normalizeResultRecord",
        "setResults",
        "getResults",
        "toSupabaseResultPayload",
        "persistPendingResultSync",
        "queueResultUpsert",
        "queueResultDelete",
        "flushPendingResultSync"
    ].map(extractFunction).join("\n");

    vm.runInNewContext(`${functions}
        setResults(${JSON.stringify(initialResults)});
        if (getResults()[0]) queueResultUpsert(getResults()[0]);
        flushPendingResultSync;
    `, context);

    return { context, calls, storage };
}

test("remontée Supabase envoie le résultat avec les headers et le payload attendus", async () => {
    const result = {
        id: "result-1",
        candidateId: "candidate-1",
        email: "candidate@example.com",
        name: "Candidate Test",
        theme: "all",
        score: 16,
        correct: 4,
        wrong: 1,
        skipped: 0,
        total: 5,
        createdAt: "2026-09-19T10:00:00.000Z",
        synced: false
    };
    const harness = createHarness(() => Promise.resolve(createResponse(null)), [result]);

    await vm.runInNewContext("flushPendingResultSync()", harness.context);

    assert.equal(harness.calls.length, 1);
    assert.equal(harness.calls[0].url, "https://example.supabase.co/rest/v1/quiz_results?on_conflict=id");
    assert.equal(harness.calls[0].options.method, "POST");
    assert.equal(harness.calls[0].options.headers.apikey, "anon-test-key");
    assert.equal(harness.calls[0].options.headers.Authorization, "Bearer access-token");
    assert.equal(harness.calls[0].options.headers.Prefer, "resolution=merge-duplicates,return=minimal");
    assert.deepEqual(JSON.parse(harness.calls[0].options.body), [{
        id: "result-1",
        user_id: "candidate-1",
        email: "candidate@example.com",
        name: "Candidate Test",
        theme: "all",
        score: 16,
        correct: 4,
        wrong: 1,
        skipped: 0,
        total: 5
    }]);
    assert.deepEqual(harness.context.pendingResultSync, { upserts: [], deletes: [] });
    assert.equal(harness.context.getResults()[0].synced, true);
});

test("remontée Supabase bascule vers candidate_id si user_id est refusé", async () => {
    const result = {
        id: "result-2",
        candidateId: "candidate-2",
        email: "candidate2@example.com",
        name: "Candidate Deux",
        theme: "2",
        score: 12,
        correct: 3,
        wrong: 1,
        skipped: 1,
        total: 5,
        synced: false
    };
    const harness = createHarness(({ options }) => options.body.includes("user_id")
        ? Promise.resolve(createResponse({ message: "column user_id does not exist" }, { ok: false, status: 400 }))
        : Promise.resolve(createResponse(null)), [result]);

    await vm.runInNewContext("flushPendingResultSync()", harness.context);

    assert.equal(harness.calls.length, 2);
    assert.match(harness.calls[1].options.body, /candidate_id/);
    assert.doesNotMatch(harness.calls[1].options.body, /user_id/);
    assert.deepEqual(harness.context.pendingResultSync, { upserts: [], deletes: [] });
});

test("suppression Supabase envoie les identifiants en DELETE et vide la file", async () => {
    const harness = createHarness(() => Promise.resolve(createResponse(null)), []);
    harness.context.pendingResultSync.deletes = ["result-a", "result-b"];

    await vm.runInNewContext("flushPendingResultSync()", harness.context);

    assert.equal(harness.calls.length, 1);
    assert.equal(harness.calls[0].url, "https://example.supabase.co/rest/v1/quiz_results?id=in.(\"result-a\",\"result-b\")");
    assert.equal(harness.calls[0].options.method, "DELETE");
    assert.equal(harness.calls[0].options.body, undefined);
    assert.deepEqual(harness.context.pendingResultSync, { upserts: [], deletes: [] });
});

test("aucun appel réseau n’est effectué sans session Supabase", async () => {
    const harness = createHarness(() => Promise.resolve(createResponse(null)), []);
    harness.context.currentSupabaseSession = null;
    harness.context.pendingResultSync.upserts = ["missing-result"];

    await vm.runInNewContext("flushPendingResultSync()", harness.context);

    assert.equal(harness.calls.length, 0);
    assert.deepEqual(harness.context.pendingResultSync, { upserts: ["missing-result"], deletes: [] });
});