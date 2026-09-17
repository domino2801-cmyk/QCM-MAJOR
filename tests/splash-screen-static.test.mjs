import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(testDirectory, "..");
const html = readFileSync(`${root}/index.html`, "utf8");
const css = readFileSync(`${root}/ui/Style.css`, "utf8");

test("startup splash markup is removed from the entry page", () => {
    assert.doesNotMatch(html, /id="app-splash"/);
    assert.doesNotMatch(html, /id="app-splash-status"/);
    assert.doesNotMatch(html, /script type="module" src="startup-splash-bootstrap\.js"/);
});

test("startup splash styles are removed from shared stylesheet", () => {
    assert.doesNotMatch(css, /\.app-splash\s*\{/);
    assert.doesNotMatch(css, /\.app-splash__logo\s*\{/);
    assert.doesNotMatch(css, /\.app-splash--hidden\s*\{/);
});
