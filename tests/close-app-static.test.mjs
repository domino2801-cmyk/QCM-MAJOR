import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(testDirectory, "..");
const html = readFileSync(`${root}/index.html`, "utf8");
const js = readFileSync(`${root}/app.js`, "utf8");

test("login screen keeps a close-app button wired from app initialization", () => {
    assert.match(html, /id="close-app"/);
    assert.match(js, /initializeAppInteractions\(\)/);
    assert.match(js, /document\.getElementById\("close-app"\)\.addEventListener\("click",\s*\(\)\s*=>\s*\{\s*window\.close\(\);\s*document\.body\.innerHTML = "<main class=\\"app-closed\\"><h1>Application fermée<\/h1><\/main>";\s*\}\);/);
});

test("missing btn-new-mission cannot block close-app listener registration", () => {
    assert.doesNotMatch(html, /id="btn-new-mission"/);
    assert.match(js, /document\.getElementById\("btn-new-mission"\)\?\.addEventListener\("click",\s*\(\)\s*=>\s*\{/);
});
