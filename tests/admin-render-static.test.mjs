import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(testDirectory, "..");
const html = readFileSync(`${root}/index.html`, "utf8");
const js = readFileSync(`${root}/app.js`, "utf8");

test("admin renderers target the existing table body ids", () => {
    assert.match(html, /id="admin-accounts-table"/);
    assert.doesNotMatch(html, /refresh-admin-accounts-btn|Actualiser depuis Supabase/);
    assert.doesNotMatch(js, /refresh-admin-accounts-btn/);
    assert.match(html, /id="btn-history-theme"/);
    assert.match(html, /id="candidate-history-charts"/);
    assert.match(html, /id="candidate-history-recommendation"/);
    assert.match(html, /id="history-screen"/);
    assert.match(html, /id="btn-back-to-campaign"/);
    assert.match(html, /id="login-global-ranking-section"/);
    assert.match(html, /id="history-global-ranking-section"/);
    assert.match(html, /id="history-global-ranking-list"/);
    assert.match(js, /getElementById\("history-global-ranking-list"\)/);
    assert.doesNotMatch(html, /id="admin-global-ranking-section"/);
    assert.doesNotMatch(html, /id="admin-global-ranking-list"/);
    assert.doesNotMatch(js, /getElementById\("admin-global-ranking-list"\)/);
    assert.match(html, /id="reset-question-history-btn"/);
    assert.doesNotMatch(html, /id="candidate-history-theme-filter"/);
    assert.doesNotMatch(html, /id="candidate-history-ranking-list"/);
    assert.match(html, /id="candidate-history-period"/);
    assert.match(html, /id="admin-questions-table"/);
    assert.match(html, /id="admin-results-table"/);
    assert.match(html, /id="admin-results-candidate-filter"/);
    assert.match(html, /id="admin-retex-pdf-btn"/);
    assert.match(html, /id="admin-retex-responses"/);
    assert.match(html, /id="admin-retex-responses-block"/);
    assert.match(js, /retexResponses\.forEach\(\(row, index\) =>/);
    assert.doesNotMatch(html, /admin-retex-email-btn|Envoyer par e-mail/);
    assert.doesNotMatch(js, /admin-retex-email-btn|emailAdminRetexPdf|retexReportEmail/);
    assert.match(js, /getElementById\("admin-accounts-table"\)/);
    assert.match(js, /getElementById\("admin-questions-table"\)/);
    assert.match(js, /getElementById\("admin-results-table"\)/);
    assert.doesNotMatch(js, /getElementById\("admin-accounts-list"\)/);
    assert.doesNotMatch(js, /getElementById\("admin-questions-list"\)/);
    assert.doesNotMatch(js, /getElementById\("admin-results-list"\)/);
    assert.match(js, /admin-results-candidate-filter/);
    assert.match(js, /candidate_id/);
    assert.match(js, /user_id/);
    assert.doesNotMatch(js, /Synchronisé à|Configuration des notifications/);
    assert.match(js, /renderCandidateHistory/);
    assert.match(js, /score-critical/);
    assert.match(js, /Thème à travailler/);
    assert.match(js, /\.filter\(result => result\.theme === "all"\)\s*\.sort/);
    assert.equal((html.match(/COMBAT HAUTE INTENSITE TOP 3/g) || []).length, 2);
});

test("admin sessions accept the same bm4_admin values as the database policy", () => {
    const isAdminSession = extractNamedFunction("isAdminSession", {
        decodeJwtClaims: token => JSON.parse(token)
    });

    for (const bm4_admin of [true, "true", "1"]) {
        assert.equal(isAdminSession({ access_token: JSON.stringify({ app_metadata: { bm4_admin } }) }), true);
    }
    assert.equal(isAdminSession({ access_token: JSON.stringify({ app_metadata: { bm4_admin: false } }) }), false);
});

test("RETEX PDF keeps pie charts and includes only free comments after them", async () => {
    const rows = [
        {
            pseudo: "Candidat Alpha",
            specialty: "GEN",
            created_at: "2026-10-20T12:00:00Z",
            themes: ["Combat", "Budget"],
            navigation: "Navigation alpha",
            design: "Design alpha",
            best_mode: "Mode alpha",
            scoring_opinion: "Bareme alpha",
            used_report_form: "Signalement alpha",
            recommendation: "Recommandation alpha",
            comment: "Commentaire alpha"
        },
        {
            pseudo: "Candidat Beta",
            specialty: "INF",
            created_at: "2026-10-21T12:00:00Z",
            themes: ["Operation"],
            navigation: "Navigation beta",
            design: "Design beta",
            best_mode: "Mode beta",
            scoring_opinion: "Bareme beta",
            used_report_form: "Signalement beta",
            recommendation: "Recommandation beta",
            comment: "Commentaire beta"
        }
    ];
    const buildRetexPdf = extractNamedFunction("buildRetexPdf", {
        Blob,
        Uint8Array,
        retexPalette: ["#4e6e4e"],
        retexQuestions: [
            { field: "themes", title: "Themes", multiple: true },
            { field: "navigation", title: "Navigation" },
            { field: "design", title: "Design" },
            { field: "best_mode", title: "Mode" },
            { field: "scoring_opinion", title: "Bareme" },
            { field: "used_report_form", title: "Signalement" },
            { field: "recommendation", title: "Recommandation" }
        ],
        retexResponses: rows,
        computeRetexSlices: field => ({
            slices: [{ label: `Graphique ${field}`, count: 2 }],
            answered: 2
        }),
        getRetexMetaText: () => "2 retours",
        getRetexAnswer: (row, field, multiple = false) => {
            const value = row[field];
            if (multiple) return (Array.isArray(value) ? value : []).join(", ") || "Non renseigne";
            return value == null || value === "" ? "Non renseigne" : String(value);
        },
        getRetexResponseDate: row => row.created_at
    });
    const pdf = await buildRetexPdf().text();

    for (const value of ["Graphique themes : 2", "Graphique navigation : 2"]) {
        assert.ok(pdf.includes(value), `PDF is missing the chart legend ${value}`);
    }
    assert.match(pdf, / h f/);
    assert.ok(pdf.includes("Commentaires libres"));
    assert.ok(pdf.includes("Commentaire alpha"));
    assert.ok(pdf.includes("Commentaire beta"));
    for (const value of [
        "Candidat Alpha", "Navigation alpha", "Design alpha", "Mode alpha", "Bareme alpha",
        "Signalement alpha", "Recommandation alpha", "Candidat Beta", "Navigation beta",
        "Design beta", "Mode beta", "Bareme beta", "Signalement beta", "Recommandation beta",
        "D.tail de tous les retours"
    ]) {
        assert.ok(!pdf.includes(value), `PDF should not include ${value}`);
    }
});

test("showAuthenticatedApp refreshes the ranking on the connected screen", () => {
    const context = {
        calls: [],
        accountSummary: { innerText: "" },
        welcomeMessage: { innerText: "" },
        document: {
            getElementById(id) {
                if (id === "account-summary") {
                    return context.accountSummary;
                }
                if (id === "theme-welcome-message") {
                    return context.welcomeMessage;
                }
                return null;
            }
        },
        uiController: {
            switchScreen(screenId) {
                context.calls.push(["switch", screenId]);
            }
        },
        renderGlobalRanking(results) {
            context.calls.push(["render", results]);
        },
        getResults() {
            return [{ id: "r1", name: "A", theme: "all", score: 18 }, { id: "r2", name: "B", theme: "all", score: 17 }, { id: "r3", name: "C", theme: "all", score: 16 }];
        },
        setAuthAudioPlaying() {},
        refreshRetexLock() {},
        updateObjectiveQuestionBadges(email) {
            context.calls.push(["badges", email]);
        },
        refreshCandidateHistory(account) {
            context.calls.push(["history", account]);
        },
        formatSpecialtyLabel(value) {
            return value || "GEN";
        },
        getAccounts() {
            return { "alice@test.com": { name: "Alice", specialty: "GEN" } };
        }
    };

    const fn = extractNamedFunction("showAuthenticatedApp", context);
    fn("alice@test.com", { name: "Alice", specialty: "GEN" });

    assert.deepEqual(context.calls[0], ["badges", "alice@test.com"]);
    assert.equal(context.welcomeMessage.innerText, "Bienvenue Alice au CENTAC du BM4");
    assert.equal(context.accountSummary.innerText, "Filière : GEN");
    assert.deepEqual(context.calls[1], ["switch", "theme-screen"]);
    assert.deepEqual(context.calls[2][0], "render");
    assert.equal(context.calls[2][1].length, 3);
    assert.deepEqual(context.calls[3][0], "history");
    assert.equal(context.calls[3][1].email, "alice@test.com");
});

test("showAdminApp refreshes the ranking before and after admin sync", async () => {
    const context = {
        adminActiveSection: "accounts",
        sessionStorage: { getItem: () => null },
        adminDraftStorageKey: "draft",
        document: { getElementById: () => ({ classList: { toggle() {} } }) },
        calls: [],
        setAuthAudioPlaying() {},
        renderAdminAccounts() {
            context.calls.push("accounts");
        },
        renderAdminQuestions() {
            context.calls.push("questions");
        },
        renderAdminResults() {
            context.calls.push("results");
        },
        renderAdminQuestionReports() {
            context.calls.push("question-reports");
        },
        renderGlobalRanking(results) {
            context.calls.push(["ranking", results]);
        },
        getResults() {
            return [{ id: "r1", name: "A", theme: "all", score: 18 }];
        },
        switchAdminSection(section) {
            context.calls.push(["section", section]);
        },
        uiController: {
            switchScreen(screenId) {
                context.calls.push(["screen", screenId]);
            }
        },
        async loadAdminData() {
            context.calls.push("load");
        },
        async refreshAdminData() {
            context.calls.push("load");
            context.renderAdminAccounts();
            context.renderAdminQuestions();
            context.renderAdminResults();
            context.renderAdminQuestionReports();
            context.renderGlobalRanking(context.getResults());
            context.setAuthMessage("admin-data-status", "Synchronisé.");
        },
        async refreshAdminPushStatus() {
            context.calls.push("push-status");
        },
        setAuthMessage(id, message) {
            context.calls.push(["message", id, message]);
        },
        console: {
            warn() {
                context.calls.push("warn");
            }
        }
    };

    const fn = extractNamedFunction("showAdminApp", context);
    await fn();

    assert.deepEqual(context.calls.filter(entry => Array.isArray(entry) && entry[0] === "ranking").length, 2);
    assert.equal(context.calls.filter(entry => entry === "questions").length, 2);
    assert.ok(context.calls.some(entry => Array.isArray(entry) && entry[0] === "screen" && entry[1] === "admin-screen"));
    assert.ok(context.calls.some(entry => Array.isArray(entry) && entry[0] === "section" && entry[1] === null));
    assert.ok(context.calls.some(entry => Array.isArray(entry) && entry[0] === "message" && entry[1] === "admin-data-status"));
});

function extractNamedFunction(name, globals = {}) {
    const asyncSignature = `async function ${name}`;
    const plainSignature = `function ${name}`;
    const start = js.includes(asyncSignature)
        ? js.indexOf(asyncSignature)
        : js.indexOf(plainSignature);
    assert.notEqual(start, -1, `Unable to find function ${name}`);

    let cursor = js.indexOf("(", start);
    let parenDepth = 0;
    let inString = null;
    let escaped = false;

    while (cursor < js.length) {
        const character = js[cursor];

        if (inString) {
            if (escaped) {
                escaped = false;
            } else if (character === "\\") {
                escaped = true;
            } else if (character === inString) {
                inString = null;
            }
            cursor += 1;
            continue;
        }

        if (character === "'" || character === '"' || character === "`") {
            inString = character;
            cursor += 1;
            continue;
        }

        if (character === "(") {
            parenDepth += 1;
        } else if (character === ")") {
            parenDepth -= 1;
            if (parenDepth === 0) {
                let bodyCursor = cursor + 1;
                while (/[\s]/.test(js[bodyCursor] || "")) bodyCursor += 1;
                if (js[bodyCursor] === "{") {
                    break;
                }
            }
        }

        cursor += 1;
    }

    assert.ok(cursor < js.length, `Unable to find the body of ${name}`);

    const bodyStart = js.indexOf("{", cursor);
    let depth = 0;
    let bodyCursor = bodyStart;
    inString = null;
    escaped = false;

    while (bodyCursor < js.length) {
        const character = js[bodyCursor];

        if (inString) {
            if (escaped) {
                escaped = false;
            } else if (character === "\\") {
                escaped = true;
            } else if (character === inString) {
                inString = null;
            }
            bodyCursor += 1;
            continue;
        }

        if (character === "'" || character === '"' || character === "`") {
            inString = character;
            bodyCursor += 1;
            continue;
        }

        if (character === "{") {
            depth += 1;
        } else if (character === "}") {
            depth -= 1;
            if (depth === 0) {
                break;
            }
        }

        bodyCursor += 1;
    }

    assert.ok(bodyCursor < js.length, `Unable to close the body for ${name}`);

    const functionSource = js.slice(start, bodyCursor + 1);
    const script = new vm.Script(`(${functionSource})`);
    return script.runInNewContext(globals);
}
