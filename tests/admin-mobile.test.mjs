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
            if (query.startsWith("/profiles")) return [{
                id: "p", email: "candidate@test", name: "Test", created_at: "2026-10-25T12:00:00Z"
            }];
            if (query.startsWith("/rpc/get_admin_blocked_accounts?")) {
                return query.includes("offset=0")
                    ? Array.from({ length: 1000 }, (_, id) => ({ user_id: `blocked-${id}` }))
                    : [{ user_id: "p" }];
            }
            if (query === "/rpc/get_admin_current_inactivity_reminders") return ["p"];
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
    assert.match(queries[0], /created_at/);
    assert.equal(context.cachedAccounts["candidate@test"].createdAt, "2026-10-25T12:00:00Z");
    assert.equal(context.cachedAccounts["candidate@test"].blocked, true);
    assert.ok(queries.some(query => query.includes("/rpc/get_admin_blocked_accounts?limit=1000&offset=1000")));
    assert.equal(context.adminBlockedAccountsLoaded, true);
    assert.ok(queries.some(query => /offset=250/.test(query)));
    assert.deepEqual(Array.from(context.adminInactivityReminderIds), ["p"]);
});

test("un échec de lecture des relances est signalé sans conserver les anciens statuts", async () => {
    const context = vm.createContext({
        supabase: {}, isAdminSession: () => true,
        getStoredSupabaseSession: () => ({ access_token: "admin" }),
        loadResultsFromSupabase: async () => true,
        supabaseRestRequest: async query => {
            if (query === "/rpc/get_admin_current_inactivity_reminders") throw new Error("RPC unavailable");
            return [];
        },
        console: { warn() {} },
        questionReports: [], cachedAccounts: {},
        adminInactivityReminderIds: new Set(["ancien"]),
        adminInactivityReminderError: ""
    });
    await loadFunction("loadAdminData", context)();
    assert.equal(context.adminInactivityReminderIds.size, 0);
    assert.match(context.adminInactivityReminderError, /indisponible/);
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
        renderAdminAccounts() {},
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
        setAttribute() {},
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

test("un refus de changement de thème distant conserve la question dans son thème", async () => {
    const question = { id: "preserved", q: "Question", r: ["A", "B", "C", "D"], correct: 0 };
    const messages = [];
    const context = vm.createContext({
        questionsBank: { "0": { questions: [question] }, "1": { questions: [] } },
        supabase: {}, questionSourceReady: true,
        syncQuestionMutation: async () => { throw new Error("Refus serveur"); },
        setAdminOperationPending: () => {},
        saveCurrentThemeQuestions: () => { throw new Error("Ne doit pas sauvegarder"); },
        renderAdminQuestions: () => {},
        setAuthMessage: (_, message) => messages.push(message)
    });
    const move = loadFunction("moveAdminQuestionToTheme", context);
    await move(question, "0", "1", { disabled: false });
    assert.deepEqual(context.questionsBank["0"].questions, [question]);
    assert.deepEqual(context.questionsBank["1"].questions, []);
    assert.match(messages.at(-1), /Changement de thème impossible.*Refus serveur/);
});

test("changer le thème déplace la question et sauvegarde les deux thèmes", async () => {
    const question = { id: "moved", q: "Question", r: ["A", "B", "C", "D"], correct: 0 };
    const savedThemes = [];
    const context = vm.createContext({
        questionsBank: { "0": { questions: [question] }, "1": { questions: [] } },
        supabase: {}, questionSourceReady: true,
        syncQuestionMutation: async payload => {
            assert.deepEqual({ ...payload }, { action: "move", id: "moved", themeId: "1" });
            return { updated: true };
        },
        setAdminOperationPending: () => {},
        saveCurrentThemeQuestions: themeId => savedThemes.push(themeId),
        renderAdminQuestions: () => {},
        setAuthMessage: () => {}
    });
    const move = loadFunction("moveAdminQuestionToTheme", context);
    await move(question, "0", "1", { disabled: false });
    assert.deepEqual(context.questionsBank["0"].questions, []);
    assert.deepEqual(context.questionsBank["1"].questions, [question]);
    assert.deepEqual(savedThemes, ["0", "1"]);
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
        assert.match(toolbar, /id="admin-push-test-btn"[^>]*>Tester la notification<\/button>/);
        assert.match(toolbar, /id="admin-push-enable-btn"[\s\S]*id="admin-push-test-btn"[\s\S]*id="admin-doctrine-btn"[^>]*>Admin ANC<\/button>/);
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
        adminBlockedAccountsLoaded: true,
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
    const button = list.children[0].children[4].children[0];
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

test("l’administrateur peut bloquer puis débloquer un candidat", async () => {
    const account = { id: "candidate-id", email: "candidate@test", name: "Candidat" };
    const accounts = { [account.email]: account };
    const list = element();
    const statuses = [];
    let confirmed = true;
    let fail = false;
    const context = vm.createContext({
        getAccounts: () => accounts,
        adminBlockedAccountsLoaded: true,
        supabaseRestRequest: async (path, options) => {
            assert.equal(path, "/rpc/set_account_blocked");
            assert.equal(options.body.p_user_id, account.id);
            if (fail) throw new Error("Indisponible");
            return options.body.p_blocked;
        },
        getStoredSupabaseSession: () => ({ access_token: "admin" }),
        setAdminOperationPending() {},
        setAuthMessage: (_, message) => statuses.push(message),
        document: {
            getElementById: id => id === "admin-accounts-table" ? list : null,
            createElement: element
        },
        getAdminListPage: (_, items) => items, labelAdminRow: () => {},
        getSpecialtyTrigram: value => value, formatSpecialtyLabel: value => value,
        showConfirmOverlay: async () => confirmed
    });
    loadFunction("renderAdminAccounts", context)();
    let status = list.children[0].children[3].children[0];
    assert.equal(status.innerText, "Débloqué");
    assert.match(status.className, /is-unblocked/);
    let button = list.children[0].children[4].children[1];
    assert.equal(button.innerText, "Bloquer le compte");
    confirmed = false;
    await button.listeners.click();
    assert.equal(account.blocked, undefined);
    confirmed = true;
    await button.listeners.click();
    assert.equal(account.blocked, true);
    assert.match(statuses.at(-1), /Compte bloqué/);

    status = list.children[0].children[3].children[0];
    assert.equal(status.innerText, "Bloqué");
    assert.match(status.className, /is-blocked/);
    button = list.children[0].children[4].children[1];
    assert.equal(button.innerText, "Débloquer");
    assert.match(button.className, /is-blocked/);
    fail = true;
    await button.listeners.click();
    assert.equal(account.blocked, true);
    assert.equal(list.children[0].children[3].children[0].innerText, "Bloqué");
    assert.match(statuses.at(-1), /Modification du blocage impossible/);
    fail = false;
    await button.listeners.click();
    assert.equal(account.blocked, false);
    assert.match(statuses.at(-1), /Compte débloqué/);
    status = list.children[0].children[3].children[0];
    assert.equal(status.innerText, "Débloqué");
    assert.match(status.className, /is-unblocked/);
});

test("un statut non synchronisé est inconnu et ne permet pas de modifier le compte", () => {
    const list = element();
    const context = vm.createContext({
        adminBlockedAccountsLoaded: false,
        getAccounts: () => ({ "candidate@test": { id: "p", name: "Candidat", blocked: true } }),
        document: {
            getElementById: id => id === "admin-accounts-table" ? list : null,
            createElement: element
        },
        getAdminListPage: (_, items) => items, labelAdminRow: () => {},
        getSpecialtyTrigram: value => value, formatSpecialtyLabel: value => value
    });
    loadFunction("renderAdminAccounts", context)();
    assert.equal(list.children[0].children[3].children[0].innerText, "Statut indisponible");
    assert.equal(list.children[0].children[4].children[1].disabled, true);
    context.adminBlockedAccountsLoaded = true;
    context.getAccounts = () => ({ "candidate@test": { name: "Candidat" } });
    context.renderAdminAccounts();
    assert.equal(list.children[0].children[3].children[0].innerText, "Statut indisponible");
    assert.equal(list.children[0].children[4].children[1].disabled, true);
});

test("un compte bloqué ne passe pas la finalisation de connexion candidat", async () => {
    const context = vm.createContext({
        isAdminSession: () => false,
        isCurrentAccountBlocked: async () => true,
        accountBlockedErrorCode: "ACCOUNT_BLOCKED"
    });
    const finalize = loadFunction("finalizeAuthenticatedUser", context);
    await assert.rejects(
        finalize({ id: "blocked-id", email: "blocked@test" }, {}, { access_token: "candidate" }),
        error => error.code === "ACCOUNT_BLOCKED"
    );
});

test("les comptes candidats sont affichés du plus récent au plus ancien", () => {
    const accounts = {
        "old@test": { name: "Ancien", createdAt: "2026-10-01T12:00:00Z" },
        "new@test": { name: "Récent", createdAt: "2026-10-03T12:00:00Z" },
        "middle@test": { name: "Intermédiaire", createdAt: "2026-10-02T12:00:00Z" }
    };
    const list = element();
    const context = vm.createContext({
        getAccounts: () => accounts,
        adminBlockedAccountsLoaded: false,
        currentAuthenticatedAccount: null,
        document: {
            getElementById: id => id === "admin-accounts-table" ? list : null,
            createElement: element
        },
        getAdminListPage: (_, items) => items, labelAdminRow: () => {},
        getSpecialtyTrigram: value => value, formatSpecialtyLabel: value => value,
        showConfirmOverlay: async () => false
    });

    loadFunction("renderAdminAccounts", context)();

    assert.deepEqual(list.children.map(row => row.children[1].innerText), [
        "new@test", "middle@test", "old@test"
    ]);
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
            add() {},
            toggle(name, enabled) { if (name === "admin-state-ready") this.ready = enabled; }
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

test("les adresses @intradef.gouv.fr sont refusées à l'inscription", () => {
    const context = vm.createContext({});
    const check = loadFunction("isProfessionalEmail", context);
    assert.equal(check("agent@intradef.gouv.fr"), true);
    assert.equal(check("Agent@Sub.INTRADEF.gouv.fr"), true);
    assert.equal(check("candidat@gmail.com"), false);
    assert.equal(check("a@intradef.gouv.fr.evil.com"), false);
});
