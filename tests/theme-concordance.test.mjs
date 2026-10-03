import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { themeAssignments } from "../modules/questions-bank/theme-assignments.js";
import { getQuestionTheme, reconcileQuestionThemes } from "../modules/questions-bank/theme-concordance.js";
import { questionsBank, getAllQuestions } from "../modules/questions-bank/index.js";

const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/20261003190000_reconcile_question_themes.sql", import.meta.url), "utf8");
const emptyBank = () => Object.fromEntries(Array.from({ length: 6 }, (_, i) => [String(i), { questions: [] }]));

function auditedQuestion(id) {
    const [, , q, r = ["A", "B", "C", "D"]] = themeAssignments.find(row => row[0] === id);
    return { id, q, r, correct: 1 };
}

test("les sujets principaux sont reclassés dans chacun des six thèmes", () => {
    const examples = [
        [387, "0"], [104, "0"], [1239, "0"], [376, "1"], [27, "1"],
        [47, "2"], [435, "2"], [855, "2"], [32, "3"], [849, "3"],
        [38, "4"], [271, "4"], [56, "4"], [1075, "5"], [1195, "5"]
    ];
    for (const [id, expected] of examples) {
        assert.equal(getQuestionTheme(auditedQuestion(id), "4"), expected, `question ${id}`);
    }
});

test("une localisation accessoire ne détourne pas une question historique ou d'organisation", () => {
    assert.equal(getQuestionTheme(auditedQuestion(596), "5"), "4");
    assert.equal(getQuestionTheme(auditedQuestion(755), "5"), "0");
    assert.equal(getQuestionTheme({ q: "Où se déroule la mission Lynx ?" }, "3"), "3");
});

test("les intitulés génériques sont classés par leurs réponses, pas par leur seul texte", () => {
    for (const id of [58, 72]) {
        const question = auditedQuestion(id);
        assert.equal(getQuestionTheme(question, "0"), "1");
        assert.equal(getQuestionTheme({ ...question, r: ["Paris", "Lyon", "Nice", "Metz"] }, "4"), "4");
    }
    const question = auditedQuestion(376);
    assert.equal(getQuestionTheme({ ...question, q: `  ${question.q.toUpperCase()}  ` }, "4"), "1");
});

test("les questions nouvelles et la démonstration ne sont ni réécrites ni supprimées", () => {
    assert.equal(getQuestionTheme({ q: "Nouvelle question administrative" }, "2"), "2");
    assert.equal(getQuestionTheme({ q: "Your question", r: ["First answer"] }, "1"), "1");
    assert.equal(getQuestionTheme({ q: "Où est implantée une nouvelle unité ?" }, "4"), "5");
});

test("le reclassement conserve tous les objets et leurs données, même les doublons", () => {
    const bank = emptyBank();
    const original = [auditedQuestion(376), auditedQuestion(376), auditedQuestion(1195), auditedQuestion(596)];
    bank["4"].questions.push(...original.slice(0, 3));
    bank["5"].questions.push(original[3]);
    const before = JSON.stringify(original);
    reconcileQuestionThemes(bank);
    assert.deepEqual(bank["1"].questions, original.slice(0, 2));
    assert.equal(bank["5"].questions[0], original[2]);
    assert.equal(bank["4"].questions[0], original[3]);
    assert.equal(Object.values(bank).flatMap(theme => theme.questions).length, original.length);
    assert.equal(JSON.stringify(original), before);
    const first = JSON.stringify(bank);
    reconcileQuestionThemes(bank);
    assert.equal(JSON.stringify(bank), first);
});

test("une destination absente échoue explicitement sans modifier la banque", () => {
    const bank = { "4": { questions: [auditedQuestion(376)] } };
    const before = JSON.stringify(bank);
    assert.throws(() => reconcileQuestionThemes(bank), /destination absent/);
    assert.equal(JSON.stringify(bank), before);
});

test("la banque locale et la campagne globale conservent leur couverture et leurs réponses", () => {
    const sourceBank = emptyBank();
    for (let i = 0; i < 5; i++) {
        const importedQuestions = vm.runInNewContext(readFileSync(
            new URL(`../modules/questions-bank/q-imported-${i}.js`, import.meta.url), "utf8"
        ).replace("export default", ""));
        const body = readFileSync(new URL(`../modules/questions-bank/theme-${i + 1}.js`, import.meta.url), "utf8")
            .replace(/^import .*;$/gm, "").replace("export default", "").trim().replace(/;$/, "");
        sourceBank[String(i)] = vm.runInNewContext(`(${body})`, { importedQuestions });
    }
    const key = question => question.q.trim().replace(/\s+/g, " ").toLowerCase();
    const originalByTitle = new Map();
    for (const theme of Object.values(sourceBank)) {
        for (const question of theme.questions) {
            const variants = originalByTitle.get(key(question)) || new Set();
            variants.add(JSON.stringify(question));
            originalByTitle.set(key(question), variants);
        }
    }
    assert.deepEqual(new Set(getAllQuestions().map(key)), new Set(originalByTitle.keys()));
    for (const [themeId, theme] of Object.entries(questionsBank)) {
        for (const question of theme.questions) {
            assert.equal(getQuestionTheme(question, themeId), themeId, question.q);
            assert.ok(originalByTitle.get(key(question)).has(JSON.stringify(question)), question.q);
        }
    }
});

test("Supabase et les anciennes copies locales utilisent les mêmes affectations", () => {
    const bank = emptyBank();
    const context = vm.createContext({
        questionsBank: bank, reconcileQuestionThemes,
        normalizeQuestionAnswers: answers => answers,
        getQuestionOverrides: () => ({ "4": [auditedQuestion(376), auditedQuestion(1195)] })
    });
    vm.runInContext(app.slice(app.indexOf("function applyQuestionOverrides("), app.indexOf("async function syncQuestionMutation(")), context);
    vm.runInContext("applyQuestionOverrides()", context);
    assert.equal(bank["1"].questions[0].id, 376);
    assert.equal(bank["5"].questions[0].id, 1195);
    context.remote = [376, 1195, 596].map(id => ({ ...auditedQuestion(id), themeId: "4" }));
    vm.runInContext("applyRemoteQuestions(remote)", context);
    assert.equal(bank["1"].questions[0].id, 376);
    assert.equal(bank["5"].questions[0].id, 1195);
    assert.equal(bank["4"].questions[0].id, 596);
    assert.equal(Object.values(bank).flatMap(theme => theme.questions).length, 3);
});

test("la migration correspond exactement aux affectations auditées et ne modifie que theme_id", () => {
    const rows = [...migration.matchAll(/^\s*\((\d+), (\d+), (\d+), '((?:''|[^'])*)'\)[,;]$/gm)];
    const expected = themeAssignments.filter(([id]) => id !== null);
    assert.equal(rows.length, 752);
    assert.equal(rows.length, expected.length);
    assert.equal(new Set(rows.map(row => row[1])).size, rows.length);
    for (const [, id, previous, target, escapedTitle] of rows) {
        const title = escapedTitle.replace(/''/g, "'");
        const assignment = expected.find(row => row[0] === Number(id));
        assert.deepEqual(assignment.slice(0, 3), [Number(id), Number(target), title]);
        assert.equal(getQuestionTheme({ q: title, r: assignment[3] }, previous), target);
    }
    assert.match(migration, /BEGIN;/);
    assert.match(migration, /COMMIT;/);
    assert.match(migration, /RAISE EXCEPTION/);
    assert.match(migration, /q\.question IS DISTINCT FROM a\.expected_question/);
    assert.match(migration, /q\.theme_id NOT IN \(a\.previous_theme, a\.target_theme\)/);
    assert.match(migration, /SET theme_id = a\.target_theme/);
    assert.doesNotMatch(migration, /UPDATE public\.quiz_results|DELETE FROM|SET (?:question|answer|active|id)\b/i);
});

function adminFormFixture({ editing = false, fail = false } = {}) {
    const bank = emptyBank();
    const question = auditedQuestion(68);
    if (editing) bank["0"].questions.push({ ...question, id: "preserved-id" });
    const fields = {
        "admin-question-theme": { value: "0", selectedOptions: [{ textContent: "2. Matériels, Armements et Technologies" }] },
        "admin-question-text": { value: question.q },
        "admin-correct-answer": { value: String(question.correct) },
        ...Object.fromEntries(question.r.map((value, i) => [`admin-answer-${i + 1}`, { value }]))
    };
    const mutations = [];
    const saved = [];
    const messages = [];
    let handler;
    const context = vm.createContext({
        questionsBank: bank, editingQuestionIndex: editing ? 0 : null,
        questionSourceReady: true, getQuestionTheme,
        document: { getElementById(id) {
            if (id === "question-form") return { addEventListener: (_, callback) => { handler = callback; } };
            return fields[id];
        } },
        createRecordId: () => "created-id",
        syncQuestionMutation: async payload => {
            mutations.push(payload);
            if (fail) throw new Error("Refus Supabase");
            return { created: true, updated: true };
        },
        saveCurrentThemeQuestions: id => saved.push(id),
        resetQuestionForm: () => { context.editingQuestionIndex = null; messages.push(""); },
        setAuthMessage: (_, message) => messages.push(message),
        renderAdminQuestions: () => {}
    });
    const start = app.indexOf('document.getElementById("question-form").addEventListener(');
    const end = app.indexOf('document.getElementById("close-app")', start);
    vm.runInContext(app.slice(start, end), context);
    return { bank, fields, mutations, saved, messages, run: () => handler({ preventDefault() {} }) };
}

test("l'ajout administrateur synchronise directement le thème concordant et affiche le reclassement", async () => {
    const fixture = adminFormFixture();
    await fixture.run();
    assert.equal(fixture.mutations[0].question.themeId, "1");
    assert.equal(fixture.bank["0"].questions.length, 0);
    assert.equal(fixture.bank["1"].questions[0].id, "created-id");
    assert.deepEqual(fixture.saved, ["0", "1"]);
    assert.equal(fixture.fields["admin-question-theme"].value, "1");
    assert.match(fixture.messages.at(-1), /reclassée/);
});

test("l'édition administrateur déplace la question sans changer son identifiant", async () => {
    const fixture = adminFormFixture({ editing: true });
    await fixture.run();
    assert.equal(fixture.mutations[0].action, "update");
    assert.equal(fixture.mutations[0].question.themeId, "1");
    assert.equal(fixture.bank["0"].questions.length, 0);
    assert.equal(fixture.bank["1"].questions[0].id, "preserved-id");
});

test("un refus Supabase ne déplace ni ne sauvegarde la question administrateur", async () => {
    const fixture = adminFormFixture({ editing: true, fail: true });
    await fixture.run();
    assert.equal(fixture.bank["0"].questions[0].id, "preserved-id");
    assert.equal(fixture.bank["1"].questions.length, 0);
    assert.deepEqual(fixture.saved, []);
    assert.match(fixture.messages.at(-1), /Enregistrement impossible.*Refus Supabase/);
});
