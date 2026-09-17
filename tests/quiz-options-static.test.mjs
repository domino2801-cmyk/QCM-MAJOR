import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import vm from "node:vm";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(testDirectory, "..");
const appJs = readFileSync(`${root}/app.js`, "utf8");
const { uiController } = await import(pathToFileURL(`${root}/modules/ui-controller/index.js`).href);

function extractFunction(source, functionName) {
    const marker = `function ${functionName}(`;
    const start = source.indexOf(marker);

    assert.notEqual(start, -1, `Unable to find ${functionName}`);

    const bodyStart = source.indexOf("{", start);
    let depth = 0;

    for (let index = bodyStart; index < source.length; index += 1) {
        const character = source[index];

        if (character === "{") depth += 1;
        if (character === "}") depth -= 1;

        if (depth === 0) {
            return source.slice(start, index + 1);
        }
    }

    throw new Error(`Unable to extract ${functionName}`);
}

function createButton() {
    const classes = new Set();
    return {
        className: "",
        innerText: "",
        disabled: false,
        onclick: null,
        classList: {
            add(...tokens) {
                tokens.forEach(token => classes.add(token));
            },
            contains(token) {
                return classes.has(token);
            }
        }
    };
}

function createContainer(initialChildren = []) {
    let html = "";
    return {
        children: [...initialChildren],
        appendChild(child) {
            this.children.push(child);
        },
        get innerHTML() {
            return html;
        },
        set innerHTML(value) {
            html = value;
            if (value === "") {
                this.children = [];
            }
        }
    };
}

test("afficherSituation renders answer buttons in #options-grid and reuses #skip-btn", () => {
    const normalizeQuestionAnswersSource = extractFunction(appJs, "normalizeQuestionAnswers");
    const resolveQuestionAnswersSource = extractFunction(appJs, "resolveQuestionAnswers");
    const afficherSituationSource = extractFunction(appJs, "afficherSituation");
    const progress = { innerText: "" };
    const livePoints = { innerText: "" };
    const question = { innerText: "" };
    const optionsGrid = createContainer([{ stale: true }]);
    const skipButton = createButton();
    skipButton.innerText = "Passer";
    skipButton.disabled = true;

    let skipAnswer = undefined;
    let finalCalls = 0;

    const context = {
        document: {
            getElementById(id) {
                return {
                    progress,
                    "live-points": livePoints,
                    question,
                    "options-grid": optionsGrid,
                    "skip-btn": skipButton
                }[id] ?? null;
            },
            createElement(tagName) {
                assert.equal(tagName, "button");
                return createButton();
            }
        },
        quizEngine: {
            index: 0,
            questions: [{}],
            stats: { points: 3 },
            getCurrent() {
                return {
                    q: "Situation test",
                    r: ["Alpha", "Bravo", "Charlie", "Delta"],
                    correct: 1
                };
            },
            answer(value) {
                skipAnswer = value;
                return false;
            }
        },
        reviewItems: [],
        playAnswerSound() {},
        verrouillerOptions() {},
        marquerBoutons() {},
        bilanFinal() {
            finalCalls += 1;
        },
        setTimeout() {
            throw new Error("setTimeout should not be used while rendering options");
        },
        console
    };

    vm.runInNewContext(
        `${normalizeQuestionAnswersSource}\n${resolveQuestionAnswersSource}\n${afficherSituationSource}\nafficherSituation();`,
        context
    );

    assert.equal(progress.innerText, "Question 1 / 1");
    assert.equal(livePoints.innerText, "Points : 3");
    assert.equal(question.innerText, "Situation test");
    assert.equal(optionsGrid.children.length, 4);
    assert.deepEqual(optionsGrid.children.map(button => button.innerText), ["Alpha", "Bravo", "Charlie", "Delta"]);
    assert.equal(skipButton.innerText, "Passer");
    assert.equal(skipButton.disabled, false);
    assert.equal(typeof skipButton.onclick, "function");

    skipButton.onclick();

    assert.equal(skipAnswer, null);
    assert.equal(finalCalls, 1);
    assert.equal(optionsGrid.children.length, 4);
    assert.equal(context.reviewItems.length, 1);
    assert.equal(context.reviewItems[0].type, "skipped");
});

test("resolveQuestionAnswers supports legacy answer field names", () => {
    const normalizeQuestionAnswersSource = extractFunction(appJs, "normalizeQuestionAnswers");
    const resolveQuestionAnswersSource = extractFunction(appJs, "resolveQuestionAnswers");
    const context = { console };

    vm.runInNewContext(
        `${normalizeQuestionAnswersSource}\n${resolveQuestionAnswersSource}\nresolved = resolveQuestionAnswers({
            q: "Situation legacy",
            answer1: "Alpha",
            answer2: "Bravo",
            answer3: "Charlie",
            answer4: "Delta",
            correct: 1
        });`,
        context
    );

    assert.deepEqual(Array.from(context.resolved), ["Alpha", "Bravo", "Charlie", "Delta"]);
});

test("resolveQuestionAnswers merges hybrid legacy answer formats", () => {
    const normalizeQuestionAnswersSource = extractFunction(appJs, "normalizeQuestionAnswers");
    const resolveQuestionAnswersSource = extractFunction(appJs, "resolveQuestionAnswers");
    const context = { console };

    vm.runInNewContext(
        `${normalizeQuestionAnswersSource}\n${resolveQuestionAnswersSource}\nresolved = resolveQuestionAnswers({
            q: "Situation hybride",
            1: "Alpha",
            answer2: "Bravo",
            response3: "Charlie",
            reponse4: "Delta",
            correct: 2
        });`,
        context
    );

    assert.deepEqual(Array.from(context.resolved), ["Alpha", "Bravo", "Charlie", "Delta"]);
});

test("resolveQuestionAnswers completes a partial nested payload with legacy root fields", () => {
    const normalizeQuestionAnswersSource = extractFunction(appJs, "normalizeQuestionAnswers");
    const resolveQuestionAnswersSource = extractFunction(appJs, "resolveQuestionAnswers");
    const context = { console };

    vm.runInNewContext(
        `${normalizeQuestionAnswersSource}\n${resolveQuestionAnswersSource}\nresolved = resolveQuestionAnswers({
            q: "Situation mixte",
            r: ["Alpha", "", "Charlie", ""],
            answer2: "Bravo",
            reponse4: "Delta",
            correct: 1
        });`,
        context
    );

    assert.deepEqual(Array.from(context.resolved), ["Alpha", "Bravo", "Charlie", "Delta"]);
});

test("afficherSituation uses the most complete answer set for mixed payloads", () => {
    const normalizeQuestionAnswersSource = extractFunction(appJs, "normalizeQuestionAnswers");
    const resolveQuestionAnswersSource = extractFunction(appJs, "resolveQuestionAnswers");
    const afficherSituationSource = extractFunction(appJs, "afficherSituation");
    const progress = { innerText: "" };
    const livePoints = { innerText: "" };
    const question = { innerText: "" };
    const optionsGrid = createContainer();
    const skipButton = createButton();

    const context = {
        document: {
            getElementById(id) {
                return {
                    progress,
                    "live-points": livePoints,
                    question,
                    "options-grid": optionsGrid,
                    "skip-btn": skipButton
                }[id] ?? null;
            },
            createElement() {
                return createButton();
            }
        },
        quizEngine: {
            index: 0,
            questions: [{}],
            stats: { points: 0 },
            getCurrent() {
                return {
                    q: "Situation mixte",
                    r: ["Alpha", "", "Charlie", ""],
                    answer2: "Bravo",
                    reponse4: "Delta",
                    correct: 1
                };
            }
        },
        reviewItems: [],
        playAnswerSound() {},
        verrouillerOptions() {},
        marquerBoutons() {},
        bilanFinal() {},
        setTimeout() {
            throw new Error("setTimeout should not be used while rendering options");
        },
        console
    };

    vm.runInNewContext(
        `${normalizeQuestionAnswersSource}\n${resolveQuestionAnswersSource}\n${afficherSituationSource}\nafficherSituation();`,
        context
    );

    assert.deepEqual(optionsGrid.children.map(button => button.innerText), ["Alpha", "Bravo", "Charlie", "Delta"]);
});

test("resolveQuestionAnswers prefers the dedicated nested answer source on equal completeness", () => {
    const normalizeQuestionAnswersSource = extractFunction(appJs, "normalizeQuestionAnswers");
    const resolveQuestionAnswersSource = extractFunction(appJs, "resolveQuestionAnswers");
    const context = { console };

    vm.runInNewContext(
        `${normalizeQuestionAnswersSource}\n${resolveQuestionAnswersSource}\nresolved = resolveQuestionAnswers({
            r: ["Alpha", "Bravo", "Charlie", "Delta"],
            answer1: "Legacy 1",
            answer2: "Legacy 2",
            answer3: "Legacy 3",
            answer4: "Legacy 4"
        });`,
        context
    );

    assert.deepEqual(Array.from(context.resolved), ["Alpha", "Bravo", "Charlie", "Delta"]);
});

test("uiController clears, locks and marks answer buttons using #options-grid and #skip-btn", () => {
    const selectedButton = createButton();
    const correctButton = createButton();
    const thirdButton = createButton();
    const skipButton = createButton();
    const optionsGrid = createContainer([selectedButton, correctButton, thirdButton]);

    global.document = {
        getElementById(id) {
            assert.equal(id, "options-grid");
            return optionsGrid;
        },
        querySelectorAll(selector) {
            if (selector === "#options-grid .btn, #skip-btn") {
                return [selectedButton, correctButton, thirdButton, skipButton];
            }

            if (selector === "#options-grid .btn") {
                return [selectedButton, correctButton, thirdButton];
            }

            throw new Error(`Unexpected selector: ${selector}`);
        }
    };

    uiController.clearOptions();
    assert.equal(optionsGrid.children.length, 0);

    uiController.lockOptions();
    assert.equal(selectedButton.disabled, true);
    assert.equal(correctButton.disabled, true);
    assert.equal(thirdButton.disabled, true);
    assert.equal(skipButton.disabled, true);

    uiController.markAnswer(0, 1);
    assert.equal(selectedButton.classList.contains("incorrect"), true);
    assert.equal(selectedButton.classList.contains("correct"), false);
    assert.equal(correctButton.classList.contains("correct"), true);
    assert.equal(thirdButton.classList.contains("correct"), false);

    delete global.document;
});
