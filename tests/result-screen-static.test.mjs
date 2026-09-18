import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(testDirectory, "..");
const html = readFileSync(`${root}/index.html`, "utf8");
const js = readFileSync(`${root}/app.js`, "utf8");

test("result screen exposes the ids expected by app.js", () => {
    assert.match(html, /id="score-display"/);
    assert.match(html, /id="result-details"/);
    assert.match(html, /id="stat-correct"/);
    assert.match(html, /id="stat-wrong"/);
    assert.match(html, /id="stat-skipped"/);
    assert.match(html, /id="stat-brut"/);
    assert.match(html, /id="brut-max"/);
    assert.match(html, /id="review-section"/);
    assert.match(html, /id="review-list"/);
    assert.match(html, /id="btn-new-mission"/);
    assert.match(html, /id="btn-evolution-result"/);
    assert.match(html, /id="global-evolution-section"/);
    assert.match(html, /id="global-evolution-chart"/);
    assert.match(html, /id="global-evolution-list"/);
    assert.doesNotMatch(html, /id="final-score"/);
});

test("quiz option locking and marking target #options-grid in app.js", () => {
    assert.match(js, /querySelectorAll\("#options-grid \.btn, #skip-btn"\)/);
    assert.match(js, /querySelectorAll\("#options-grid \.btn"\)/);
    assert.doesNotMatch(js, /querySelectorAll\("#options-grid \.btn, #options-grid \.btn-skip"\)/);
    assert.doesNotMatch(js, /querySelectorAll\("#options \.btn, #skip-btn"\)/);
    assert.doesNotMatch(js, /querySelectorAll\("#options \.btn"\)/);
});

test("result screen in app.js computes and shows max points from total questions", () => {
    assert.match(js, /const maxPts = total \* 4;/);
    assert.match(js, /setResultText\(\["brut-max"\], `\/ \$\{maxPts\}`\);/);
});

test("result evolution only uses global campaign results", () => {
    assert.match(js, /result\.theme === "all" && result\.candidateId === candidateId/);
    assert.match(js, /btn-evolution-result/);
    assert.match(js, /global-evolution-list/);
});
