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

test("missing btn-new-mission does not throw during listener registration", () => {
    assert.doesNotMatch(html, /id="btn-new-mission"/);

    const statement = extractStatement(
        /document\.getElementById\("btn-new-mission"\)\??\.addEventListener\("click",\s*\(\)\s*=>\s*\{[\s\S]*?\}\s*\);/
    );

    assert.doesNotThrow(() => {
        runStatement(statement, {
            document: {
                getElementById(id) {
                    assert.equal(id, "btn-new-mission");
                    return null;
                }
            },
            uiController: {
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
