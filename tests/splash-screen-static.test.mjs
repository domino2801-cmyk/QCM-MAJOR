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

test("startup loading overlay appears before the application", () => {
    assert.match(html, /id="startup-loading"/);
    assert.match(html, /Chargement\.\.\./);
    assert.doesNotMatch(html, /script type="module" src="startup-splash-bootstrap\.js"/);
});

test("startup loading overlay is black and dismissible", () => {
    assert.match(css, /\.startup-loading\s*\{/);
    assert.match(css, /background:\s*#000/);
    assert.match(css, /\.startup-loading-hidden\s*\{/);
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
    assert.match(js, /hideStartupLoading\(\);/);
    assert.match(js, /if \(authUiReady\) \{\s*clearAuthMessages\(\);/);
});
