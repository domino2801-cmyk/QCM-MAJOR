import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const code = source.slice(source.indexOf("function afficherProgression("), source.indexOf("async function submitQuestionReport("));

function fixture() {
    const buttons = [10, 20, 30, 40, 50].map(qty => ({
        dataset: { qty: String(qty) }, classList: { toggle() {} }
    }));
    const campaign = [0, 1].map(() => ({ classList: { toggle() {} } }));
    const calls = [];
    const storage = new Map();
    const context = {
        progressionMaximum: 10,
        currentAuthenticatedAccount: { id: "alice" },
        document: {
            querySelectorAll: () => buttons,
            getElementById: id => campaign[id === "theme-training-btn" ? 0 : 1]
        },
        localStorage: { setItem: (key, value) => storage.set(key, value) },
        getStoredSupabaseSession: () => ({ access_token: "token" }),
        supabaseRestRequest: async (path, options) => {
            calls.push({ path, options });
            if (path.startsWith("/rpc/")) {
                const { question_count, points } = options.body;
                const threshold = { 10: 24, 20: 56, 30: 96, 40: 136 }[question_count];
                return { max_unlocked_questions: threshold && points >= threshold ? question_count + 10 : question_count };
            }
            if (options.method === "POST") return null;
            return [{ max_unlocked_questions: 30 }];
        },
        console
    };
    vm.runInNewContext(code, context);
    return { context, buttons, campaign, calls, storage };
}

test("les choix et les deux modes haute intensité suivent le palier", () => {
    const f = fixture();
    for (const maximum of [10, 20, 30, 40, 50]) {
        f.context.afficherProgression(maximum);
        f.buttons.forEach((button, index) => assert.equal(button.disabled, (index + 1) * 10 > maximum));
        f.campaign.forEach(button => assert.equal(button.disabled, maximum < 50));
    }
});

test("les seuils exacts et les points manquants sont calculés en score brut", async () => {
    const f = fixture();
    for (const [questions, threshold] of [[10, 24], [20, 56], [30, 96], [40, 136]]) {
        const missed = await f.context.verifierProgression(threshold - 1, questions, "alice");
        assert.equal(missed.succes, false);
        assert.match(missed.message, /1 point/);
        const passed = await f.context.verifierProgression(threshold, questions, "alice");
        assert.equal(passed.succes, true);
        assert.equal(passed.prochaineEtape, questions + 10);
        assert.equal(f.storage.get("max_unlocked_questions:alice"), String(questions + 10));
    }
    assert.equal(f.calls.length, 8);
});

test("la progression est chargée par compte et les erreurs sont propagées", async () => {
    const f = fixture();
    await f.context.chargerProgression("alice");
    assert.equal(f.storage.get("max_unlocked_questions:alice"), "30");
    assert.equal(f.buttons[2].disabled, false);
    await assert.rejects(f.context.verifierProgression(24, 10, "bob"), /invalide/);
    f.context.supabaseRestRequest = async () => { throw new Error("réseau"); };
    await assert.rejects(f.context.verifierProgression(24, 10, "alice"), /réseau/);
});

test("les résultats historiques sont réconciliés avant le chargement du palier", async () => {
    const f = fixture();
    const calls = [];
    f.context.supabaseRestRequest = async (path, options = {}) => {
        calls.push(path);
        if (path === "/rpc/reconcile_user_progress_from_results") {
            return { max_unlocked_questions: 50 };
        }
        if (options.method === "POST") return null;
        return [{ max_unlocked_questions: 50 }];
    };

    await f.context.chargerProgression("alice");

    assert.ok(calls.indexOf("/rpc/reconcile_user_progress_from_results") < calls.findIndex(path => path.includes("select=max_unlocked_questions")));
    assert.equal(f.context.progressionMaximum, 50);
    f.buttons.forEach(button => assert.equal(button.disabled, false));
    f.campaign.forEach(button => assert.equal(button.disabled, false));
});
