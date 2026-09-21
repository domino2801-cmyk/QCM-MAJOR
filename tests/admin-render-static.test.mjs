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
    assert.match(html, /id="theme-global-ranking-section"/);
    assert.match(html, /id="theme-global-ranking-list"/);
    assert.match(js, /getElementById\("theme-global-ranking-list"\)/);
    assert.match(html, /id="reset-question-history-btn"/);
    assert.doesNotMatch(html, /id="candidate-history-theme-filter"/);
    assert.doesNotMatch(html, /id="candidate-history-ranking-list"/);
    assert.match(html, /id="candidate-history-period"/);
    assert.match(html, /id="admin-questions-table"/);
    assert.match(html, /id="admin-results-table"/);
    assert.match(html, /id="admin-results-candidate-filter"/);
    assert.match(js, /getElementById\("admin-accounts-table"\)/);
    assert.match(js, /getElementById\("admin-questions-table"\)/);
    assert.match(js, /getElementById\("admin-results-table"\)/);
    assert.doesNotMatch(js, /getElementById\("admin-accounts-list"\)/);
    assert.doesNotMatch(js, /getElementById\("admin-questions-list"\)/);
    assert.doesNotMatch(js, /getElementById\("admin-results-list"\)/);
    assert.match(js, /admin-results-candidate-filter/);
    assert.match(js, /candidate_id/);
    assert.match(js, /user_id/);
    assert.match(js, /Synchronisation des comptes avec Supabase/);
    assert.match(js, /renderCandidateHistory/);
    assert.match(js, /score-critical/);
    assert.match(js, /Thème à travailler/);
    assert.match(js, /\.filter\(result => result\.theme === "all"\)\s*\.sort/);
    assert.match(html, /Top 3 campagne globale/);
});

test("showAuthenticatedApp refreshes the ranking on the connected screen", () => {
    const context = {
        calls: [],
        document: {
            getElementById(id) {
                if (id === "account-summary") {
                    return { innerText: "" };
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
        formatSpecialtyLabel(value) {
            return value || "GEN";
        },
        getAccounts() {
            return { "alice@test.com": { name: "Alice", specialty: "GEN" } };
        }
    };

    const fn = extractNamedFunction("showAuthenticatedApp", context);
    fn("alice@test.com", { name: "Alice", specialty: "GEN" });

    assert.deepEqual(context.calls[0], ["switch", "theme-screen"]);
    assert.deepEqual(context.calls[1][0], "render");
    assert.equal(context.calls[1][1].length, 3);
});

function extractNamedFunction(name, globals = {}) {
    const script = new vm.Script(`(${js.includes(\`async function ${name}\`) ? js.slice(js.indexOf(\`async function ${name}\`), js.indexOf("}\n", js.indexOf(\`async function ${name}\`)) + 2) : js.slice(js.indexOf(\`function ${name}\`), js.indexOf("}\n", js.indexOf(\`function ${name}\`)) + 2)})`);
    return script.runInNewContext(globals);
}
