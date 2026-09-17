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
    assert.doesNotMatch(html, /id="final-score"/);
});

test("quiz option locking and marking target #options-grid in app.js", () => {
    assert.match(js, /querySelectorAll\("#options-grid \.btn, #options-grid \.btn-skip"\)/);
    assert.match(js, /querySelectorAll\("#options-grid \.btn"\)/);
    assert.doesNotMatch(js, /querySelectorAll\("#options \.btn, #options \.btn-skip"\)/);
    assert.doesNotMatch(js, /querySelectorAll\("#options \.btn"\)/);
});
