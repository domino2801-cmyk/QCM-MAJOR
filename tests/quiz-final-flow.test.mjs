import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(testDirectory, "..");
const appJs = readFileSync(`${root}/app.js`, "utf8");
const scoring = loadExportedConst("modules/quiz-engine/scoring.js", "scoring");

function extractFunction(source, functionName) {
    const asyncMarker = `async function ${functionName}(`;
    const syncMarker = `function ${functionName}(`;
    const start = source.indexOf(asyncMarker) !== -1
        ? source.indexOf(asyncMarker)
        : source.indexOf(syncMarker);

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

function createContainer() {
    let html = "";

    return {
        children: [],
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

function createTextNode() {
    return { innerText: "" };
}

function createClassToggleNode() {
    const classes = new Set();

    return {
        classList: {
            toggle(token, force) {
                if (force) classes.add(token);
                else classes.delete(token);
            },
            contains(token) {
                return classes.has(token);
            }
        }
    };
}

function createQuizFlowHarness({
    saveResultBehavior,
    persistResultLocally = true,
    renderGlobalRankingBehavior,
    renderReviewBehavior
} = {}) {
    const normalizeQuestionAnswersSource = extractFunction(appJs, "normalizeQuestionAnswers");
    const resolveQuestionAnswersSource = extractFunction(appJs, "resolveQuestionAnswers");
    const afficherSituationSource = extractFunction(appJs, "afficherSituation");
    const verrouillerOptionsSource = extractFunction(appJs, "verrouillerOptions");
    const marquerBoutonsSource = extractFunction(appJs, "marquerBoutons");
    const bilanFinalSource = extractFunction(appJs, "bilanFinal");

    const progress = createTextNode();
    const livePoints = createTextNode();
    const question = createTextNode();
    const scoreDisplay = createTextNode();
    const statCorrect = createTextNode();
    const statWrong = createTextNode();
    const statSkipped = createTextNode();
    const statBrut = createTextNode();
    const brutMax = createTextNode();
    const reviewSection = createClassToggleNode();
    const reviewList = createContainer();
    const optionsGrid = createContainer();
    const skipButton = createButton();
    const scheduled = [];
    const savedResults = [];
    const warnings = [];
    let activeScreen = "";
    let rankingPayload = null;
    let answerSounds = [];

    const currentQuestion = {
        q: "Dernière situation",
        r: ["Alpha", "Bravo", "Charlie", "Delta"],
        correct: 1
    };

    const context = {
        Date,
        console: {
            ...console,
            warn(...args) {
                warnings.push(args);
            }
        },
        scoring,
        selectedTheme: "all",
        currentCandidateEmail: "candidat@example.com",
        currentAuthenticatedAccount: {
            id: "cand-1",
            email: "candidat@example.com",
            name: "Candidate Test"
        },
        questionTransitionLocked: false,
        currentQuizRunId: 1,
        finalizedQuizRunId: -1,
        reviewItems: [],
        quizEngine: {
            index: 0,
            questions: [currentQuestion],
            stats: scoring.createStats(),
            getCurrent() {
                return this.questions[this.index];
            },
            answer(choice) {
                const q = this.getCurrent();
                scoring.applyAnswer(this.stats, choice, q.correct);
                this.index += 1;
                return this.index < this.questions.length;
            }
        },
        document: {
            getElementById(id) {
                return {
                    progress,
                    "live-points": livePoints,
                    question,
                    "options-grid": optionsGrid,
                    "skip-btn": skipButton,
                    "score-display": scoreDisplay,
                    "stat-correct": statCorrect,
                    "stat-wrong": statWrong,
                    "stat-skipped": statSkipped,
                    "stat-brut": statBrut,
                    "brut-max": brutMax,
                    "review-section": reviewSection,
                    "review-list": reviewList
                }[id] ?? null;
            },
            createElement(tagName) {
                assert.equal(tagName, "button");
                return createButton();
            },
            querySelectorAll(selector) {
                if (selector === "#options-grid .btn, #skip-btn") {
                    return [...optionsGrid.children, skipButton];
                }

                if (selector === "#options-grid .btn") {
                    return optionsGrid.children;
                }

                throw new Error(`Unexpected selector: ${selector}`);
            }
        },
        playAnswerSound(isCorrect) {
            answerSounds.push(isCorrect);
        },
        setTimeout(callback, delay) {
            scheduled.push({ callback, delay });
            return scheduled.length;
        },
        createRecordId() {
            return "result-1";
        },
        normalizeResultRecord(rawResult = {}) {
            return {
                id: rawResult.id || "result-1",
                candidateId: rawResult.candidateId || "",
                label: rawResult.label || "",
                email: rawResult.email || "",
                name: rawResult.name || "",
                theme: rawResult.theme || "",
                score: Number(rawResult.score || 0),
                correct: Number(rawResult.correct || 0),
                wrong: Number(rawResult.wrong || 0),
                skipped: Number(rawResult.skipped || 0),
                total: Number(rawResult.total || 0),
                date: rawResult.date || new Date().toLocaleString("fr-FR"),
                createdAt: rawResult.created_at || rawResult.createdAt || new Date().toISOString(),
                synced: rawResult.synced !== false
            };
        },
        getCandidateLabel(account) {
            return account?.name || "Candidat inconnu";
        },
        getAccounts() {
            return {};
        },
        async saveResult(resultRecord) {
            if (persistResultLocally) {
                savedResults.push(resultRecord);
            }
            if (typeof saveResultBehavior === "function") {
                return saveResultBehavior(resultRecord, savedResults);
            }
        },
        getResults() {
            return savedResults.slice();
        },
        uiController: {
            switchScreen(screenId) {
                activeScreen = screenId;
            }
        },
        renderGlobalRanking(results) {
            if (typeof renderGlobalRankingBehavior === "function") {
                renderGlobalRankingBehavior(results);
            }
            rankingPayload = results;
        },
        renderReview() {
            if (typeof renderReviewBehavior === "function") {
                renderReviewBehavior();
            }
        }
    };

    vm.runInNewContext(
        [
            normalizeQuestionAnswersSource,
            resolveQuestionAnswersSource,
            verrouillerOptionsSource,
            marquerBoutonsSource,
            bilanFinalSource,
            afficherSituationSource
        ].join("\n"),
        context
    );

    return {
        context,
        scheduled,
        optionsGrid,
        skipButton,
        scoreDisplay,
        statCorrect,
        statWrong,
        statSkipped,
        statBrut,
        brutMax,
        reviewSection,
        savedResults,
        warnings,
        getActiveScreen: () => activeScreen,
        getRankingPayload: () => rankingPayload,
        getAnswerSounds: () => answerSounds
    };
}

async function flushScheduled(scheduled) {
    while (scheduled.length > 0) {
        const { callback } = scheduled.shift();
        callback();
        await new Promise(resolve => setImmediate(resolve));
    }
}

test("last correct answer is counted and saved in the final note", async () => {
    const harness = createQuizFlowHarness();

    harness.context.afficherSituation();
    harness.optionsGrid.children[1].onclick();

    assert.equal(harness.scheduled.length, 1);
    assert.equal(harness.scheduled[0].delay, 900);

    await flushScheduled(harness.scheduled);

    assert.deepEqual(harness.getAnswerSounds(), [true]);
    assert.equal(harness.getActiveScreen(), "result-screen");
    assert.equal(harness.savedResults.length, 1);
    assert.equal(harness.savedResults[0].score, 20);
    assert.equal(harness.savedResults[0].correct, 1);
    assert.equal(harness.savedResults[0].wrong, 0);
    assert.equal(harness.savedResults[0].skipped, 0);
    assert.equal(harness.savedResults[0].total, 1);
    assert.equal(harness.scoreDisplay.innerText, "20.00 / 20");
    assert.equal(harness.statCorrect.innerText, 1);
    assert.equal(harness.statWrong.innerText, 0);
    assert.equal(harness.statSkipped.innerText, 0);
    assert.equal(harness.statBrut.innerText, 4);
    assert.equal(harness.brutMax.innerText, "/ 4");
    assert.deepEqual(harness.getRankingPayload(), harness.savedResults);
});

test("last wrong answer is counted and saved in the final note", async () => {
    const harness = createQuizFlowHarness();

    harness.context.afficherSituation();
    harness.optionsGrid.children[0].onclick();

    await flushScheduled(harness.scheduled);

    assert.deepEqual(harness.getAnswerSounds(), [false]);
    assert.equal(harness.savedResults.length, 1);
    assert.equal(harness.savedResults[0].score, -5);
    assert.equal(harness.savedResults[0].correct, 0);
    assert.equal(harness.savedResults[0].wrong, 1);
    assert.equal(harness.savedResults[0].skipped, 0);
    assert.equal(harness.scoreDisplay.innerText, "-5.00 / 20");
    assert.equal(harness.statCorrect.innerText, 0);
    assert.equal(harness.statWrong.innerText, 1);
    assert.equal(harness.statSkipped.innerText, 0);
    assert.equal(harness.statBrut.innerText, -1);
    assert.equal(harness.brutMax.innerText, "/ 4");
    assert.equal(harness.context.reviewItems.length, 1);
    assert.equal(harness.context.reviewItems[0].type, "wrong");
});

test("last skipped question is counted once and saved in the final note", async () => {
    const harness = createQuizFlowHarness();

    harness.context.afficherSituation();
    harness.skipButton.onclick();
    harness.skipButton.onclick();

    await flushScheduled(harness.scheduled);
    await new Promise(resolve => setImmediate(resolve));

    assert.equal(harness.skipButton.disabled, true);
    assert.equal(harness.savedResults.length, 1);
    assert.equal(harness.savedResults[0].score, 0);
    assert.equal(harness.savedResults[0].correct, 0);
    assert.equal(harness.savedResults[0].wrong, 0);
    assert.equal(harness.savedResults[0].skipped, 1);
    assert.equal(harness.savedResults[0].total, 1);
    assert.equal(harness.scoreDisplay.innerText, "0.00 / 20");
    assert.equal(harness.statCorrect.innerText, 0);
    assert.equal(harness.statWrong.innerText, 0);
    assert.equal(harness.statSkipped.innerText, 1);
    assert.equal(harness.statBrut.innerText, 0);
    assert.equal(harness.brutMax.innerText, "/ 4");
    assert.equal(harness.context.reviewItems.length, 1);
    assert.equal(harness.context.reviewItems[0].type, "skipped");
});

test("final screen renders immediately even if remote result sync stays pending", async () => {
    const harness = createQuizFlowHarness({
        saveResultBehavior: () => new Promise(() => {})
    });

    harness.context.afficherSituation();
    harness.optionsGrid.children[1].onclick();

    await flushScheduled(harness.scheduled);

    assert.equal(harness.getActiveScreen(), "result-screen");
    assert.equal(harness.savedResults.length, 1);
    assert.equal(harness.savedResults[0].correct, 1);
    assert.equal(harness.scoreDisplay.innerText, "20.00 / 20");
    assert.equal(harness.statCorrect.innerText, 1);
    assert.equal(harness.statWrong.innerText, 0);
    assert.equal(harness.statSkipped.innerText, 0);
});

test("final screen still renders when remote result sync fails", async () => {
    const harness = createQuizFlowHarness({
        saveResultBehavior: () => Promise.reject(new Error("offline"))
    });

    harness.context.afficherSituation();
    harness.skipButton.onclick();
    await new Promise(resolve => setImmediate(resolve));

    assert.equal(harness.getActiveScreen(), "result-screen");
    assert.equal(harness.savedResults.length, 1);
    assert.equal(harness.savedResults[0].skipped, 1);
    assert.equal(harness.scoreDisplay.innerText, "0.00 / 20");
    assert.equal(harness.warnings.length, 1);
    assert.equal(harness.warnings[0][0], "Synchronisation distante du résultat indisponible.");
});

test("final ranking includes the last result even before async save settles", async () => {
    const harness = createQuizFlowHarness({
        persistResultLocally: false,
        saveResultBehavior: () => new Promise(() => {})
    });

    harness.context.afficherSituation();
    harness.optionsGrid.children[1].onclick();

    await flushScheduled(harness.scheduled);

    assert.equal(harness.getActiveScreen(), "result-screen");
    assert.equal(harness.getRankingPayload().length, 1);
    assert.equal(harness.getRankingPayload()[0].id, "result-1");
    assert.equal(harness.getRankingPayload()[0].candidateId, "cand-1");
    assert.equal(harness.getRankingPayload()[0].label, "Candidate Test");
    assert.equal(harness.getRankingPayload()[0].theme, "all");
    assert.equal(harness.getRankingPayload()[0].score, 20);
    assert.equal(harness.getRankingPayload()[0].correct, 1);
    assert.equal(harness.getRankingPayload()[0].wrong, 0);
});

test("final screen still renders when review rendering fails on the last answer", async () => {
    const harness = createQuizFlowHarness({
        renderReviewBehavior: () => {
            throw new Error("review exploded");
        }
    });

    harness.context.afficherSituation();
    harness.optionsGrid.children[1].onclick();

    await flushScheduled(harness.scheduled);

    assert.equal(harness.getActiveScreen(), "result-screen");
    assert.equal(harness.scoreDisplay.innerText, "20.00 / 20");
    assert.equal(harness.statCorrect.innerText, 1);
    assert.equal(harness.savedResults.length, 1);
    assert.equal(harness.warnings[0][0], "Rendu de la revue indisponible.");
    assert.equal(harness.getRankingPayload()[0].skipped, 0);
    assert.equal(harness.getRankingPayload()[0].total, 1);
    assert.equal(harness.getRankingPayload()[0].score, 20);
});

test("final screen still renders when initial ranking rendering fails on the last answer", async () => {
    const harness = createQuizFlowHarness({
        renderGlobalRankingBehavior: () => {
            throw new Error("ranking exploded");
        }
    });

    harness.context.afficherSituation();
    harness.optionsGrid.children[1].onclick();

    await flushScheduled(harness.scheduled);

    assert.equal(harness.getActiveScreen(), "result-screen");
    assert.equal(harness.scoreDisplay.innerText, "20.00 / 20");
    assert.equal(harness.statCorrect.innerText, 1);
    assert.equal(harness.savedResults.length, 1);
    assert.equal(harness.warnings[0][0], "Rendu du classement indisponible.");
    assert.equal(harness.warnings[1][0], "Actualisation du classement indisponible.");
});

test("final screen still renders when ranking refresh fails after save", async () => {
    let rankingCallCount = 0;
    const harness = createQuizFlowHarness({
        renderGlobalRankingBehavior: () => {
            rankingCallCount += 1;
            if (rankingCallCount === 2) {
                throw new Error("ranking refresh exploded");
            }
        }
    });

    harness.context.afficherSituation();
    harness.optionsGrid.children[1].onclick();

    await flushScheduled(harness.scheduled);

    assert.equal(harness.getActiveScreen(), "result-screen");
    assert.equal(harness.scoreDisplay.innerText, "20.00 / 20");
    assert.equal(harness.savedResults.length, 1);
    assert.equal(harness.warnings[0][0], "Actualisation du classement indisponible.");
    assert.equal(harness.getRankingPayload()[0].score, 20);
});

test("final screen still renders when answer marking fails on the last answer", async () => {
    const originalMarquerBoutons = extractFunction(appJs, "marquerBoutons");
    const brokenMarquerBoutons = `${originalMarquerBoutons}\nmarquerBoutons = () => { throw new Error("marking exploded"); };`;
    const normalizeQuestionAnswersSource = extractFunction(appJs, "normalizeQuestionAnswers");
    const resolveQuestionAnswersSource = extractFunction(appJs, "resolveQuestionAnswers");
    const afficherSituationSource = extractFunction(appJs, "afficherSituation");
    const verrouillerOptionsSource = extractFunction(appJs, "verrouillerOptions");
    const bilanFinalSource = extractFunction(appJs, "bilanFinal");
    const progress = createTextNode();
    const livePoints = createTextNode();
    const question = createTextNode();
    const scoreDisplay = createTextNode();
    const statCorrect = createTextNode();
    const statWrong = createTextNode();
    const statSkipped = createTextNode();
    const statBrut = createTextNode();
    const brutMax = createTextNode();
    const reviewSection = createClassToggleNode();
    const reviewList = createContainer();
    const optionsGrid = createContainer();
    const skipButton = createButton();
    const scheduled = [];
    const savedResults = [];
    const warnings = [];
    let activeScreen = "";

    const context = {
        Date,
        console: {
            ...console,
            warn(...args) {
                warnings.push(args);
            }
        },
        scoring,
        selectedTheme: "all",
        currentCandidateEmail: "candidat@example.com",
        currentAuthenticatedAccount: {
            id: "cand-1",
            email: "candidat@example.com",
            name: "Candidate Test"
        },
        questionTransitionLocked: false,
        currentQuizRunId: 1,
        finalizedQuizRunId: -1,
        reviewItems: [],
        quizEngine: {
            index: 0,
            questions: [{
                q: "Dernière situation",
                r: ["Alpha", "Bravo", "Charlie", "Delta"],
                correct: 1
            }],
            stats: scoring.createStats(),
            getCurrent() {
                return this.questions[this.index];
            },
            answer(choice) {
                const q = this.getCurrent();
                scoring.applyAnswer(this.stats, choice, q.correct);
                this.index += 1;
                return this.index < this.questions.length;
            }
        },
        document: {
            getElementById(id) {
                return {
                    progress,
                    "live-points": livePoints,
                    question,
                    "options-grid": optionsGrid,
                    "skip-btn": skipButton,
                    "score-display": scoreDisplay,
                    "stat-correct": statCorrect,
                    "stat-wrong": statWrong,
                    "stat-skipped": statSkipped,
                    "stat-brut": statBrut,
                    "brut-max": brutMax,
                    "review-section": reviewSection,
                    "review-list": reviewList
                }[id] ?? null;
            },
            createElement(tagName) {
                assert.equal(tagName, "button");
                return createButton();
            },
            querySelectorAll(selector) {
                if (selector === "#options-grid .btn, #skip-btn") {
                    return [...optionsGrid.children, skipButton];
                }

                if (selector === "#options-grid .btn") {
                    return optionsGrid.children;
                }

                throw new Error(`Unexpected selector: ${selector}`);
            }
        },
        playAnswerSound() {},
        setTimeout(callback, delay) {
            scheduled.push({ callback, delay });
            return scheduled.length;
        },
        createRecordId() {
            return "result-1";
        },
        normalizeResultRecord(rawResult = {}) {
            return {
                id: rawResult.id || "result-1",
                candidateId: rawResult.candidateId || "",
                label: rawResult.label || "",
                email: rawResult.email || "",
                name: rawResult.name || "",
                theme: rawResult.theme || "",
                score: Number(rawResult.score || 0),
                correct: Number(rawResult.correct || 0),
                wrong: Number(rawResult.wrong || 0),
                skipped: Number(rawResult.skipped || 0),
                total: Number(rawResult.total || 0),
                date: rawResult.date || new Date().toLocaleString("fr-FR"),
                createdAt: rawResult.created_at || rawResult.createdAt || new Date().toISOString(),
                synced: rawResult.synced !== false
            };
        },
        getCandidateLabel(account) {
            return account?.name || "Candidat inconnu";
        },
        getAccounts() {
            return {};
        },
        async saveResult(resultRecord) {
            savedResults.push(resultRecord);
        },
        getResults() {
            return savedResults.slice();
        },
        uiController: {
            switchScreen(screenId) {
                activeScreen = screenId;
            }
        },
        renderGlobalRanking() {},
        renderReview() {}
    };

    vm.runInNewContext(
        [
            normalizeQuestionAnswersSource,
            resolveQuestionAnswersSource,
            verrouillerOptionsSource,
            brokenMarquerBoutons,
            bilanFinalSource,
            afficherSituationSource
        ].join("\n"),
        context
    );

    context.afficherSituation();
    optionsGrid.children[1].onclick();

    await flushScheduled(scheduled);

    assert.equal(activeScreen, "result-screen");
    assert.equal(scoreDisplay.innerText, "20.00 / 20");
    assert.equal(savedResults.length, 1);
    assert.equal(warnings[0][0], "Marquage des réponses indisponible.");
});

function loadExportedConst(relativePath, exportName) {
    const source = readFileSync(path.join(root, relativePath), "utf8");
    const script = new vm.Script(`${source.replace(`export const ${exportName} =`, `const ${exportName} =`)}\n${exportName};`);
    return script.runInNewContext({ Date });
}
