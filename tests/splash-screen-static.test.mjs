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

test("bootstrap fallback updates splash status and still hides splash on init error", async () => {
    let clearTimeoutCalled = false;
    let hideCalled = false;
    let statusMessage = "";
    let now = 0;
    const bootstrapApplication = extractNamedFunction("bootstrapApplication", {
        initializeApp: async () => {
            throw new Error("boom");
        },
        setupSplashSafetyTimeout: () => () => {
            clearTimeoutCalled = true;
        },
        setSplashStatus: message => {
            statusMessage = message;
        },
        hideSplashScreen: () => {
            hideCalled = true;
        },
        SPLASH_MIN_DURATION_MS: 1200,
        Date: {
            now: () => {
                now += 100;
                return now;
            }
        },
        Math,
        window: {
            setTimeout: callback => {
                callback();
                return 1;
            }
        },
        Promise,
        console: { error() {} }
    });

    await bootstrapApplication();
    assert.match(statusMessage, /Mode dégradé/);
    assert.equal(clearTimeoutCalled, true);
    assert.equal(hideCalled, true);
});

function extractNamedFunction(name, globals = {}) {
    const asyncSignature = `async function ${name}`;
    const plainSignature = `function ${name}`;
    const start = js.includes(asyncSignature)
        ? js.indexOf(asyncSignature)
        : js.indexOf(plainSignature);
    assert.notEqual(start, -1, `Unable to find function ${name}`);

    const bodyStart = js.indexOf("{", start);
    let depth = 0;
    let cursor = bodyStart;
    while (cursor < js.length) {
        const character = js[cursor];
        if (character === "{") depth += 1;
        if (character === "}") {
            depth -= 1;
            if (depth === 0) break;
        }
        cursor += 1;
    }

    const functionSource = js.slice(start, cursor + 1);
    return new Function(...Object.keys(globals), `return (${functionSource});`)(...Object.values(globals));
}
