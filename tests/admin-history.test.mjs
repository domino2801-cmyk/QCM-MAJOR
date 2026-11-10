import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../ui/Style.css", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const modeMigration = readFileSync(
    new URL("../supabase/migrations/20261017100000_add_quiz_feedback_mode.sql", import.meta.url),
    "utf8"
);
const admin = app.slice(app.indexOf("const deletableResultEmail ="), app.indexOf("function renderAdminQuestionReports("));
const history = app.slice(app.indexOf("function renderCandidateHistory("), app.indexOf("function setTerminalState("));

test("les filtres de l'historique et leurs options utilisent un fond gris et un texte clair", () => {
    assert.match(css, /:is\(\.global-evolution-period, #admin-results-candidate-filter\) \{\s*background: #343b43;\s*color: #e2e6eb;\s*color-scheme: dark;/);
    assert.match(css, /:is\(\.global-evolution-period, #admin-results-candidate-filter\) option \{\s*background: #343b43;\s*color: #e2e6eb;/);
    assert.match(html, /id="admin-history-milestone"/);
    assert.match(html, /Août — objectif &gt; 90 %/);
    assert.match(html, /admin-theme-acquisition/);
});

test("la suppression d'un résultat reste réservée au compte domino2801@gmail.com", () => {
    assert.doesNotMatch(html, /clear-results-btn|Effacer les résultats/);
    assert.doesNotMatch(app, /async function (deleteResult|clearResults)\(/);
    assert.match(admin, /deletableResultEmail = "domino2801@gmail\.com"/);
    assert.doesNotMatch(admin, /Résultat supprimé de Supabase/);

    const now = new Date().toISOString();
    const h = harness([
        { id: "r1", candidateId: "a", email: "a@test.fr", name: "Alpha", theme: "all", score: 18, createdAt: now },
        { id: "r2", candidateId: "dom", email: "domino2801@gmail.com", name: "Domino", theme: "all", score: 20, createdAt: now }
    ]);
    vm.runInContext("renderAdminResults()", h.context);
    const rows = h.nodes.get("admin-results-table").children;
    assert.equal(rows.length, 2);
    assert.ok(rows.every(row => row.children.length === 5));
    assert.equal(rows[0].children[4].children.length, 0);
    assert.equal(rows[1].children[4].children.length, 1);
    assert.equal(rows[1].children[4].children[0].innerText, "Supprimer");
});

function element() {
    const classes = new Set();
    return {
        children: [], innerText: "", value: "", style: {},
        dataset: {},
        set innerHTML(value) { this.children = []; },
        classList: {
            add(value) { classes.add(value); },
            toggle(value, enabled) { if (enabled) classes.add(value); else classes.delete(value); },
            contains(value) { return classes.has(value); }
        },
        append(...children) { this.children.push(...children); },
        appendChild(child) { this.children.push(child); },
        replaceChildren(...children) { this.children = children; },
        attributes: {},
        setAttribute(name, value) { this.attributes[name] = value; },
        getAttribute(name) { return this.attributes[name] || null; },
        addEventListener() {}
    };
}

function harness(customResults) {
    const nodes = new Map([
        "admin-results-table", "admin-results-candidate-filter", "admin-results-search",
        "admin-history-panel", "admin-history-status", "admin-history-period", "admin-history-progression",
        "admin-history-milestone", "admin-theme-acquisition",
        "admin-history-charts", "admin-history-summary", "admin-history-recommendation",
        "admin-history-theme-summary", "admin-history-activity", "admin-history-timeline",
        "candidate-history-charts", "candidate-history-summary", "candidate-history-recommendation",
        "candidate-history-modes"
    ].map(id => [id, element()]));
    const now = new Date().toISOString();
    const results = customResults || [
        { candidateId: "a", email: "a@test.fr", name: "Alpha", theme: "all", score: 18, createdAt: now },
        { candidateId: "a", email: "a@test.fr", name: "Alpha", theme: "1", score: 4, createdAt: now },
        { candidateId: "a", email: "a@test.fr", name: "Alpha", theme: "2", score: 12, createdAt: now },
        { candidateId: "b", name: "Bravo", theme: "all", score: 10, createdAt: now },
        { candidateId: "b", name: "Bravo", theme: "3", score: 6, createdAt: now },
        { candidateId: "a", email: "a@test.fr", name: "Alpha", theme: "5", score: -2, createdAt: "2020-01-01T00:00:00Z" }
    ];
    const context = vm.createContext({
        candidateHistoryCategory: "combat",
        getAdminListPage: (_, items) => items,
        labelAdminRow: () => {},
        document: { getElementById: id => nodes.get(id), createElement: element },
        getResults: () => results,
        getAccounts: () => ({}),
        supabase: {},
        getStoredSupabaseSession: () => ({ access_token: "admin-token" }),
        supabaseRestRequest: async () => candidateTracking(10),
        console,
        Option: function (label, value) { this.label = label; this.value = value; }
    });
    vm.runInContext(history + admin, context);
    return { nodes, context };
}

function candidateTracking(maximum) {
    return {
        progress: { max_unlocked_questions: maximum },
        progress_events: [],
        documents: [],
        submissions: [],
        signalements: []
    };
}

test("le journal affiche le palier enregistré et propose les candidats sans résultat", async () => {
    const h = harness();
    h.context.getAccounts = () => ({
        "c@test.fr": { id: "c", email: "c@test.fr", name: "Charlie" }
    });
    const calls = [];
    h.context.supabaseRestRequest = async (path, options) => {
        calls.push({ path, id: options.body.p_user_id });
        return candidateTracking(options.body.p_user_id === "a" ? 50 : 10);
    };

    h.nodes.get("admin-results-candidate-filter").value = "a@test.fr";
    vm.runInContext("renderAdminResults()", h.context);
    await new Promise(resolve => setImmediate(resolve));
    assert.match(h.nodes.get("admin-history-progression").innerText, /^Palier enregistré : 50 questions\./);
    assert.ok(h.nodes.get("admin-results-candidate-filter").children.some(option => option.value === "c@test.fr"));

    h.nodes.get("admin-results-candidate-filter").value = "c@test.fr";
    vm.runInContext("renderAdminResults()", h.context);
    await new Promise(resolve => setImmediate(resolve));
    assert.match(h.nodes.get("admin-history-progression").innerText, /^Palier enregistré : 10 questions\./);
    assert.deepEqual(calls.map(call => call.id), ["a", "c"]);
    assert.ok(calls.every(call => call.path === "/rpc/get_admin_candidate_tracking"));
});

test("les résultats avec ou sans e-mail sont regroupés par identifiant de compte", async () => {
    const now = new Date().toISOString();
    const h = harness([
        { candidateId: "a", email: "", name: "Alpha", theme: "all", score: 18, createdAt: now },
        { candidateId: "a", email: "A@TEST.FR", name: "Alpha", theme: "1", score: 12, createdAt: now },
        { candidateId: "b", email: "", name: "Bravo", theme: "all", score: 10, createdAt: now }
    ]);
    h.context.getAccounts = () => ({
        a: { id: "a", email: "a@test.fr", name: "Alpha" },
        b: { id: "b", email: "b@test.fr", name: "Bravo" }
    });
    const calls = [];
    h.context.supabaseRestRequest = async (_, options) => {
        calls.push(options.body.p_user_id);
        return candidateTracking(50);
    };

    h.nodes.get("admin-results-candidate-filter").value = "a@test.fr";
    vm.runInContext("renderAdminResults()", h.context);
    await new Promise(resolve => setImmediate(resolve));
    const options = h.nodes.get("admin-results-candidate-filter").children;
    assert.deepEqual(options.map(option => option.value), ["", "a@test.fr", "b@test.fr"]);
    assert.equal(h.nodes.get("admin-results-table").children.length, 2);
    assert.match(h.nodes.get("admin-history-summary").innerText, /1 résultat.*18\.00/);
    assert.match(h.nodes.get("admin-history-progression").innerText, /^Palier enregistré : 50 questions\./);
    assert.deepEqual(calls, ["a"]);

    h.nodes.get("admin-results-candidate-filter").value = "b@test.fr";
    vm.runInContext("renderAdminResults()", h.context);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(h.nodes.get("admin-results-table").children.length, 1);
    assert.deepEqual(calls, ["a", "b"]);
});

test("un e-mail partagé ne fusionne pas deux identifiants distincts", () => {
    const h = harness([
        { candidateId: "b", email: "a@test.fr", name: "Bravo", theme: "all", score: 10, createdAt: new Date().toISOString() }
    ]);
    h.context.getAccounts = () => ({ a: { id: "a", email: "a@test.fr", name: "Alpha" } });
    h.nodes.get("admin-results-candidate-filter").value = "a@test.fr";
    vm.runInContext("renderAdminResults()", h.context);
    assert.equal(h.nodes.get("admin-results-table").children.length, 0);
    assert.ok(h.nodes.get("admin-results-candidate-filter").children.some(option => option.value === "b"));
});

test("un changement de candidat ignore une réponse de progression arrivée en retard", async () => {
    const h = harness();
    let finishFirst;
    h.context.supabaseRestRequest = (_, options) => options.body.p_user_id === "a"
        ? new Promise(resolve => { finishFirst = resolve; })
        : Promise.resolve(candidateTracking(20));

    h.nodes.get("admin-results-candidate-filter").value = "a@test.fr";
    vm.runInContext("renderAdminResults()", h.context);
    h.nodes.get("admin-results-candidate-filter").value = "b";
    vm.runInContext("renderAdminResults()", h.context);
    await new Promise(resolve => setImmediate(resolve));
    finishFirst(candidateTracking(50));
    await new Promise(resolve => setImmediate(resolve));
    assert.match(h.nodes.get("admin-history-progression").innerText, /^Palier enregistré : 20 questions\./);
});

test("les erreurs de lecture de progression sont visibles", async () => {
    const h = harness();
    h.context.console = { warn() {} };
    h.context.supabaseRestRequest = async () => { throw new Error("réseau"); };
    h.nodes.get("admin-results-candidate-filter").value = "a@test.fr";
    vm.runInContext("renderAdminResults()", h.context);
    await new Promise(resolve => setImmediate(resolve));
    assert.match(h.nodes.get("admin-history-progression").innerText, /indisponible/);
});

test("la fiche affiche une moyenne et une tendance numérique par thème", () => {
    const now = Date.now();
    const results = [5, 6, 7, 10, 11, 12].map((score, index) => ({
        candidateId: "a",
        theme: "1",
        score,
        createdAt: new Date(now - (6 - index) * 1000).toISOString()
    }));
    const h = harness(results);

    vm.runInContext("renderAdminThemeSummary(getResults(), 0)", h.context);

    const themeCard = h.nodes.get("admin-history-theme-summary").children[1];
    assert.match(themeCard.children[1].innerText, /6 série\(s\) · moyenne 8\.50 \/ 20/);
    assert.equal(themeCard.children[2].innerText, "Tendance : +5.00 pt");
});

test("la chronologie commune ordonne les événements et les borne à la période choisie", () => {
    const recent = Date.now();
    const old = "2020-01-01T00:00:00.000Z";
    const results = [
        { candidateId: "a", theme: "all", score: 18, createdAt: new Date(recent - 1000).toISOString() },
        { candidateId: "a", theme: "all", score: 2, createdAt: old }
    ];
    const h = harness(results);
    h.context.tracking = {
        progress_events: [
            {
                event_type: "module_started",
                module_id: "2",
                dossier: null,
                created_at: new Date(recent - 6000).toISOString()
            },
            {
                event_type: "dossier_completed",
                module_id: "3",
                dossier: 8,
                created_at: new Date(recent - 5500).toISOString()
            },
            {
                event_type: "correction_accessible",
                module_id: "4",
                dossier: 8,
                created_at: new Date(recent - 5000).toISOString()
            }
        ],
        documents: [{
            event_type: "open",
            document_title: "Aide-mémoire",
            module_id: "2",
            opened_at: new Date(recent - 3000).toISOString()
        }],
        submissions: [{ dossier: 4, created_at: new Date(recent - 2000).toISOString() }],
        signalements: [{
            incident_type: "Correction",
            module_id: "3",
            resource: "Fiche 3",
            priority: "Information",
            status: "pending",
            created_at: new Date(recent - 4000).toISOString()
        }]
    };
    h.context.questionReports = [{
        reporter_id: "a",
        quiz_theme: "1",
        status: "resolved",
        details: "ne pas exposer ce commentaire",
        created_at: new Date(recent - 500).toISOString()
    }];

    vm.runInContext('renderAdminTrackingTimeline(getResults(), tracking, 7, "a")', h.context);

    const events = h.nodes.get("admin-history-timeline").children;
    assert.equal(events.length, 8);
    assert.match(events[0].children[0].innerText, /QCM-MAJOR — Signalement d’une question/);
    assert.match(events[1].children[0].innerText, /QCM-MAJOR — Résultat Campagne globale/);
    assert.match(events[2].children[0].innerText, /DOCTRINE — Transmission d’une fiche/);
    assert.match(events[3].children[1].innerText, /Aide-mémoire · module 2/);
    assert.match(events[4].children[1].innerText, /Information · en attente/);
    assert.match(events[5].children[0].innerText, /DOCTRINE — Corrigé rendu accessible/);
    assert.match(events[6].children[0].innerText, /DOCTRINE — Dossier marqué « Fait »/);
    assert.match(events[7].children[0].innerText, /DOCTRINE — Module commencé/);
    assert.doesNotMatch(events.map(event => event.children.map(child => child.innerText).join(" ")).join(" "), /ne pas exposer ce commentaire/);
    assert.match(h.nodes.get("admin-history-activity").children[0].children[2].innerText, /1 série\(s\).*18\.00/);
});

test("la lecture du palier est réservée aux administrateurs", () => {
    const migration = readFileSync(new URL("../supabase/migrations/20261108195000_admin_candidate_progress.sql", import.meta.url), "utf8");
    assert.match(migration, /security definer[\s\S]*Administrator access required/);
    assert.match(migration, /auth\.jwt\(\) -> 'app_metadata'/);
    assert.match(migration, /revoke all on function public\.get_admin_candidate_progress\(uuid\) from public, anon/);
});

test("le filtre administrateur isole le graphique et le thème à travailler de chaque candidat", () => {
    const h = harness();
    const filter = h.nodes.get("admin-results-candidate-filter");
    filter.value = "a@test.fr";
    vm.runInContext("renderAdminResults()", h.context);
    assert.match(h.nodes.get("admin-history-summary").innerText, /1 résultat.*Moyenne Campagne Globale : 18\.00/);
    assert.equal(h.nodes.get("admin-history-recommendation").innerText, "Thème à travailler\nHistoire & Traditions");
    assert.equal(h.nodes.get("admin-history-charts").children.length, 7);
    assert.equal(h.nodes.get("admin-history-charts").children[0].children[1].children.length, 1);
    assert.equal(h.nodes.get("admin-results-table").children.length, 4);
    filter.value = "b";
    vm.runInContext("renderAdminResults()", h.context);
    assert.match(h.nodes.get("admin-history-summary").innerText, /1 résultat.*Moyenne Campagne Globale : 10\.00/);
    assert.equal(h.nodes.get("admin-history-recommendation").innerText, "Thème à travailler\nLois de Programmation Militaire");
    assert.equal(h.nodes.get("admin-results-table").children.length, 2);
    assert.equal(h.nodes.get("candidate-history-charts").children.length, 0);
});

test("la date du tableau admin correspond à la date de jeu enregistrée", () => {
    const playedAt = "2024-03-05T14:06:07.000Z";
    const h = harness([{
        id: "r1",
        candidateId: "a",
        email: "a@test.fr",
        name: "Alpha",
        theme: "all",
        score: 18,
        date: "27/10/2026 05:00:00",
        createdAt: playedAt
    }]);

    vm.runInContext("renderAdminResults()", h.context);

    assert.equal(
        h.nodes.get("admin-results-table").children[0].children[3].innerText,
        new Date(playedAt).toLocaleString("fr-FR")
    );
});

test("le journal administrateur affiche l’histogramme de campagne et celui de chacun des six thèmes", () => {
    const h = harness([
        { candidateId: "a", email: "a@test.fr", theme: "all", score: 18, createdAt: new Date().toISOString() },
        ...["1", "2", "3", "4", "5", "6"].map((theme, index) => ({
            candidateId: "a",
            email: "a@test.fr",
            theme,
            score: 8 + index * 2,
            createdAt: new Date().toISOString()
        }))
    ]);
    h.nodes.get("admin-results-candidate-filter").value = "a@test.fr";
    vm.runInContext("renderAdminResults()", h.context);

    const sections = h.nodes.get("admin-history-charts").children;
    assert.equal(sections.length, 7);
    assert.equal(sections[0].children[0].innerText, "Campagne Globale");
    assert.deepEqual(
        sections.slice(1).map(section => section.children[0].innerText),
        [
            "Thème 1 • Organisation et Commandement",
            "Thème 2 • Matériels, Armements et Technologies",
            "Thème 3 • Lois de Programmation Militaire",
            "Thème 4 • Opérations Extérieures",
            "Thème 5 • Histoire & Traditions",
            "Thème 6 • Implantation des unités"
        ]
    );
    assert.equal(sections[6].children[1].getAttribute("aria-label"), "Histogramme des notes — Thème 6 • Implantation des unités");
});

test("les acquis par thème suivent le seuil strict du jalon et le taux de bonnes réponses moyen", () => {
    const h = harness([
        { candidateId: "a", email: "a@test.fr", theme: "1", correct: 13, wrong: 7, total: 20, score: 11, date: "", createdAt: "2027-01-05T00:00:00Z" },
        { candidateId: "a", email: "a@test.fr", theme: "1", correct: 14, wrong: 6, total: 20, score: 12, date: "", createdAt: "2027-01-12T00:00:00Z" },
        { candidateId: "a", email: "a@test.fr", theme: "2", correct: 12, wrong: 8, total: 20, score: 10, date: "", createdAt: "2027-01-18T00:00:00Z" },
        { candidateId: "a", email: "a@test.fr", theme: "3", correct: 20, wrong: 0, total: 20, score: 20, date: "", createdAt: "2027-02-01T00:00:00Z" }
    ]);
    h.nodes.get("admin-results-candidate-filter").value = "a@test.fr";
    h.nodes.get("admin-history-milestone").value = "2027-01";
    vm.runInContext("renderAdminResults()", h.context);

    const acquisition = h.nodes.get("admin-theme-acquisition");
    const table = acquisition.children[1];
    const rows = table.children[1].children;
    assert.equal(rows.length, 6);
    assert.equal(rows[0].children[1].innerText, "67.5 %");
    assert.equal(rows[0].children[3].innerText, "ACQUIS");
    assert.equal(rows[1].children[1].innerText, "60.0 %");
    assert.equal(rows[1].children[3].innerText, "NON ACQUIS");
    assert.equal(rows[2].children[1].innerText, "—");
    assert.match(rows[2].children[3].innerText, /NON ACQUIS — aucun résultat/);
    assert.equal(acquisition.children[0].innerText, "1 thème(s) acquis sur 6 au jalon janvier.");

    h.nodes.get("admin-history-milestone").value = "2027-02";
    vm.runInContext("renderAdminResults()", h.context);
    assert.equal(rows[2].children[1].innerText, "—");
    assert.equal(h.nodes.get("admin-theme-acquisition").children[1].children[1].children[2].children[1].innerText, "100.0 %");
});

test("la période recalcule les indicateurs sans supprimer des lignes du tableau", () => {
    const h = harness();
    h.nodes.get("admin-results-candidate-filter").value = "a@test.fr";
    h.nodes.get("admin-history-period").value = "7";
    vm.runInContext("renderAdminResults()", h.context);
    assert.match(h.nodes.get("admin-history-summary").innerText, /1 résultat.*18\.00/);
    assert.equal(h.nodes.get("admin-history-recommendation").innerText, "Thème à travailler\nOrganisation et Commandement");
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
        assert.equal(h.nodes.get("admin-history-status").innerText, "");
        assert.equal(h.nodes.get("admin-results-table").children.length, 6);
        assert.doesNotMatch(h.nodes.get("admin-history-recommendation").innerText, /Thème 5/);
    }
});

test("le rendu candidat conserve son filtrage personnel et les mêmes indicateurs", () => {
    const h = harness();
    vm.runInContext('renderCandidateHistory(getResults(), "b")', h.context);
    assert.match(h.nodes.get("candidate-history-summary").innerText, /1 résultat.*Moyenne : 10\.00/);
    assert.equal(h.nodes.get("candidate-history-recommendation").innerText, "Thème à travailler\nLois de Programmation Militaire");
});

test("le journal sépare le combat intense, la simulation et les six zones", () => {
    const now = new Date().toISOString();
    const results = [
        { candidateId: "a", theme: "all", feedbackMode: "exam", score: 16, createdAt: now },
        { candidateId: "a", theme: "all", feedbackMode: "training", score: 12, createdAt: now },
        { candidateId: "a", theme: "1", feedbackMode: "training", score: 8, createdAt: now },
        { candidateId: "a", theme: "2", feedbackMode: "training", score: 10, createdAt: now },
        { candidateId: "a", theme: "3", feedbackMode: "training", score: 12, createdAt: now },
        { candidateId: "a", theme: "4", feedbackMode: "training", score: 14, createdAt: now },
        { candidateId: "a", theme: "5", feedbackMode: "training", score: 16, createdAt: now },
        { candidateId: "a", theme: "6", feedbackMode: "training", score: 18, createdAt: now }
    ];
    const h = harness(results);
    for (const [category, title, score] of [
        ["combat", "Combat haute intensité", "16.00"],
        ["simulation", "Simulation de combat", "12.00"],
        ["theme-1", "Organisation et Commandement", "8.00"],
        ["theme-2", "Matériels, Armements et Technologies", "10.00"],
        ["theme-3", "Lois de Programmation Militaire", "12.00"],
        ["theme-4", "Opérations Extérieures", "14.00"],
        ["theme-5", "Histoire & Traditions", "16.00"],
        ["theme-6", "Implantation des unités", "18.00"]
    ]) {
        h.context.candidateHistoryCategory = category;
        vm.runInContext('renderCandidateHistory(getResults(), "a")', h.context);
        const chartSection = h.nodes.get("candidate-history-charts").children[0];
        assert.equal(chartSection.children[0].innerText, title);
        assert.equal(chartSection.children[1].children[0].children[0].innerText, score);
    }
});

test("la migration distingue les modes d'entraînement et réserve le Top 3 au combat intense", () => {
    assert.match(html, /data-history-category="combat"/);
    assert.match(html, /data-history-category="simulation"/);
    for (let theme = 1; theme <= 6; theme += 1) {
        assert.match(html, new RegExp(`data-history-category="theme-${theme}"`));
    }
    assert.match(modeMigration, /add column if not exists feedback_mode text/i);
    assert.match(modeMigration, /coalesce\(theme, 'all'\) = 'all' then 'exam'/i);
    assert.match(modeMigration, /r\.feedback_mode = 'exam'/i);
});

test("le nouveau thème implantation peut devenir le thème à travailler", () => {
    const h = harness();
    vm.runInContext('renderCandidateHistory([{candidateId:"a",theme:"6",score:3}], "a")', h.context);
    assert.equal(h.nodes.get("candidate-history-recommendation").innerText, "Thème à travailler\nImplantation des unités");
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
    h.context.candidateHistoryCategory = "theme-1";
    vm.runInContext('renderCandidateHistory(results.filter(r => r.theme !== "all"), "a")', h.context);
    assert.equal(h.nodes.get("candidate-history-summary").innerText, "1 résultat(s) • Moyenne Organisation et Commandement : 20.00 / 20");
    assert.equal(h.nodes.get("candidate-history-recommendation").innerText, "Thème à travailler\nOrganisation et Commandement");
});
