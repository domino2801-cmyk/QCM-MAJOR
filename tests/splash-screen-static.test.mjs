import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(testDirectory, "..");
const html = readFileSync(`${root}/index.html`, "utf8");
const js = readFileSync(`${root}/app.js`, "utf8");
const css = readFileSync(`${root}/ui/Style.css`, "utf8");

test("splash markup uses the main logo and tactical status elements", () => {
    assert.match(html, /id="app-splash"/);
    assert.match(html, /src="public\/images\/logo2\.png"/);
    assert.match(html, /id="app-splash-status" role="status" aria-live="polite" aria-atomic="true"/);
    assert.match(html, /QUESTION POUR UN MAJOR/);
    assert.match(html, /window\.__bm4Splash/);
    assert.match(html, /activateFallback/);
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

test("hideSplashScreen marks the splash hidden in the reduced-motion path", async () => {
    const splash = createSplashFixture();
    let clearedTimeout = null;
    const hideSplashScreen = extractNamedFunction("hideSplashScreen", {
        splashScreenId: "app-splash",
        splashHiddenClass: "app-splash--hidden",
        document: {
            getElementById(id) {
                return id === "app-splash" ? splash : null;
            }
        },
        window: {
            __bm4Splash: {
                shownAt: Date.now(),
                minDuration: 1400,
                hiddenClass: "app-splash--hidden",
                timeoutId: 99
            },
            clearTimeout(id) {
                clearedTimeout = id;
            },
            setTimeout(callback) {
                callback();
                return 1;
            },
            matchMedia() {
                return { matches: true };
            }
        }
    });

    await hideSplashScreen({ immediate: true });

    assert.equal(splash.dataset.state, "hidden");
    assert.equal(splash.hidden, true);
    assert.equal(splash.attributes["aria-hidden"], "true");
    assert.deepEqual(splash.addedClasses, ["app-splash--hidden"]);
    assert.equal(clearedTimeout, 99);
});

test("hideSplashScreen waits for the normal fade path before hiding the splash", async () => {
    const splash = createSplashFixture();
    const delays = [];
    const hideSplashScreen = extractNamedFunction("hideSplashScreen", {
        splashScreenId: "app-splash",
        splashHiddenClass: "app-splash--hidden",
        Date: {
            now() {
                return 2000;
            }
        },
        document: {
            getElementById(id) {
                return id === "app-splash" ? splash : null;
            }
        },
        window: {
            __bm4Splash: {
                shownAt: 1000,
                minDuration: 1400,
                hiddenClass: "app-splash--hidden",
                timeoutId: 7
            },
            clearTimeout() {},
            setTimeout(callback, delay = 0) {
                delays.push(delay);
                callback();
                return 1;
            },
            matchMedia() {
                return { matches: false };
            }
        }
    });

    await hideSplashScreen();

    assert.deepEqual(delays, [400, 320]);
    assert.equal(splash.hidden, true);
    assert.equal(splash.dataset.state, "hidden");
});

function extractNamedFunction(name, globals = {}) {
    const asyncSignature = `async function ${name}`;
    const plainSignature = `function ${name}`;
    const start = js.includes(asyncSignature)
        ? js.indexOf(asyncSignature)
        : js.indexOf(plainSignature);
    assert.notEqual(start, -1, `Unable to find function ${name}`);

    const paramsStart = js.indexOf("(", start);
    let paramsDepth = 0;
    let cursor = paramsStart;
    while (cursor < js.length) {
        const character = js[cursor];
        if (character === "(") paramsDepth += 1;
        if (character === ")") {
            paramsDepth -= 1;
            if (paramsDepth === 0) break;
        }
        cursor += 1;
    }

    const bodyStart = js.indexOf("{", cursor);
    let depth = 0;
    cursor = bodyStart;
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
    const script = new vm.Script(`(${functionSource})`);
    return script.runInNewContext(globals);
}

function createSplashFixture() {
    const fixture = {
        dataset: {},
        hidden: false,
        attributes: {},
        addedClasses: [],
        classList: {
            add: className => fixture.addedClasses.push(className)
        },
        setAttribute(name, value) {
            this.attributes[name] = value;
        }
    };
    return fixture;
}
