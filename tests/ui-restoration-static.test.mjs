import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(`${root}/index.html`, "utf8");
const css = readFileSync(`${root}/ui/Style.css`, "utf8");

test("podium artwork keeps the original compact dimensions", () => {
    assert.match(css, /\.podium-icon\s*\{[^}]*width:\s*24px;[^}]*height:\s*28px;[^}]*max-width:\s*100%;/);
    assert.match(css, /\.global-ranking-item:first-child \.podium-icon\s*\{[^}]*width:\s*28px;[^}]*height:\s*28px;/);
});

test("restored stylesheet retains history and mobile layout rules through its end", () => {
    assert.match(css, /#candidate-history-status,\s*#candidate-history-sync-status\s*\{\s*text-align:\s*center;/);
    assert.match(css, /\.candidate-history-recommendation\s*\{/);
    assert.match(css, /@media \(max-width: 600px\)\s*\{\s*#theme-screen/);
    assert.match(css, /\.qty-choice-btn\s*\{\s*min-height:\s*50px;\s*padding:\s*12px 4px;\s*font-size:\s*0\.9rem;\s*\}\s*\}\s*$/);
});

test("application markup is complete rather than truncated", () => {
    assert.doesNotMatch(html, /\.\.\.\s*$/m);
    for (const id of [
        "admin-accounts-table",
        "admin-questions-table",
        "admin-question-reports-table",
        "admin-results-table",
        "next-question-btn",
        "stat-correct",
        "stat-wrong",
        "stat-skipped",
        "btn-new-mission"
    ]) {
        assert.ok(html.includes(`id="${id}"`), `${id} should be present`);
    }
    assert.match(html, /<option value="5">6\. Implantation des unités<\/option><\/select>/);
    assert.match(html, /<option value="6">6\. Implantation des unités<\/option>/);
});
