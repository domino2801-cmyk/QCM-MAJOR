import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(testDirectory, "..");
const html = readFileSync(`${root}/index.html`, "utf8");
const css = readFileSync(`${root}/ui/Style.css`, "utf8");
const js = readFileSync(`${root}/app.js`, "utf8");

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

test("app bootstrap no longer wires startup splash logic", () => {
    assert.doesNotMatch(js, /from "\.\/modules\/startup-splash\/index\.js"/);
    assert.doesNotMatch(js, /setSplashStatus\(/);
    assert.doesNotMatch(js, /activateSplashFallback\(/);
    assert.doesNotMatch(js, /hideSplashScreen\(/);
});

test("app bootstrap keeps an explicit startup recovery fallback", () => {
    assert.match(js, /from "\.\/modules\/startup-recovery\/index\.js"/);
    assert.match(js, /showStartupRecoveryState\(\{ message: startupFallbackMessage \}\)/);
    assert.match(js, /uiController\.switchScreen\("auth-screen"\)/);
    assert.match(js, /showAuthView\("login"\)/);
});
