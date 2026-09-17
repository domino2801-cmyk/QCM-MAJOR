import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(testDirectory, "..");
const html = readFileSync(`${root}/index.html`, "utf8");
const css = readFileSync(`${root}/ui/Style.css`, "utf8");

function findCssRuleDeclarations(stylesheet, selector) {
    const normalizedSelector = selector.replace(/\s+/g, " ").trim();

    for (const block of stylesheet.split("}")) {
        const [rawSelectors, declarations] = block.split("{");
        if (!declarations) {
            continue;
        }

        const selectors = rawSelectors
            .split(",")
            .map(value => value.replace(/\s+/g, " ").trim())
            .filter(Boolean);

        if (selectors.includes(normalizedSelector)) {
            return declarations;
        }
    }

    return null;
}

test("theme screen keeps the logout button, header and account summary order", () => {
    const themeScreenStart = html.indexOf('<div id="theme-screen" class="screen">');
    const themeScreenEnd = html.indexOf('<div id="quiz-screen"', themeScreenStart);

    assert.notEqual(themeScreenStart, -1);
    assert.notEqual(themeScreenEnd, -1);

    const themeScreenMarkup = html.slice(themeScreenStart, themeScreenEnd);
    const accountBarIndex = themeScreenMarkup.indexOf('class="account-bar"');
    const logoutButtonIndex = themeScreenMarkup.indexOf('id="logout-btn"');
    const brandLockupIndex = themeScreenMarkup.indexOf('class="brand-lockup"');
    const accountSummaryIndex = themeScreenMarkup.indexOf('id="account-summary"');

    assert.notEqual(accountBarIndex, -1);
    assert.notEqual(logoutButtonIndex, -1);
    assert.notEqual(brandLockupIndex, -1);
    assert.notEqual(accountSummaryIndex, -1);
    assert.ok(accountBarIndex < brandLockupIndex);
    assert.ok(logoutButtonIndex > accountBarIndex);
    assert.ok(brandLockupIndex < accountSummaryIndex);
});

test("theme screen styles center the logout button without offsetting it", () => {
    const accountBarRule = findCssRuleDeclarations(css, "#theme-screen .account-bar");
    const logoutButtonRule = findCssRuleDeclarations(css, "#theme-screen .account-bar #logout-btn");

    assert.ok(accountBarRule);
    assert.ok(logoutButtonRule);
    assert.match(accountBarRule, /justify-content:\s*center;/);
    assert.match(logoutButtonRule, /margin:\s*0;/);
    assert.match(logoutButtonRule, /transform:\s*none;/);
});
