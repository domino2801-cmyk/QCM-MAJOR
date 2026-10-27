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
    assert.match(html, /id="refresh-admin-accounts-btn"/);
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
