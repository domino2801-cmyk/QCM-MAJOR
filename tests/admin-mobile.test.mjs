import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../ui/Style.css", import.meta.url), "utf8");

function loadFunction(name, context) {
    const start = app.search(new RegExp(`(?:async )?function ${name}\\(`));
    assert.notEqual(start, -1);
    const end = app.indexOf("\nfunction ", start + 1);
    const asyncEnd = app.indexOf("\nasync function ", start + 1);
    const ends = [end, asyncEnd].filter(index => index >= 0);
    vm.runInContext(app.slice(start, Math.min(...ends)), context);
    return context[name];
}

function paginationFixture() {
    const controls = {};
    const context = vm.createContext({
        adminListState: {}, adminPageSize: 25,
        document: { getElementById(id) {
            return controls[id] ||= { innerText: "", classList: {
                toggle(_, hidden) { controls[id].hidden = hidden; }
            } };
        } }
    });
    return { context, controls, page: loadFunction("getAdminListPage", context) };
}

test("les listes affichent 25 éléments puis conservent la limite tant que le filtre ne change pas", () => {
    const { context, controls, page } = paginationFixture();
    const items = Array.from({ length: 61 }, (_, index) => index);
    assert.equal(page("questions", items, "0:").length, 25);
    assert.equal(controls["admin-questions-more"].hidden, false);
    context.adminListState.questions.limit += 25;
    assert.equal(page("questions", items, "0:").length, 50);
    assert.equal(page("questions", items, "1:").length, 25);
    assert.equal(page("questions", [], "1:absent").length, 0);
    assert.equal(controls["admin-questions-more"].hidden, true);
    assert.equal(controls["admin-questions-count"].innerText, "");
});

test("la sortie d'éditeur respecte le refus et interdit de quitter pendant une opération", async () => {
    let asked = 0;
    const context = vm.createContext({
        adminOperationPending: false,
        isAdminEditorDirty: () => true,
        showConfirmOverlay: async () => { asked++; return false; },
        setAuthMessage: () => {}
    });
    const confirm = loadFunction("confirmAdminEditorExit", context);
    assert.equal(await confirm(), false);
    assert.equal(asked, 1);
    context.adminOperationPending = true;
    assert.equal(await confirm(), false);
    assert.equal(asked, 1);
    context.adminOperationPending = false;
    context.isAdminEditorDirty = () => false;
    assert.equal(await confirm(), true);
});

test("le brouillon conserve l'identifiant de question et reste propre à l'onglet et au compte", () => {
    let stored;
    const context = vm.createContext({
        isAdminEditorDirty: () => true,
        currentAuthenticatedAccount: { id: "admin" },
        adminDraftStorageKey: "draft", editingQuestionIndex: 0,
        adminEditingReportId: "report",
        questionsBank: { "0": { questions: [{ id: "question-id" }] } },
        getAdminQuestionSnapshot: () => '{"theme":"0","question":"modifiée","answers":["A","B","C","D"],"correct":"2"}',
        document: { getElementById: () => ({ value: "0", classList: { remove() {} } }) },
        sessionStorage: { setItem: (_, value) => { stored = JSON.parse(value); } },
        setAuthMessage: () => {}
    });
    loadFunction("saveAdminQuestionDraft", context)();
    assert.equal(stored.owner, "admin");
    assert.equal(stored.questionId, "question-id");
    assert.equal(stored.reportId, "report");
    assert.equal(stored.fields.question, "modifiée");
});

test("les comptes et signalements sont paginés sans tronquer les données", async () => {
    let reports = 0;
    const queries = [];
    const context = vm.createContext({
        supabase: {}, isAdminSession: () => true,
        getStoredSupabaseSession: () => ({ access_token: "admin" }),
        loadResultsFromSupabase: async () => true,
        supabaseRestRequest: async query => {
            queries.push(query);
            if (query.startsWith("/profiles")) return [{ id: "p", email: "candidate@test", name: "Test" }];
            reports++;
            return Array.from({ length: reports === 1 ? 250 : 1 }, (_, id) => ({
                id: `${reports}-${id}`, reporter_id: "p"
            }));
        },
        cacheAccount: () => {}, normalizeEmail: email => email,
        questionReports: [], cachedAccounts: {}
    });
    await loadFunction("loadAdminData", context)();
    assert.equal(context.questionReports.length, 251);
    assert.equal(context.questionReports[250].reporter_email, "candidate@test");
    assert.match(queries.at(-1), /offset=250/);
});

test("une session remplacée ne reçoit pas les comptes et signalements de l'ancien administrateur", async () => {
    let token = "admin";
    const context = vm.createContext({
        supabase: {}, isAdminSession: () => true,
        getStoredSupabaseSession: () => ({ access_token: token }),
        loadResultsFromSupabase: async () => true,
        supabaseRestRequest: async query => {
            if (query.startsWith("/profiles")) return [];
            token = "another-session";
            return [];
        },
        questionReports: ["unchanged"], cachedAccounts: { unchanged: true }
    });
    await assert.rejects(loadFunction("loadAdminData", context)(), /session a changé/);
    assert.deepEqual(Array.from(context.questionReports), ["unchanged"]);
});

test("la navigation et les cartes mobiles gardent les zones tactiles et les actions hors du bandeau", () => {
    assert.match(css, /#admin-screen button,[\s\S]*?min-height: 44px/);
    const mobileNav = css.match(/#admin-screen \.admin-nav\s*\{([^}]+)\}/)[1];
    assert.doesNotMatch(mobileNav, /position: fixed/);
    assert.match(css, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
    assert.match(css, /bottom: env\(safe-area-inset-bottom\)/);
    assert.match(app, /getAdminListPage\("reports",[\s\S]*?filter/);
    assert.match(css, /\.container:has\(#admin-screen\.active\) \{\s*backdrop-filter: none;/);
    assert.match(css, /#admin-screen \.hidden \{\s*display: none;/);
});

test("les actualisations simultanées partagent une seule requête et affichent un échec explicite", async () => {
    let loads = 0;
    const messages = [];
    const nodes = {
        "question-form": { classList: { contains: () => true } },
        "admin-refresh-btn": { innerText: "", classList: {
            add() { this.ready = true; },
            remove() { this.ready = false; }
        } }
    };
    const context = vm.createContext({
        adminRefreshPromise: null, supabase: {},
        confirmAdminEditorExit: async () => true,
        getStoredSupabaseSession: () => ({ access_token: "admin" }),
        isAdminSession: () => true, setAdminOperationPending: () => {},
        document: { getElementById: id => nodes[id] },
        loadAdminData: async () => { loads++; throw new Error("Serveur indisponible"); },
        setAuthMessage: (_, message) => messages.push(message),
        console: { warn() {} }
    });
    const refresh = loadFunction("refreshAdminData", context);
    await Promise.all([refresh(), refresh()]);
    assert.equal(loads, 1);
    assert.equal(context.adminRefreshPromise, null);
    assert.match(messages.at(-1), /Données non actualisées.*Serveur indisponible/);
    assert.equal(nodes["admin-refresh-btn"].innerText, "Réessayer");
    assert.equal(nodes["admin-refresh-btn"].classList.ready, false);
    let rendered = 0;
    context.loadAdminData = async () => { loads++; };
    context.loadQuestionsFromSupabase = async () => true;
    for (const name of ["renderAdminAccounts", "renderAdminQuestions", "renderAdminResults", "renderAdminQuestionReports", "renderGlobalRanking"]) {
        context[name] = () => { rendered++; };
    }
    context.getResults = () => [];
    context.refreshAdminRetex = async () => {};
    await refresh();
    assert.equal(rendered, 5);
    assert.equal(messages.at(-1), "");
    assert.equal(nodes["admin-refresh-btn"].classList.ready, true);
});

function element() {
    return {
        children: [], listeners: {}, dataset: {},
        classList: { toggle() {} },
        set innerHTML(_) { this.children = []; },
        append(...children) { this.children.push(...children); },
        appendChild(child) { this.children.push(child); },
        prepend(child) { this.children.unshift(child); },
        addEventListener(name, handler) { this.listeners[name] = handler; }
    };
}

test("un refus de suppression distante laisse la question dans la banque locale", async () => {
    const list = element();
    const messages = [];
    const question = { id: "preserved", q: "Question", r: ["A", "B", "C", "D"], correct: 0 };
    const context = vm.createContext({
        questionsBank: { "0": { questions: [question] } },
        document: {
            getElementById: id => id === "admin-question-theme" ? { value: "0" }
                : id === "admin-questions-table" ? list : null,
            createElement: element
        },
        normalizeQuestionAnswers: answers => answers,
        getAdminListPage: (_, items) => items, labelAdminRow: () => {},
        showConfirmOverlay: async () => true, setAdminOperationPending: () => {},
        supabase: {}, questionSourceReady: true,
        syncQuestionMutation: async () => { throw new Error("Refus serveur"); },
        saveCurrentThemeQuestions: () => { throw new Error("Ne doit pas sauvegarder"); },
        setAuthMessage: (_, message) => messages.push(message)
    });
    loadFunction("renderAdminQuestions", context)();
    const actions = list.children[0].children[3].children[1];
    await actions.children[1].listeners.click();
    assert.equal(context.questionsBank["0"].questions.length, 1);
    assert.match(messages.at(-1), /Suppression impossible.*Refus serveur/);
});

test("les filtres de signalements séparent À traiter, Traités et Tous", () => {
    let filter = "pending";
    let selected = [];
    const list = element();
    const context = vm.createContext({
        questionReports: [{ id: "pending", status: "pending" }, { id: "resolved", status: "resolved" }],
        document: {
            getElementById: id => id === "admin-question-reports-table" ? list
                : id === "admin-reports-filter" ? { value: filter } : null,
            querySelector: () => null, createElement: element
        },
        getAdminListPage: (_, reports) => { selected = reports; return []; }
    });
    const render = loadFunction("renderAdminQuestionReports", context);
    render();
    assert.deepEqual(selected.map(report => report.id), ["pending"]);
    filter = "resolved";
    render();
    assert.deepEqual(selected.map(report => report.id), ["resolved"]);
    filter = "all";
    render();
    assert.equal(selected.length, 2);
});

test("les résultats administrateur dépassant 250 lignes sont tous chargés", async () => {
    let loaded;
    const queries = [];
    const context = vm.createContext({
        supabase: {}, isAdminSession: () => true,
        getStoredSupabaseSession: () => ({ access_token: "admin" }),
        supabaseRestRequest: async query => {
            queries.push(query);
            const offset = Number(query.match(/offset=(\d+)/)[1]);
            return Array.from({ length: offset === 0 ? 250 : 3 }, (_, index) => ({ id: String(offset + index) }));
        },
        normalizeResultRecord: row => row,
        pendingResultSync: { upserts: [], deletes: [] },
        getResults: () => [],
        setResults: rows => { loaded = rows; },
        flushPendingResultSync: async () => {}
    });

    await loadFunction("loadResultsFromSupabase", context)({ throwOnError: true });
    assert.equal(loaded.length, 253);
    assert.equal(queries.length, 2);
    assert.match(queries[1], /order=created_at.desc,id.desc&limit=250&offset=250/);
});

test("aucun panneau à l'ouverture puis seul l'onglet cliqué est visible", () => {
        const panels = ["accounts", "questions", "question-reports", "results"].map(section => ({
            id: `admin-${section}-section`,
            classList: { toggle(_, hidden) { this.hidden = hidden; } }
        }));
        const buttons = ["accounts", "questions", "question-reports", "results"].map(section => ({
            dataset: { adminSection: section },
            classList: { toggle(_, active) { this.active = active; } },
            setAttribute() {}, removeAttribute() {}
        }));
        const context = vm.createContext({
            adminActiveSection: null, adminScrollPositions: {},
            window: { scrollY: 0, scrollTo() {} },
            document: { querySelectorAll: selector => selector === ".admin-panel" ? panels : buttons }
        });
        const select = loadFunction("switchAdminSection", context);
        select(null);
        assert.ok(panels.every(panel => panel.classList.hidden));
        assert.ok(buttons.every(button => !button.classList.active));
        select("questions");
        assert.deepEqual(panels.filter(panel => !panel.classList.hidden).map(panel => panel.id), ["admin-questions-section"]);
        select("results");
        assert.deepEqual(panels.filter(panel => !panel.classList.hidden).map(panel => panel.id), ["admin-results-section"]);
});

test("les actions sont groupées avant les quatre onglets et les statuts vides ne prennent pas de place", () => {
        const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
        const toolbar = html.match(/<div class="admin-toolbar">([\s\S]*?)<\/div>/)[1];
        assert.match(toolbar, /id="admin-refresh-btn"/);
        assert.match(toolbar, />Activer notification<\/button>/);
        assert.ok(html.indexOf('class="admin-toolbar"') < html.indexOf('class="admin-nav"'));
        assert.match(css, /\.admin-toolbar\s*\{[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
        assert.match(css, /#admin-screen \.admin-toolbar button\s*\{[^}]*width: 100%;[^}]*max-width: none;[^}]*box-sizing: border-box;[^}]*justify-self: stretch;/);
        assert.match(css, /#admin-data-status:empty,[\s\S]*?display: none/);
});

test("retirer du cache demande OUI/NON et ne modifie rien en cas de refus", async () => {
    const accounts = { "candidate@test": { name: "Candidat", specialty: "GEN" } };
    const list = element();
    let confirmed = false;
    let confirmation;
    const context = vm.createContext({
        getAccounts: () => accounts,
        currentAuthenticatedAccount: null,
        document: {
            getElementById: id => id === "admin-accounts-table" ? list : null,
            createElement: element
        },
        getAdminListPage: (_, items) => items, labelAdminRow: () => {},
        getSpecialtyTrigram: value => value, formatSpecialtyLabel: value => value,
        showConfirmOverlay: async options => { confirmation = options; return confirmed; }
    });
    loadFunction("renderAdminAccounts", context)();
    const button = list.children[0].children[3].children[0];
    await button.listeners.click();
    assert.equal(confirmation.okLabel, "OUI");
    assert.equal(confirmation.cancelLabel, "NON");
    assert.match(confirmation.message, /compte Supabase ne sera pas supprimé/);
    assert.ok(accounts["candidate@test"]);
    confirmed = true;
    await button.listeners.click();
    assert.equal(accounts["candidate@test"], undefined);
    assert.equal(list.children.length, 0);
});

test("le combo Statut et ses options conservent un fond sombre", () => {
    assert.match(css, /#admin-reports-filter\s*\{\s*background: #101b26;\s*color: var\(--text\);\s*color-scheme: dark;/);
    assert.match(css, /#admin-reports-filter option\s*\{\s*background: #101b26;\s*color: var\(--text\);/);
});

test("le bouton notification est vert uniquement lorsque l'abonnement est confirmé", async () => {
    const button = {
        dataset: {}, setAttribute() {},
        classList: {
            remove() { this.ready = false; },
            toggle(_, enabled) { this.ready = enabled; }
        }
    };
    let enabled = true;
    const messages = [];
    const context = vm.createContext({
        document: { getElementById: () => button },
        getAdminPushOptions: () => ({}),
        reportNotificationsEnabled: async () => enabled,
        setAuthMessage: (_, message) => messages.push(message)
    });
    const refresh = loadFunction("refreshAdminPushStatus", context);
    await refresh();
    assert.equal(button.classList.ready, true);
    assert.equal(button.dataset.enabled, "true");
    enabled = false;
    await refresh();
    assert.equal(button.classList.ready, false);
    context.reportNotificationsEnabled = async () => { throw new Error("Indisponible"); };
    await refresh();
    assert.equal(button.classList.ready, false);
    assert.equal(messages.at(-1), "Indisponible");
});
