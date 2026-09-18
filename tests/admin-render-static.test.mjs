import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(testDirectory, "..");
const html = readFileSync(`${root}/index.html`, "utf8");
const js = readFileSync(`${root}/app.js`, "utf8");

test("admin renderers target the existing table body ids", () => {
    assert.match(html, /id="admin-accounts-table"/);
    assert.match(html, /id="admin-questions-table"/);
    assert.match(html, /id="admin-results-table"/);
    assert.match(js, /getElementById\("admin-accounts-table"\)/);
    assert.match(js, /getElementById\("admin-questions-table"\)/);
    assert.match(js, /getElementById\("admin-results-table"\)/);
    assert.doesNotMatch(js, /getElementById\("admin-accounts-list"\)/);
    assert.doesNotMatch(js, /getElementById\("admin-questions-list"\)/);
    assert.doesNotMatch(js, /getElementById\("admin-results-list"\)/);
});
