import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import vm from "node:vm";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(testDirectory, "..");
const html = readFileSync(`${root}/index.html`, "utf8");
const js = readFileSync(`${root}/app.js`, "utf8");
const { uiController } = await import(pathToFileURL(path.join(root, "modules/ui-controller/index.js")).href);

test("login screen keeps a close-app button with fallback content", async () => {
    assert.match(html, /id="close-app"/);

    const marker = 'document.getElementById("close-app").addEventListener("click", async () => {';
    const start = js.indexOf(marker);
    assert.notEqual(start, -1, "Unable to find close-app listener");
    const bodyStart = start + marker.length;
    let depth = 1;
    let end = bodyStart;
    while (end < js.length && depth > 0) {
        if (js[end] === "{") depth += 1;
        if (js[end] === "}") depth -= 1;
        end += 1;
    }
    const statement = `${js.slice(start, end)});`;
    const body = { innerHTML: "" };
    const listeners = new Map();
    let closeCalls = 0;

    runStatement(statement, {
        document: {
            body,
            getElementById(id) {
                if (id === "quiz-screen") {
                    return { classList: { contains: () => false } };
                }
                if (id === "report-screen") {
                    return { classList: { contains: () => false } };
                }
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
    await clickHandler();
    assert.equal(closeCalls, 1);
    assert.equal(body.innerHTML, "<main class=\"app-closed\"><h1>Application fermée</h1></main>");
});

test("close-app returns to candidate screen instead of closing during a quiz", () => {
    assert.match(js, /quiz-screen"\)\?\.classList\.contains\("active"\)/);
    assert.match(js, /report-screen"\)\?\.classList\.contains\("active"\)/);
    assert.match(js, /Abandonner le combat en cours et effectuer un repli stratégique/);
    assert.match(js, /uiController\.switchScreen\("theme-screen"\)/);
});

test("quiz abandonment uses the custom overlay instead of the native confirm", () => {
    assert.match(html, /id="confirm-overlay"/);
    assert.match(html, /id="confirm-ok-btn"/);
    assert.match(html, /id="confirm-cancel-btn"/);
    assert.match(js, /showConfirmOverlay\(\{/);
    assert.match(html, /id="confirm-cancel-btn"[^>]*>NON</);
    assert.match(html, /id="confirm-ok-btn"[^>]*>OUI</);
    assert.match(js, /okLabel: "OUI"/);
    assert.match(js, /cancelLabel: "NON"/);
    assert.doesNotMatch(js, /window\.confirm\("Abandonner le combat/);
});

test("close-app button is hidden on the candidate theme screen", () => {
    const css = readFileSync(`${root}/ui/Style.css`, "utf8");
    assert.match(css, /body:has\(#theme-screen\.active\) \.close-app/);
    assert.match(css, /body:has\(#history-screen\.active\) \.close-app[\s,]/);
});

test("theme selection presents six accessible objective cards backed by the theme selector", () => {
    assert.match(html, /id="theme-select" class="theme-objective-native-select" aria-hidden="true" tabindex="-1"/);
    assert.match(html, /class="theme-objective-grid" role="group" aria-labelledby="objective-label"/);
    assert.equal((html.match(/class="theme-objective-btn(?: active)?" data-theme="/g) || []).length, 6);
    assert.doesNotMatch(html, /theme-objective-index|>0[1-6]<\/span>/);
    assert.doesNotMatch(html, /class="btn-theme"\s+data-theme="1"/);
    assert.doesNotMatch(html, /class="btn-theme"\s+data-theme="5"/);
    assert.match(js, /objectiveButtons\.forEach\(button => \{/);
    assert.match(js, /themeSelect\.dispatchEvent\(new Event\("change", \{ bubbles: true \}\)\)/);
});

test("BM4 exam-style campaign keeps a dedicated button", () => {
    assert.match(html, /id="theme-global-btn"/);
    assert.match(html, /COMBAT DE HAUTE INTENSITE/);
    assert.match(html, /id="theme-training-btn"/);
    assert.match(html, /SIMULATION DE COMBAT/);
    assert.match(html, /id="campaign-mode-label">ZONE HAUTE INTENSITÉ<\/span>/);
    assert.match(html, /class="theme-objective-btn active" data-theme="1" aria-pressed="true"><span class="theme-objective-name">Organisation et Commandement/);
    assert.match(html, /<option value="1" selected>Organisation et Commandement<\/option>/);
    assert.match(html, /id="qty-theme" value="10"/);
    assert.match(html, /class="qty-choice-btn active" data-qty="10" aria-pressed="true"/);
    assert.match(html, /class="qty-choice-btn" data-qty="20" aria-pressed="false"/);
    assert.match(html, /class="qty-choice-btn" data-qty="30"/);
    assert.match(html, />ZONE GÉOGRAPHIQUE BRIGADE</);
    assert.match(html, />Sélection de l'objectif</);
    assert.match(html, />INTENSITÉ DU COMBAT</);
    assert.match(html, /<button id="start-btn"[^>]*><span class="start-button-hint">Sélectionner la zone de combat avant de<\/span><span class="start-button-label">Déclencher l'offensive<\/span><\/button>/);
});

test("theme defaults select organization and command with 10 questions", () => {
    assert.match(html, /class="theme-objective-btn active" data-theme="1" aria-pressed="true"/);
    assert.match(html, /<option value="1" selected>Organisation et Commandement<\/option>/);
    assert.match(html, /class="qty-choice-btn active" data-qty="10" aria-pressed="true"/);
    assert.match(html, /id="qty-theme" value="10"/);
    assert.match(js, /syncQtyChoiceButtons\(qtyInput\?\.value \|\| "20"\);\s*applySelectedTheme\(\);/);
});

test("resetThemeSelection restores the default zone and intensity", () => {
    const makeButton = (dataset = {}) => ({
        dataset,
        active: false,
        attributes: {},
        classList: {
            remove(name) {
                if (name === "active") this.owner.active = false;
            },
            toggle(name, enabled) {
                if (name === "active") this.owner.active = enabled;
            },
            owner: null
        },
        setAttribute(name, value) {
            this.attributes[name] = value;
        }
    });
    const objectiveButtons = ["1", "2"].map(theme => makeButton({ theme }));
    const qtyButtons = ["10", "20"].map(qty => makeButton({ qty }));
    for (const button of [...objectiveButtons, ...qtyButtons]) button.classList.owner = button;

    const themeSelect = {
        value: "2",
        dispatchEvent(event) {
            this.dispatchedEvent = event.type;
        }
    };
    const qtyInput = { value: 20 };
    const globalButton = makeButton();
    globalButton.classList.owner = globalButton;
    const trainingButton = makeButton();
    trainingButton.classList.owner = trainingButton;
    const startButton = { disabled: true };
    const previousDocument = globalThis.document;
    globalThis.document = {
        getElementById(id) {
            return {
                "theme-select": themeSelect,
                "qty-theme": qtyInput,
                "theme-global-btn": globalButton,
                "theme-training-btn": trainingButton,
                "start-btn": startButton
            }[id] || null;
        },
        querySelectorAll(selector) {
            return {
                ".theme-objective-btn": objectiveButtons,
                ".qty-choice-btn": qtyButtons
            }[selector] || [];
        }
    };

    try {
        uiController.resetThemeSelection();
    } finally {
        globalThis.document = previousDocument;
    }

    assert.equal(themeSelect.value, "1");
    assert.equal(qtyInput.value, 10);
    assert.equal(objectiveButtons[0].active, true);
    assert.equal(objectiveButtons[0].attributes["aria-pressed"], "true");
    assert.equal(objectiveButtons[1].active, false);
    assert.equal(qtyButtons[0].active, true);
    assert.equal(qtyButtons[0].attributes["aria-pressed"], "true");
    assert.equal(qtyButtons[1].active, false);
    assert.equal(globalButton.attributes["aria-pressed"], "false");
    assert.equal(trainingButton.attributes["aria-pressed"], "false");
    assert.equal(startButton.disabled, false);
    assert.equal(themeSelect.dispatchedEvent, "change");
});

test("btn-new-mission returns to theme selection and resets the current selection", () => {
    assert.match(html, /id="btn-new-mission"/);

    const statement = extractStatement(
        /document\.getElementById\("btn-new-mission"\)\??\.addEventListener\("click",\s*\(\)\s*=>\s*\{[\s\S]*?\}\s*\);/
    );

    const listeners = new Map();
    let stopQuizTimerCalled = false;
    const context = {
        document: {
            getElementById(id) {
                if (id === "btn-new-mission") {
                    return {
                        addEventListener(eventName, handler) {
                            listeners.set(eventName, handler);
                        }
                    };
                }

                if (id === "theme-select") {
                    return {
                        focus() {
                            context.focusCalled = true;
                        }
                    };
                }

                assert.fail(`unexpected id: ${id}`);
            }
        },
        stopQuizTimer() {
            stopQuizTimerCalled = true;
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
    assert.equal(stopQuizTimerCalled, true);
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
                    assert.match(id, /^(btn-new-mission|theme-select)$/);
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
