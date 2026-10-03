import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { getQuestionTheme, reconcileQuestionThemes } from "../modules/questions-bank/theme-concordance.js";

const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const bank = readFileSync(new URL("../modules/questions-bank/index.js", import.meta.url), "utf8");
const theme = readFileSync(new URL("../modules/questions-bank/theme-6.js", import.meta.url), "utf8");
const locations = readFileSync(new URL("../modules/questions-bank/unit-locations.js", import.meta.url), "utf8").replace(/export /g, "");

test("le thème 6 vide est disponible côté candidat et administrateur avec les bons identifiants", () => {
    assert.match(html, /value="6">6\. Implantation des unités/);
    assert.match(html, /value="5">6\. Implantation des unités/);
    assert.match(bank, /"5": deduplicateTheme\(theme6\)/);
    assert.match(theme, /questions: \[\]/);
    assert.match(app, /6: "6\. Implantation des unités"/);
    assert.match(app, /startButton\.disabled = getQuestionPool\(themeId\)\.length === 0/);
    assert.match(app, /startButton\.disabled = maxAllowed === 0/);
});

test("les questions du nouveau thème rejoignent la campagne globale après leur ajout", () => {
    const source = bank.replace(/^import .*;$/gm, "").replace(/export /g, "");
    const context = vm.createContext({
        theme1: { questions: [] }, theme2: { questions: [] }, theme3: { questions: [] },
        theme4: { questions: [] }, theme5: { questions: [] }, theme6: { questions: [] },
        reconcileQuestionThemes
    });
    vm.runInContext(locations + source, context);
    assert.equal(vm.runInContext("getAllQuestions().length", context), 0);
    vm.runInContext('questionsBank["5"].questions.push({q:"Question implantation",r:["A","B","C","D"],correct:0})', context);
    assert.equal(vm.runInContext("getAllQuestions()[0].q", context), "Question implantation");
});

test("les implantations sont retirées des autres thèmes sans modifier les réponses ni les identifiants", () => {
    const context = vm.createContext({});
    vm.runInContext(locations, context);
    context.bank = {
        "0": { questions: [
            { id: "location", q: "Où est implanté le 35e RI ?", r: ["A", "B", "C", "D"], correct: 2 },
            { id: "museum", q: "En 2025, le Musée de l'armée implanté aux Invalides fête ses ?", r: ["A"], correct: 0 }
        ] },
        "4": { questions: [{ q: "Où est implanté le 35e RI ?", r: ["A", "B", "C", "D"], correct: 2 }] },
        "5": { questions: [] }
    };
    const original = context.bank["0"].questions[0];
    vm.runInContext("moveUnitLocationQuestions(bank); moveUnitLocationQuestions(bank)", context);
    assert.equal(context.bank["0"].questions.length, 1);
    assert.equal(context.bank["4"].questions.length, 0);
    assert.equal(context.bank["5"].questions.length, 1);
    assert.equal(context.bank["5"].questions[0], original);
});

test("les variantes d'implantation sont reconnues sans déplacer les missions ou l'organigramme", () => {
    const context = vm.createContext({});
    vm.runInContext(locations, context);
    for (const q of [
        "Le Regiment medical est implante à ...",
        "Où est stationnée l'École des drones ?",
        "Le centre des transports et transits de surface (CTTS) est basé",
        "Laquelle de ces localités n'est pas une garnison de la Légion étrangère ?",
        "Dans quelle ville se trouve l'EM de la 2e Brigade Blindee ?",
        "La DGSE verra son siège déplacé à :",
        "Le grand quartier général (SHAPE) est installé à :",
        "Lequel de ces États n'accueille pas de forces françaises de présence ?"
    ]) {
        context.q = q;
        assert.equal(vm.runInContext("isUnitLocationQuestion(q)", context), true, q);
    }
    for (const q of [
        "Dans quel axe de l'organigramme se situe la STAT ?",
        "Où se déroule la mission Lynx ?",
        "En 2025, le Musée de l'armée implanté aux Invalides fête ses ?"
    ]) {
        context.q = q;
        assert.equal(vm.runInContext("isUnitLocationQuestion(q)", context), false, q);
    }
});

test("les banques locales respectent le classement d'implantation et ses exceptions historiques", () => {
    const context = vm.createContext({ reconcileQuestionThemes, getQuestionTheme });
    vm.runInContext(locations, context);
    for (let i = 0; i < 5; i++) {
        const importedQuestions = vm.runInNewContext(
            readFileSync(new URL(`../modules/questions-bank/q-imported-${i}.js`, import.meta.url), "utf8").replace("export default", "")
        );
        const body = readFileSync(new URL(`../modules/questions-bank/theme-${i + 1}.js`, import.meta.url), "utf8")
            .replace(/^import .*;$/gm, "").replace("export default", "").trim().replace(/;$/, "");
        context[`theme${i + 1}`] = vm.runInNewContext(`(${body})`, { importedQuestions });
    }
    context.theme6 = { questions: [] };
    vm.runInContext(bank.replace(/^import .*;$/gm, "").replace(/export /g, ""), context);
    assert.ok(vm.runInContext('questionsBank["5"].questions.length > 0', context));
    assert.equal(vm.runInContext('Object.entries(questionsBank).some(([id,theme]) => theme.questions.some(q => getQuestionTheme(q, id) !== id))', context), false);
    assert.equal(vm.runInContext('questionsBank["5"].questions.every(q => getQuestionTheme(q, "0") === "5")', context), true);
});

test("les questions distantes et les anciennes copies locales sont reclassées avec les mêmes identifiants", () => {
    const context = vm.createContext({
        questionsBank: { "0": { questions: [] }, "5": { questions: [] } },
        normalizeQuestionAnswers: answers => answers,
        reconcileQuestionThemes,
        getQuestionOverrides: () => ({
            "0": [{ id: "legacy", q: "Où est implanté le 35e RI ?", r: ["A", "B", "C", "D"], correct: 1 }]
        })
    });
    vm.runInContext(locations + app.slice(app.indexOf("function applyQuestionOverrides("), app.indexOf("async function syncQuestionMutation(")), context);
    vm.runInContext("applyQuestionOverrides()", context);
    assert.equal(context.questionsBank["0"].questions.length, 0);
    assert.equal(context.questionsBank["5"].questions[0].id, "legacy");
    context.remote = [{ id: "remote", themeId: "0", q: "Où est implanté le 35e RI ?", r: ["A", "B", "C", "D"], correct: 1 }];
    vm.runInContext("applyRemoteQuestions(remote)", context);
    assert.equal(context.questionsBank["0"].questions.length, 0);
    assert.equal(context.questionsBank["5"].questions[0].id, "remote");
});

test("un thème vide affiche une explication au candidat", () => {
    const status = { innerText: "", classList: { remove() {} } };
    const context = vm.createContext({
        document: { getElementById: () => status },
        getQuestionPool: () => [],
        currentAuthenticatedAccount: null, currentCandidateEmail: "",
        getQuestionHistory: () => ({}), normalizeQuestionHistoryKey: value => value
    });
    vm.runInContext(app.slice(app.indexOf("function updateQuestionRotationStatus("), app.indexOf("function setConnectionStatus(")), context);
    vm.runInContext('updateQuestionRotationStatus("6")', context);
    assert.match(status.innerText, /Aucune question disponible/);
});
