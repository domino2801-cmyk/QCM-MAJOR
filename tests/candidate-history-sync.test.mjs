import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const refresh = app.slice(app.indexOf("function setCandidateHistoryStatus("), app.indexOf("function showAuthenticatedApp("));
const loader = app.slice(app.indexOf("async function loadResultsFromSupabase("), app.indexOf("async function loadPublicGlobalRanking("));

function harness(load) {
    const account = { id: "candidate-a", email: "a@example.fr" };
    const statuses = new Map([
        ["candidate-history-status", { innerText: "" }],
        ["candidate-history-sync-status", { innerText: "" }],
        ["candidate-history-period", { value: "30" }]
    ]);
    const calls = [];
    const warnings = [];
    const context = vm.createContext({
        currentAuthenticatedAccount: account,
        currentCandidateEmail: account.email,
        document: { getElementById: id => statuses.get(id) },
        getStoredSupabaseSession: () => ({ access_token: "candidate-session" }),
        loadResultsFromSupabase: async options => {
            assert.equal(options.throwOnError, true);
            return load();
        },
        getResults: () => [{ candidateId: account.id, theme: "all", score: 17 }],
        renderCandidateHistory: (...args) => calls.push(args),
        console: { warn: (...args) => warnings.push(args) }
    });
    vm.runInContext(refresh, context);
    return { account, context, statuses, calls, warnings };
}

test("la connexion recharge et recalcule l’historique du candidat et la période sélectionnée", async () => {
    const h = harness(() => true);
    h.context.account = h.account;
    await vm.runInContext("refreshCandidateHistory(account)", h.context);
    assert.equal(h.calls.length, 1);
    assert.equal(h.calls[0][1], "candidate-a");
    assert.equal(h.calls[0][2], "a@example.fr");
    assert.equal(h.calls[0][3], 30);
    for (const id of ["candidate-history-status", "candidate-history-sync-status"]) {
        assert.equal(h.statuses.get(id).innerText, "Historique actualisé depuis Supabase.");
    }
    assert.match(app, /await showAuthenticatedApp\(mergedAccount\.email, mergedAccount\)/);
    assert.match(app, /await showAuthenticatedApp\(repairedAccount\.email, repairedAccount\)/);
});

test("un échec n'annonce pas une synchronisation réussie et conserve l'accès candidat", async () => {
    for (const load of [() => false, () => { throw new Error("Réseau indisponible"); }]) {
        const h = harness(load);
        h.context.account = h.account;
        await vm.runInContext("refreshCandidateHistory(account)", h.context);
        assert.match(h.statuses.get("candidate-history-status").innerText, /impossible/);
        assert.equal(h.calls.length, 0);
        assert.equal(h.warnings.length, 1);
        assert.equal(h.context.currentAuthenticatedAccount.id, "candidate-a");
    }
});

test("un changement de compte pendant la synchronisation ne réaffiche pas l’ancien historique", async () => {
    let resolve;
    const h = harness(() => new Promise(done => { resolve = done; }));
    h.context.account = h.account;
    const pending = vm.runInContext("refreshCandidateHistory(account)", h.context);
    assert.match(h.statuses.get("candidate-history-status").innerText, /Actualisation/);
    h.context.currentAuthenticatedAccount = { id: "candidate-b", email: "b@example.fr" };
    h.context.currentCandidateEmail = "b@example.fr";
    resolve(true);
    await pending;
    assert.equal(h.calls.length, 0);
    assert.doesNotMatch(h.statuses.get("candidate-history-status").innerText, /actualisé/);
});

test("le chargement refuse d'enregistrer des résultats si la session a changé", async () => {
    let token = "candidate-a-token";
    let saved = false;
    const context = vm.createContext({
        supabase: {},
        getStoredSupabaseSession: () => ({ access_token: token }),
        supabaseRestRequest: async () => {
            token = "candidate-b-token";
            return [{ id: "result-a" }];
        },
        normalizeResultRecord: row => row,
        pendingResultSync: { deletes: [], upserts: [] },
        getResults: () => [],
        setResults: () => { saved = true; },
        flushPendingResultSync: () => assert.fail("Synchronisation de l'ancien compte"),
    });
    vm.runInContext(loader, context);
    await assert.rejects(vm.runInContext("loadResultsFromSupabase({throwOnError:true})", context), /session a changé/);
    assert.equal(saved, false);
});
