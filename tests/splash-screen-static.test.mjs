import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(testDirectory, "..");
const html = readFileSync(`${root}/index.html`, "utf8");
const js = readFileSync(`${root}/app.js`, "utf8");
const css = readFileSync(`${root}/ui/Style.css`, "utf8");

test("splash screen markup is present before the main container", () => {
    assert.match(html, /id="splash-screen"/);
    assert.match(html, /id="splash-status"/);
    assert.match(html, /aria-live="polite"/);

    const splashIndex = html.indexOf('id="splash-screen"');
    const containerIndex = html.indexOf('class="container"');
    assert.ok(splashIndex !== -1 && containerIndex !== -1 && splashIndex < containerIndex);
});

test("splash screen styles include hidden state and reduced-motion support", () => {
    assert.match(css, /\.splash-screen\s*\{/);
    assert.match(css, /\.splash-screen\.is-hidden\s*\{/);
    assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
});

test("app bootstrap includes splash timing and safety timeout", () => {
    assert.match(js, /const SPLASH_MIN_DURATION_MS = 1200/);
    assert.match(js, /const SPLASH_SAFETY_TIMEOUT_MS = 5000/);
    assert.match(js, /function hideSplashScreen\(\)/);
    assert.match(js, /async function bootstrapApplication\(\)/);
    assert.match(js, /document\.addEventListener\("DOMContentLoaded", bootstrapApplication\)/);
});
