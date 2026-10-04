import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../ui/Style.css", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const admin = app.slice(app.indexOf("function renderAdminResults("), app.indexOf("function renderAdminQuestionReports("));
const history = app.slice(app.indexOf("function renderCandidateHistory("), app.indexOf("function setTerminalState("));

test("les listes de l'historique et leurs options utilisent un fond blanc et un texte noir", () => {
    assert.match(css, /:is\(\.global-evolution-period, #admin-results-candidate-filter\) \{\s*background: #fff;\s*color: #000;\s*color-scheme: light;/);
    assert.match(css, /:is\(\.global-evolution-period, #admin-results-candidate-filter\) option \{\s*background: #fff;\s*color: #000;/);
});

test("l'administrateur ne dispose plus de suppression individuelle ou globale des notes", () => {
    assert.doesNotMatch(html, /clear-results-btn|Effacer les résultats/);
    assert.doesNotMatch(app, /async function (deleteResult|clearResults)\(/);
    assert.doesNotMatch(admin, /deleteButton|Supprimer|deleteResult/);
    const h = harness();
    vm.runInContext("renderAdminResults()", h.context);
    assert.ok(h.nodes.get("admin-results-table").children.every(row => row.children.length === 4));
});

function element() {
    const classes = new Set();
    return {
        children: [], innerText: "", value: "", style: {},
        set innerHTML(value) { this.children = []; },
        classList: {
            add(value) { classes.add(value); },
            toggle(value, enabled) { if (enabled) classes.add(value); else classes.delete(value); },
            contains(value) { return classes.has(value); }
        },
        append(...children) { this.children.push(...children); },
        appendChild(child) { this.children.push(child); },
        setAttribute() {},
        addEventListener() {}
    };
}

function harness() {
    const nodes = new Map([
        "admin-results-table", "admin-results-candidate-filter", "admin-results-search",
        "admin-history-panel", "admin-history-status", "admin-history-period",
        "admin-history-charts", "admin-history-summary", "admin-history-recommendation",
        "candidate-history-charts", "candidate-history-summary", "candidate-history-recommendation"
    ].map(id => [id, element()]));
    const now = new Date().toISOString();
    const results = [
        { candidateId: "a", email: "a@test.fr", name: "Alpha", theme: "all", score: 18, createdAt: now },
        { candidateId: "a", email: "a@test.fr", name: "Alpha", theme: "1", score: 4, createdAt: now },
        { candidateId: "a", email: "a@test.fr", name: "Alpha", theme: "2", score: 12, createdAt: now },
        { candidateId: "b", name: "Bravo", theme: "all", score: 10, createdAt: now },
        { candidateId: "b", name: "Bravo", theme: "3", score: 6, createdAt: now },
        { candidateId: "a", email: "a@test.fr", name: "Alpha", theme: "5", score: -2, createdAt: "2020-01-01T00:00:00Z" }
    ];
    const context = vm.createContext({
        document: { getElementById: id => nodes.get(id), createElement: element },
        getResults: () => results,
        Option: function (label, value) { this.label = label; this.value = value; }
    });
    vm.runInContext(history + admin, context);
    return { nodes, context };
}

test("le filtre administrateur isole le graphique et le thème à travailler de chaque candidat", () => {
    const h = harness();
    const filter = h.nodes.get("admin-results-candidate-filter");
    filter.value = "a@test.fr";
    vm.runInContext("renderAdminResults()", h.context);
    assert.match(h.nodes.get("admin-history-summary").innerText, /1 résultat.*Moyenne Campagne Globale : 18\.00/);
    assert.match(h.nodes.get("admin-history-recommendation").innerText, /Thème 5/);
    assert.equal(h.nodes.get("admin-history-charts").children[0].children[1].children.length, 1);
    assert.equal(h.nodes.get("admin-results-table").children.length, 4);
    filter.value = "b";
    vm.runInContext("renderAdminResults()", h.context);
    assert.match(h.nodes.get("admin-history-summary").innerText, /1 résultat.*Moyenne Campagne Globale : 10\.00/);
    assert.match(h.nodes.get("admin-history-recommendation").innerText, /Thème 3/);
    assert.equal(h.nodes.get("admin-results-table").children.length, 2);
    assert.equal(h.nodes.get("candidate-history-charts").children.length, 0);
});

test("la période recalcule les indicateurs sans supprimer des lignes du tableau", () => {
    const h = harness();
    h.nodes.get("admin-results-candidate-filter").value = "a@test.fr";
    h.nodes.get("admin-history-period").value = "7";
    vm.runInContext("renderAdminResults()", h.context);
    assert.match(h.nodes.get("admin-history-summary").innerText, /1 résultat.*18\.00/);
    assert.match(h.nodes.get("admin-history-recommendation").innerText, /Thème 1/);
    assert.equal(h.nodes.get("admin-results-table").children.length, 4);
});

test("tous les candidats ou une sélection disparue ne conserve pas une recommandation individuelle", () => {
    const h = harness();
    h.nodes.get("admin-results-candidate-filter").value = "a@test.fr";
    vm.runInContext("renderAdminResults()", h.context);
    for (const value of ["", "supprime"]) {
        h.nodes.get("admin-results-candidate-filter").value = value;
        vm.runInContext("renderAdminResults()", h.context);
        assert.equal(h.nodes.get("admin-history-panel").classList.contains("hidden"), true);
        assert.match(h.nodes.get("admin-history-status").innerText, /Sélectionnez un candidat/);
        assert.equal(h.nodes.get("admin-results-table").children.length, 6);
        assert.doesNotMatch(h.nodes.get("admin-history-recommendation").innerText, /Thème 5/);
    }
});

test("le rendu candidat conserve son filtrage personnel et les mêmes indicateurs", () => {
    const h = harness();
    vm.runInContext('renderCandidateHistory(getResults(), "b")', h.context);
    assert.match(h.nodes.get("candidate-history-summary").innerText, /1 résultat.*Moyenne Campagne Globale : 10\.00/);
    assert.match(h.nodes.get("candidate-history-recommendation").innerText, /Thème 3/);
});

test("le nouveau thème implantation peut devenir le thème à travailler", () => {
    const h = harness();
    vm.runInContext('renderCandidateHistory([{candidateId:"a",theme:"6",score:3}], "a")', h.context);
    assert.match(h.nodes.get("candidate-history-recommendation").innerText, /Thème 6 • Implantation des unités.*3\.00/);
});

test("la moyenne porte uniquement sur les campagnes globales de la période et conserve les notes négatives", () => {
    const h = harness();
    h.context.results = [
        { candidateId: "a", theme: "all", score: -4, createdAt: new Date().toISOString() },
        { candidateId: "a", theme: "all", score: 16, createdAt: new Date().toISOString() },
        { candidateId: "a", theme: "all", score: 20, createdAt: "2020-01-01T00:00:00Z" },
        { candidateId: "a", theme: "1", score: 20, createdAt: new Date().toISOString() }
    ];
    vm.runInContext('renderCandidateHistory(results, "a", "", 7)', h.context);
    assert.match(h.nodes.get("candidate-history-summary").innerText, /2 résultat.*6\.00/);
    vm.runInContext('renderCandidateHistory(results.filter(r => r.theme !== "all"), "a")', h.context);
    assert.equal(h.nodes.get("candidate-history-summary").innerText, "Aucun résultat de Campagne Globale sur cette période.");
    assert.match(h.nodes.get("candidate-history-recommendation").innerText, /Thème 1/);
});
