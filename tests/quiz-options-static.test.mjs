import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import vm from "node:vm";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(testDirectory, "..");
const appJs = readFileSync(`${root}/app.js`, "utf8");
const indexHtml = readFileSync(`${root}/index.html`, "utf8");
const { uiController } = await import(pathToFileURL(`${root}/modules/ui-controller/index.js`).href);

test("theme selection keeps the exam question count only for the global campaign", () => {
    assert.match(appJs, /globalButton\?\.addEventListener\("click"/);
    assert.match(appJs, /maxQuestions = 50/);
    assert.match(appJs, /setQuestionCount\(clampQuestionCount\(50, getAllQuestions\(\)\.length\)\)/);
});

test("the app and styles use fresh cache versions", () => {
    assert.match(indexHtml, /app\.js\?v=detailed-question-correction-20261017/);
    assert.match(indexHtml, /ui\/Style\.css\?v=server-grading-20261017/);
    const css = readFileSync(`${root}/ui/Style.css`, "utf8");
    assert.match(css, /\.options-grid \.btn\.selected,\s*#skip-btn\.selected\s*\{[\s\S]*?rgba\(24, 132, 68, 0\.96\)[\s\S]*?border-color:\s*#72f0a0;[\s\S]*?font-weight:\s*700;/);
    assert.match(css, /\.theme-global-btn\.active[\s\S]*?background:\s*linear-gradient\(135deg,\s*rgba\(190,\s*209,\s*219,\s*0\.48\),\s*rgba\(88,\s*111,\s*124,\s*0\.42\)\)/);
    assert.match(css, /#theme-global-btn\.active[\s\S]*?background:\s*linear-gradient\(135deg,\s*rgba\(190,\s*133,\s*22,\s*0\.74\),\s*rgba\(83,\s*54,\s*10,\s*0\.68\)\)/);
    assert.match(indexHtml, /id="quiz-timer"[^>]*hidden>[\s\S]*id="quiz-timer-display">60:00/);
    assert.match(css, /\.quiz-timer\.badge\[hidden\]\s*\{\s*display:\s*none;/);
    assert.match(css, /\.quiz-timer\.urgent/);
    assert.match(indexHtml, /id="quiz-timer-fuse" class="timer-fuse-rope" pathLength="1"/);
    assert.match(css, /stroke-dasharray:\s*1 1;/);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.timer-fuse-spark/);
    assert.match(css, /@keyframes timer-explosion-burst/);
    assert.match(indexHtml, /id="quiz-expiry-status"[^>]*role="alert"/);
    assert.match(css, /#live-points\[hidden\]\s*\{\s*display:\s*none;/);
});

test("quiz action buttons share the confirmation button style", () => {
    for (const id of ["question-report-toggle", "next-question-btn", "confirm-cancel-btn", "confirm-ok-btn"]) {
        assert.match(indexHtml, new RegExp(`id="${id}" class="btn-main" type="button"`));
    }
});

test("intensity choices include 40 questions in a four-column row", () => {
    assert.match(indexHtml, /id="campaign-mode-label">ZONE HAUTE INTENSITÉ<\/span>[\s\S]*?id="theme-training-btn"/);
    assert.ok(indexHtml.indexOf('class="qty-choice-row"') < indexHtml.indexOf('class="theme-mode-row"'), "combat modes should follow the intensity choices");
    assert.match(appJs, /const syncObjectiveButtons = selectedThemeId =>/);
    assert.match(appJs, /syncObjectiveButtons\(themeId\)/);
    assert.match(indexHtml, /id="theme-training-btn"[^>]*aria-pressed="false"/);
    assert.match(indexHtml, /id="theme-global-btn"[^>]*aria-pressed="false"/);
    assert.match(appJs, /const syncCampaignModeButtons = activeButton =>/);
    assert.match(appJs, /button\.setAttribute\("aria-pressed", String\(isActive\)\)/);
    assert.match(indexHtml, /class="qty-choice-btn" data-qty="40" aria-pressed="false"><span class="qty-choice-count">40<\/span>/);
    assert.match(indexHtml, /id="theme-start-guidance"[^>]*>Sélectionnez une zone d’opération ou un combat pour continuer\./);
    assert.match(appJs, /setStartGuidance\(hasQuestions \? "" : "Aucune question n’est disponible pour cette zone\."\)/);
    assert.match(appJs, /setStartGuidance\("Sélectionnez une zone d’opération ou un combat pour continuer\."\)/);
    assert.match(appJs, /setStartGuidance\(""\);/);
    const css = readFileSync(`${root}/ui/Style.css`, "utf8");
    assert.match(css, /\.qty-choice-row\s*\{[^}]*grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\);/);
    assert.match(css, /\.theme-select-row\s*\{\s*grid-template-columns:\s*minmax\(0, 1fr\);/);
    assert.match(css, /\.qty-choice-btn\s*\{[^}]*min-width:\s*0;[^}]*white-space:\s*nowrap;/);
    assert.match(indexHtml, /data-qty="10"[^>]*>[\s\S]*qty-choice-level">Reconnaissance/);
    assert.match(indexHtml, /data-qty="20"[^>]*>[\s\S]*qty-choice-level">Engagement/);
    assert.match(indexHtml, /data-qty="30"[^>]*>[\s\S]*qty-choice-level">Assaut/);
    assert.match(indexHtml, /data-qty="40"[^>]*>[\s\S]*qty-choice-level">Offensive/);
    assert.match(css, /\.qty-choice-level\s*\{[^}]*font-size:\s*clamp\(0\.58rem,\s*1\.5vw,\s*0\.68rem\);/);
    assert.match(css, /\.theme-start-guidance\s*\{[^}]*margin:\s*0;/);
    assert.match(css, /@media \(max-width: 600px\)\s*\{[\s\S]*?#theme-screen \.brand-lockup img\s*\{\s*width:\s*82px;/);
    assert.match(css, /\.theme-mode-row \.theme-global-btn\s*\{\s*min-height:\s*60px;[\s\S]*?font-size:\s*0\.68rem;/);
    assert.match(css, /\.theme-quantity-field \.qty-choice-btn\.active\s*\{[^}]*border-color:\s*#e2c36d;/);
    assert.match(css, /\.theme-objective-btn\s*\{[^}]*align-items:\s*center;[\s\S]*?text-align:\s*center;/);
    assert.match(css, /\.theme-objective-btn\s*\{[^}]*min-height:\s*74px;[^}]*padding:\s*7px 12px;/);
    assert.match(css, /\.theme-objective-btn\s*\{\s*min-height:\s*68px;\s*padding:\s*6px 10px;/);
    assert.match(css, /\.theme-objective-btn\[data-theme="1"\]\s*\{[^}]*background:\s*linear-gradient/);
    assert.match(css, /\.theme-objective-btn\[data-theme="6"\]\s*\{[^}]*background:\s*linear-gradient/);
    assert.match(css, /\.theme-objective-btn\[data-theme\]\.active\s*\{[^}]*border-color:\s*#e2c36d;/);
    assert.doesNotMatch(css, /^\.qty-choice-btn\.active\s*\{/m);
    assert.match(css, /#theme-select:has\(option\[value=""\]:checked\)\s*\{\s*font-size:\s*0\.95rem;/);
});

test("report button uses muted red and gold without flashing or sheen", () => {
    const css = readFileSync(`${root}/ui/Style.css`, "utf8");
    assert.match(css, /#question-report-toggle:not\(:disabled\)\s*\{[^}]*background:\s*linear-gradient\(135deg, #713c3b, #4d292b\);[^}]*border-color:\s*#a88a58;[^}]*animation:\s*none;/);
    assert.match(css, /#question-report-toggle::before\s*\{\s*display:\s*none;/);
});

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

test("afficherSituation renders answer buttons in #options-grid and reuses #skip-btn", async () => {
    const normalizeQuestionAnswersSource = extractFunction(appJs, "normalizeQuestionAnswers");
    const resolveQuestionAnswersSource = extractFunction(appJs, "resolveQuestionAnswers");
    const afficherSituationSource = extractFunction(appJs, "afficherSituation");
    const progress = { innerText: "" };
    const livePoints = { innerText: "" };
    const question = { innerText: "" };
    const optionsGrid = createContainer([{ stale: true }]);
    const skipButton = createButton();
    const nextQuestionButton = createButton();
    skipButton.innerText = "Passer";
    skipButton.disabled = true;
    const scheduled = [];

    let skipAnswer = undefined;
    let finalCalls = 0;
    const markedAnswers = [];

    const context = {
        isQuizTimeExpired: () => false,
        document: {
            getElementById(id) {
                return {
                    progress,
                    "live-points": livePoints,
                    question,
                    "options-grid": optionsGrid,
                    "skip-btn": skipButton,
                    "next-question-btn": nextQuestionButton
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
                this.index += 1;
                return this.index < this.questions.length;
            }
        },
        reviewItems: [],
        async gradeSupabaseQuestionAnswer() {
            return { correctIndex: 1, isCorrect: false };
        },
        playAnswerSound() {},
        verrouillerOptions() {},
        marquerBoutons(selected, correct) {
            markedAnswers.push({ selected, correct });
        },
        bilanFinal() {
            finalCalls += 1;
        },
        setTimeout(callback, delay) {
            scheduled.push({ callback, delay });
            return scheduled.length;
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

    await skipButton.onclick();

    assert.equal(skipAnswer, null);
    assert.equal(scheduled.length, 0);
    assert.equal(nextQuestionButton.disabled, false);
    assert.equal(nextQuestionButton.innerText, "Voir le bilan");
    assert.deepEqual(markedAnswers, [{ selected: null, correct: false }]);
    nextQuestionButton.onclick();
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
    const nextQuestionButton = createButton();

    const context = {
        isQuizTimeExpired: () => false,
        document: {
            getElementById(id) {
                return {
                    progress,
                    "live-points": livePoints,
                    question,
                    "options-grid": optionsGrid,
                    "skip-btn": skipButton,
                    "next-question-btn": nextQuestionButton
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
