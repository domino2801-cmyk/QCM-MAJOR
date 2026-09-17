import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { activateSplashFallback, hideSplashScreen } from "../modules/startup-splash/index.js";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(testDirectory, "..");
const html = readFileSync(`${root}/index.html`, "utf8");
const js = readFileSync(`${root}/app.js`, "utf8");
const css = readFileSync(`${root}/ui/Style.css`, "utf8");

test("splash markup displays only the animated title text", () => {
    assert.match(html, /id="app-splash"/);
    assert.match(
        html,
        /<div id="app-splash" class="app-splash">\s*<div class="app-splash__content">\s*<h1 class="app-splash__title">Questions pour un Major<\/h1>\s*<\/div>\s*<\/div>/
    );
    assert.doesNotMatch(html, /app-splash__logo/);
    assert.doesNotMatch(html, /app-splash__kicker/);
    assert.doesNotMatch(html, /app-splash__tagline/);
    assert.doesNotMatch(html, /app-splash__status-line/);
    assert.doesNotMatch(html, /app-splash__loader/);
    assert.doesNotMatch(html, /id="app-splash-status"/);
    assert.match(html, /script type="module" src="startup-splash-bootstrap\.js"/);
});

test("splash styles support responsive layout and reduced motion", () => {
    assert.match(css, /\.app-splash\s*\{/);
    assert.match(css, /\.app-splash--hidden\s*\{/);
    assert.match(css, /\.app-splash__title\s*\{/);
    assert.match(css, /animation:\s*splashTitleReveal 900ms cubic-bezier\(0\.22, 1, 0\.36, 1\) both;/);
    assert.match(css, /@keyframes splashTitleReveal/);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
    assert.doesNotMatch(css, /\.app-splash__logo\s*\{/);
});

test("app initialization always hides the splash after startup", () => {
    assert.match(js, /import \{ activateSplashFallback, hideSplashScreen, setSplashStatus \} from "\.\/modules\/startup-splash\/index\.js"/);
    assert.match(js, /finally\s*\{\s*await hideSplashScreen\(\);\s*\}/);
});

test("hideSplashScreen marks the splash hidden in the reduced-motion path", async () => {
    const splash = createSplashFixture();
    let clearedTimeout = null;
    await hideSplashScreen({
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
        },
        document: {
            getElementById(id) {
                return id === "app-splash" ? splash : null;
            }
        },
        immediate: true
    });

    assert.equal(splash.dataset.state, "hidden");
    assert.equal(splash.hidden, true);
    assert.equal(splash.attributes["aria-hidden"], "true");
    assert.deepEqual(splash.addedClasses, ["app-splash--hidden"]);
    assert.equal(clearedTimeout, 99);
});

test("hideSplashScreen waits for the normal fade path before hiding the splash", async () => {
    const splash = createSplashFixture();
    const delays = [];
    const originalNow = Date.now;
    Date.now = () => 2000;
    try {
        await hideSplashScreen({
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
            },
            document: {
                getElementById(id) {
                    return id === "app-splash" ? splash : null;
                }
            }
        });
    } finally {
        Date.now = originalNow;
    }

    assert.deepEqual(delays, [400, 320]);
    assert.equal(splash.hidden, true);
    assert.equal(splash.dataset.state, "hidden");
});

test("hideSplashScreen reuses the same in-flight hide promise", async () => {
    const splash = createSplashFixture();
    const scheduledCallbacks = [];
    const windowFixture = {
        __bm4Splash: {
            shownAt: Date.now(),
            minDuration: 1400,
            hiddenClass: "app-splash--hidden",
            timeoutId: 5
        },
        clearTimeout() {},
        setTimeout(callback) {
            scheduledCallbacks.push(callback);
            return scheduledCallbacks.length;
        },
        matchMedia() {
            return { matches: true };
        }
    };
    const options = {
        window: windowFixture,
        document: {
            getElementById(id) {
                return id === "app-splash" ? splash : null;
            }
        },
        immediate: true
    };

    const firstHide = hideSplashScreen(options);
    const secondHide = hideSplashScreen(options);

    assert.equal(scheduledCallbacks.length, 1);
    assert.ok(windowFixture.__bm4Splash.hidePromise);
    scheduledCallbacks[0]();
    await Promise.all([firstHide, secondHide]);
    assert.equal(splash.hidden, true);
});

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

test("activateSplashFallback centralizes degraded login state", () => {
    const splash = createSplashFixture();
    const loginView = createViewFixture();
    const hiddenViews = new Map(
        ["register-view", "otp-view", "reset-view", "success-view", "admin-form"]
            .map(id => [id, createViewFixture()])
    );
    const loginMessage = { innerText: "" };
    const authTerminalState = { innerText: "" };
    const screenFixtures = [
        createScreenFixture("auth-screen"),
        createScreenFixture("theme-screen")
    ];
    const loginTabs = [createTabFixture(), createTabFixture()];
    const registerTabs = [createTabFixture(), createTabFixture("active")];

    activateSplashFallback({
        document: {
            getElementById(id) {
                if (id === "app-splash") return splash;
                if (id === "login-view") return loginView;
                if (hiddenViews.has(id)) return hiddenViews.get(id);
                if (id === "login-message") return loginMessage;
                if (id === "auth-terminal-state") return authTerminalState;
                return null;
            },
            querySelectorAll(selector) {
                if (selector === ".screen") return screenFixtures;
                if (selector === '#auth-screen [data-auth-mode="login"]') return loginTabs;
                if (selector === '#auth-screen [data-auth-mode="register"]') return registerTabs;
                return [];
            }
        },
        message: "Mode secours"
    });

    assert.equal(splash.hidden, true);
    assert.equal(splash.dataset.state, "hidden");
    assert.equal(loginView.hiddenClasses.has("hidden"), false);
    hiddenViews.forEach(view => assert.equal(view.hiddenClasses.has("hidden"), true));
    assert.equal(screenFixtures[0].active, true);
    assert.equal(screenFixtures[1].active, false);
    assert.equal(authTerminalState.innerText, "MODE DÉGRADÉ");
    assert.equal(loginMessage.innerText, "Mode secours");
    loginTabs.forEach(tab => assert.equal(tab.active, true));
    registerTabs.forEach(tab => assert.equal(tab.active, false));
});

function createViewFixture(initialClass) {
    return createClassListFixture(initialClass);
}

function createTabFixture(initialClass) {
    return createClassListFixture(initialClass);
}

function createScreenFixture(id) {
    const fixture = createClassListFixture();
    fixture.id = id;
    return fixture;
}

function createClassListFixture(initialClass) {
    const fixture = {
        hiddenClasses: new Set(initialClass ? [initialClass] : []),
        classList: {
            add(className) {
                fixture.hiddenClasses.add(className);
            },
            remove(className) {
                fixture.hiddenClasses.delete(className);
            },
            toggle(className, force) {
                if (force) fixture.hiddenClasses.add(className);
                else fixture.hiddenClasses.delete(className);
            }
        }
    };
    fixture.classList.owner = fixture;
    Object.defineProperty(fixture, "active", {
        get() {
            return fixture.hiddenClasses.has("active");
        },
        set(value) {
            if (value) fixture.hiddenClasses.add("active");
            else fixture.hiddenClasses.delete("active");
        }
    });
    return fixture;
}
