import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(testDirectory, "..");
const html = readFileSync(`${root}/index.html`, "utf8");
const css = readFileSync(`${root}/ui/Style.css`, "utf8");

function extractDivBlockById(markup, id) {
    const openTagPattern = new RegExp(`<div\\b[^>]*\\bid="${id}"[^>]*>`, "i");
    const openTagMatch = openTagPattern.exec(markup);

    if (!openTagMatch) {
        return null;
    }

    const divTagPattern = /<\/?div\b[^>]*>/gi;
    divTagPattern.lastIndex = openTagMatch.index + openTagMatch[0].length;

    let depth = 1;
    let tagMatch;

    while ((tagMatch = divTagPattern.exec(markup))) {
        depth += tagMatch[0].startsWith("</div") ? -1 : 1;

        if (depth === 0) {
            return markup.slice(openTagMatch.index, divTagPattern.lastIndex);
        }
    }

    return null;
}

function normalizeCss(stylesheet) {
    return stylesheet.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ").trim();
}

function parseCssDeclarations(ruleText) {
    return Object.fromEntries(
        ruleText
            .split(";")
            .map(entry => entry.trim())
            .filter(Boolean)
            .map(entry => {
                const separatorIndex = entry.indexOf(":");
                return [
                    entry.slice(0, separatorIndex).trim(),
                    entry.slice(separatorIndex + 1).trim()
                ];
            })
    );
}

function collectCssRules(stylesheet) {
    const source = stylesheet.replace(/\/\*[\s\S]*?\*\//g, "");
    const rules = [];
    let selectorBuffer = "";
    let blockBuffer = "";
    let currentSelector = "";
    let depth = 0;

    for (const character of source) {
        if (character === "{") {
            if (depth === 0) {
                currentSelector = selectorBuffer.trim();
                selectorBuffer = "";
            } else {
                blockBuffer += character;
            }

            depth += 1;
            continue;
        }

        if (character === "}") {
            depth -= 1;

            if (depth === 0) {
                const blockContent = blockBuffer.trim();

                if (currentSelector.startsWith("@")) {
                    rules.push(...collectCssRules(blockContent));
                } else if (currentSelector) {
                    rules.push({
                        selectors: currentSelector
                            .split(",")
                            .map(value => value.replace(/\s+/g, " ").trim())
                            .filter(Boolean),
                        declarations: parseCssDeclarations(normalizeCss(blockContent))
                    });
                }

                currentSelector = "";
                blockBuffer = "";
            } else {
                blockBuffer += character;
            }

            continue;
        }

        if (depth === 0) {
            selectorBuffer += character;
        } else {
            blockBuffer += character;
        }
    }

    return rules;
}

function findCssRule(stylesheet, selector) {
    const normalizedSelector = selector.replace(/\s+/g, " ").trim();
    return collectCssRules(stylesheet).find(rule => rule.selectors.includes(normalizedSelector)) ?? null;
}

test("theme screen keeps the logout button, header and account summary order", () => {
    const themeScreenMarkup = extractDivBlockById(html, "theme-screen");

    assert.ok(themeScreenMarkup);

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
    const accountBarRule = findCssRule(css, "#theme-screen .account-bar");
    const logoutButtonRule = findCssRule(css, "#theme-screen .account-bar #logout-btn");

    assert.ok(accountBarRule);
    assert.ok(logoutButtonRule);
    assert.equal(accountBarRule.declarations["justify-content"], "center");
    assert.equal(logoutButtonRule.declarations.margin, "0");
    assert.equal(logoutButtonRule.declarations.transform, "none");
});
