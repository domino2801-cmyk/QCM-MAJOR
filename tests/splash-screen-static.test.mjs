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

test("splash markup uses the main logo and tactical status elements", () => {
    assert.match(html, /id="app-splash"/);
    assert.match(html, /src="public\/images\/logo2\.png"/);
    assert.match(html, /id="app-splash-status"/);
    assert.match(html, /QUESTION POUR UN MAJOR/);
    assert.match(html, /window\.__bm4Splash/);
});

test("splash styles support responsive layout and reduced motion", () => {
    assert.match(css, /\.app-splash\s*\{/);
    assert.match(css, /\.app-splash--hidden\s*\{/);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
    assert.match(css, /\.app-splash__logo\s*\{/);
});

test("app initialization always hides the splash after startup", () => {
    assert.match(js, /function setSplashStatus/);
    assert.match(js, /async function hideSplashScreen/);
    assert.match(js, /finally\s*\{\s*await hideSplashScreen\(\);\s*\}/);
});
