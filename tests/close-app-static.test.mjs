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

test("login screen keeps a close-app button with fallback content", () => {
    assert.match(html, /id="close-app"/);

    const statement = extractStatement(
        /document\.getElementById\("close-app"\)\.addEventListener\("click",\s*\(\)\s*=>\s*\{[\s\S]*?\}\s*\);/
    );
    const body = { innerHTML: "" };
    const listeners = new Map();
    let closeCalls = 0;

    runStatement(statement, {
        document: {
            body,
            getElementById(id) {
                assert.equal(id, "close-app");
                return {
                    addEventListener(eventName, handler) {
                        listeners.set(eventName, handler);
                    }
                };
            }
        },
        window: {
            close() {
                closeCalls += 1;
            }
        }
    });

    const clickHandler = listeners.get("click");
    assert.equal(typeof clickHandler, "function");
    clickHandler();
    assert.equal(closeCalls, 1);
    assert.equal(body.innerHTML, "<main class=\"app-closed\"><h1>Application fermée</h1></main>");
});

test("btn-new-mission returns to theme selection and resets the current selection", () => {
    assert.match(html, /id="btn-new-mission"/);

    const statement = extractStatement(
        /document\.getElementById\("btn-new-mission"\)\??\.addEventListener\("click",\s*\(\)\s*=>\s*\{[\s\S]*?\}\s*\);/
    );

    const listeners = new Map();
    const context = {
        document: {
            getElementById(id) {
                assert.equal(id, "btn-new-mission");
                return {
                    addEventListener(eventName, handler) {
                        listeners.set(eventName, handler);
                    }
                };
            },
            querySelector(selector) {
                assert.equal(selector, ".btn-theme");
                return {
                    focus() {
                        context.focusCalled = true;
                    }
                };
            }
        },
        uiController: {
            resetThemeSelectionCalled: false,
            switchedTo: null,
            resetThemeSelection() {
                this.resetThemeSelectionCalled = true;
            },
            switchScreen(screenId) {
                this.switchedTo = screenId;
            }
        },
        selectedTheme: "3",
        maxQuestions: 12,
        focusCalled: false
    };

    assert.doesNotThrow(() => {
        runStatement(statement, context);
    });

    const clickHandler = listeners.get("click");
    assert.equal(typeof clickHandler, "function");
    clickHandler();
    assert.equal(context.selectedTheme, null);
    assert.equal(context.maxQuestions, 0);
    assert.equal(context.uiController.resetThemeSelectionCalled, true);
    assert.equal(context.uiController.switchedTo, "theme-screen");
    assert.equal(context.focusCalled, true);
});

test("btn-new-mission listener registration stays null-safe", () => {
    const statement = extractStatement(
        /document\.getElementById\("btn-new-mission"\)\??\.addEventListener\("click",\s*\(\)\s*=>\s*\{[\s\S]*?\}\s*\);/
    );

    assert.doesNotThrow(() => {
        runStatement(statement, {
            document: {
                getElementById(id) {
                    assert.equal(id, "btn-new-mission");
                    return null;
                },
                querySelector(selector) {
                    assert.equal(selector, ".btn-theme");
                    return null;
                }
            },
            uiController: {
                resetThemeSelection() {
                    throw new Error("listener should not run when button is missing");
                },
                switchScreen() {
                    throw new Error("listener should not run when button is missing");
                }
            }
        });
    });
});

function extractStatement(pattern) {
    const match = js.match(pattern);
    assert.ok(match, `Unable to find statement matching ${pattern}`);
    return match[0];
}

function runStatement(statement, globals) {
    const script = new vm.Script(statement);
    return script.runInNewContext(globals);
}
