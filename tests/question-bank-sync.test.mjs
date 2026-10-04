import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const app = readFileSync(path.join(root, "app.js"), "utf8");
const start = app.indexOf("async function syncQuestionMutation(");
const end = app.indexOf("\nasync function fetchSupabaseQuestions(", start);
assert.notEqual(start, -1);
assert.notEqual(end, -1);
const syncQuestionMutation = app.slice(start, end);

function createHarness(response) {
    const calls = [];
    const context = {
        supabase: {},
        getStoredSupabaseSession: () => ({ access_token: "admin-token" }),
        supabaseRestRequest: async (...args) => {
            calls.push(args);
            if (response instanceof Error) throw response;
            return response;
        },
        encodeURIComponent,
        String,
        Error
    };
    vm.runInNewContext(`${syncQuestionMutation}`, context);
    return { context, calls };
}

const question = {
    id: "client-generated-id",
    themeId: "0",
    q: "Question test",
    r: ["A", "B", "C", "D"],
    correct: 2
};

test("la création laisse Supabase générer l’identifiant et le récupère", async () => {
    const { context, calls } = createHarness([{ id: 734, active: true }]);

    const result = await context.syncQuestionMutation({ action: "create", question });

    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], "/question_bank");
    assert.equal(calls[0][1].method, "POST");
    assert.equal(calls[0][1].prefer, "return=representation");
    assert.equal(calls[0][1].body[0].id, undefined);
    assert.deepEqual(JSON.parse(JSON.stringify(calls[0][1].body[0])), {
        theme_id: "0",
        question: "Question test",
        answer_1: "A",
        answer_2: "B",
        answer_3: "C",
        answer_4: "D",
        correct_answer: "C"
    });
    assert.deepEqual(JSON.parse(JSON.stringify(result)), { created: true, id: "734" });
});

test("la modification demande la ligne réellement modifiée à Supabase", async () => {
    const { context, calls } = createHarness([{ id: 42 }]);

    const result = await context.syncQuestionMutation({
        action: "update",
        id: "42",
        question
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], "/question_bank?id=eq.42");
    assert.equal(calls[0][1].method, "PATCH");
    assert.equal(calls[0][1].prefer, "return=representation");
    assert.deepEqual(JSON.parse(JSON.stringify(result)), { updated: true });
});

test("une modification qui ne touche aucune ligne est signalée comme un échec", async () => {
    const { context } = createHarness([]);

    await assert.rejects(
        context.syncQuestionMutation({ action: "update", id: "missing-id", question }),
        /n’a modifié aucune question/
    );
});

test("une création non confirmée par Supabase est signalée comme un échec", async () => {
    const { context } = createHarness([]);

    await assert.rejects(
        context.syncQuestionMutation({ action: "create", question }),
        /n’a pas confirmé la création/
    );
});
