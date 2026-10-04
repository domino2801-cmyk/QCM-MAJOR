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
const fetchStart = end + 1;
const fetchEnd = app.indexOf("\nasync function loadQuestionsFromSupabase(", fetchStart);
const fetchSupabaseQuestions = app.slice(fetchStart, fetchEnd);
const loadStart = fetchEnd + 1;
const loadEnd = app.indexOf("\nfunction toSupabaseResultPayload(", loadStart);
const loadQuestionsFromSupabase = app.slice(loadStart, loadEnd);

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

test("le chargement parcourt toutes les pages de questions Supabase", async () => {
    const calls = [];
    const context = {
        supabase: {},
        getStoredSupabaseSession: () => ({ access_token: "candidate-token" }),
        supabaseRestRequest: async (query, options) => {
            calls.push({ query, options });
            const offset = Number(query.match(/offset=(\d+)/)?.[1] || 0);
            const count = Math.min(1000, 1002 - offset);
            return Array.from({ length: count }, (_, index) => {
                const id = offset + index + 1;
                return {
                    id,
                    theme_id: "0",
                    question: `Question ${id}`,
                    answer_1: "A",
                    answer_2: "B",
                    answer_3: "C",
                    answer_4: "D",
                    correct_answer: "C"
                };
            });
        },
        String,
        Number,
        Array,
        Promise,
        setTimeout
    };
    vm.runInNewContext(fetchSupabaseQuestions, context);

    const result = await context.fetchSupabaseQuestions();

    assert.equal(calls.length, 2);
    assert.match(calls[0].query, /order=id\.asc&limit=1000&offset=0$/);
    assert.match(calls[1].query, /order=id\.asc&limit=1000&offset=1000$/);
    assert.equal(calls[0].options.accessToken, "candidate-token");
    assert.equal(result.questions.length, 1002);
    assert.equal(result.questions[1001].id, "1002");
    assert.equal(result.questions[1001].correct, 2);
});

test("un chargement Supabase réussi utilise directement la banque distante sans copier la banque locale", async () => {
    const remoteQuestions = [{ id: "1", themeId: "0", q: "Distante", r: ["A", "B", "C", "D"], correct: 0 }];
    let appliedQuestions;
    let seedCalls = 0;
    const context = {
        supabase: {},
        fetchSupabaseQuestions: async () => ({ questions: remoteQuestions }),
        applyRemoteQuestions: questions => { appliedQuestions = questions; },
        syncQuestionMutation: async () => { seedCalls += 1; },
        console,
        questionSourceReady: false
    };
    vm.runInNewContext(loadQuestionsFromSupabase, context);

    const loaded = await context.loadQuestionsFromSupabase();

    assert.equal(loaded, true);
    assert.equal(context.questionSourceReady, true);
    assert.equal(appliedQuestions, remoteQuestions);
    assert.equal(seedCalls, 0);
});

test("une banque distante vide est chargée sans recopier les questions locales", async () => {
    let appliedQuestions;
    let seedCalls = 0;
    const context = {
        supabase: {},
        fetchSupabaseQuestions: async () => ({ questions: [] }),
        applyRemoteQuestions: questions => { appliedQuestions = questions; },
        syncQuestionMutation: async () => { seedCalls += 1; },
        console,
        questionSourceReady: false
    };
    vm.runInNewContext(loadQuestionsFromSupabase, context);

    const loaded = await context.loadQuestionsFromSupabase();

    assert.equal(loaded, true);
    assert.deepEqual(appliedQuestions, []);
    assert.equal(seedCalls, 0);
});
