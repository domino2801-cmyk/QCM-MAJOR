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
            add(token) {
                classes.add(token);
            },
            remove(token) {
                classes.delete(token);
            },
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
    questions,
    saveResultBehavior,
    persistResultLocally = true,
    renderGlobalRankingBehavior,
    renderReviewBehavior,
    useLegacyResultIds = false,
    omitResultStatsNodes = false
} = {}) {
    const normalizeQuestionAnswersSource = extractFunction(appJs, "normalizeQuestionAnswers");
    const resolveQuestionAnswersSource = extractFunction(appJs, "resolveQuestionAnswers");
    const afficherSituationSource = extractFunction(appJs, "afficherSituation");
    const verrouillerOptionsSource = extractFunction(appJs, "verrouillerOptions");
    const marquerBoutonsSource = extractFunction(appJs, "marquerBoutons");
    const stopQuizTimerSource = extractFunction(appJs, "stopQuizTimer");
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
    const nextQuestionButton = createButton();
    const timerNode = createClassToggleNode();
    const timerDisplay = createTextNode();
    const expiryStatus = createTextNode();
    const scheduled = [];
    const savedResults = [];
    const warnings = [];
    const clearedIntervals = [];
    let activeScreen = "";
    let rankingPayload = null;
    let answerSounds = [];
    let explosionSounds = 0;

    const currentQuestion = {
        q: "Dernière situation",
        r: ["Alpha", "Bravo", "Charlie", "Delta"],
        correct: 1
    };
    const quizQuestions = questions ?? [currentQuestion];

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
        quizTimerInterval: null,
        quizTimerDeadline: null,
        expiredQuizRunId: -1,
        prepareExplosionAudio: async () => {},
        playExplosionSound: async () => { explosionSounds += 1; },
        clearInterval(intervalId) {
            clearedIntervals.push(intervalId);
        },
        reviewItems: [],
        quizEngine: {
            index: 0,
            questions: quizQuestions,
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
                const resultNodes = useLegacyResultIds
                    ? {
                        "final-score": scoreDisplay
                    }
                    : {
                        "score-display": scoreDisplay
                    };

                return {
                    progress,
                    "live-points": livePoints,
                    question,
                    "options-grid": optionsGrid,
                    "skip-btn": skipButton,
                    "next-question-btn": nextQuestionButton,
                    "quiz-timer": timerNode,
                    "quiz-timer-display": timerDisplay,
                    "quiz-expiry-status": expiryStatus,
                    "stat-correct": omitResultStatsNodes ? null : statCorrect,
                    "stat-wrong": omitResultStatsNodes ? null : statWrong,
                    "stat-skipped": omitResultStatsNodes ? null : statSkipped,
                    "stat-brut": omitResultStatsNodes ? null : statBrut,
                    "brut-max": omitResultStatsNodes ? null : brutMax,
                    "review-section": reviewSection,
                    "review-list": reviewList,
                    ...resultNodes
                }[id] ?? null;
            },
            createElement(tagName) {
                assert.equal(tagName, "button");
                return createButton();
            },
            querySelectorAll(selector) {
                if (selector === "#quiz-screen button, #quiz-screen textarea") {
                    return [...optionsGrid.children, skipButton, nextQuestionButton];
                }
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
            stopQuizTimerSource,
            extractFunction(appJs, "formatQuizTimer"),
            extractFunction(appJs, "updateQuizTimerDisplay"),
            extractFunction(appJs, "expireQuiz"),
            extractFunction(appJs, "isQuizTimeExpired"),
            extractFunction(appJs, "startQuizTimer"),
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
        nextQuestionButton,
        progress,
        livePoints,
        question,
        scoreDisplay,
        statCorrect,
        statWrong,
        statSkipped,
        statBrut,
        brutMax,
        reviewSection,
        savedResults,
        warnings,
        clearedIntervals,
        timerNode,
        timerDisplay,
        expiryStatus,
        getActiveScreen: () => activeScreen,
        getRankingPayload: () => rankingPayload,
        getAnswerSounds: () => answerSounds,
        getExplosionSounds: () => explosionSounds
    };
}

async function flushScheduled(scheduled) {
    while (scheduled.length > 0) {
        const { callback } = scheduled.shift();
        callback();
        await new Promise(resolve => setImmediate(resolve));
    }
}

test("assault-final timer counts down for one hour and finalizes at zero", () => {
    const timerFunctions = [
        extractFunction(appJs, "formatQuizTimer"),
        extractFunction(appJs, "updateQuizTimerDisplay"),
        extractFunction(appJs, "stopQuizTimer"),
        extractFunction(appJs, "startQuizTimer")
    ];
    const classes = new Set();
    const timerNode = {
        hidden: true,
        innerText: "",
        classList: {
            add(token) {
                classes.add(token);
            },
            remove(token) {
                classes.delete(token);
            },
            toggle(token, force) {
                if (force) classes.add(token);
                else classes.delete(token);
            }
        }
    };
    const fuse = {
        style: {},
        getTotalLength: () => 100,
        getPointAtLength: length => ({ x: length, y: 10 })
    };
    const spark = {
        style: {},
        setAttribute(name, value) {
            this[name] = value;
        }
    };
    const ticks = [];
    const clearedIntervals = [];
    const finalizedRuns = [];
    let now = 0;
    const context = {
        Date: { now: () => now },
        prepareExplosionAudio: async () => {},
        currentQuizRunId: 7,
        quizTimerInterval: null,
        quizTimerDeadline: null,
        document: {
            getElementById(id) {
                return {
                    "quiz-timer": timerNode,
                    "quiz-timer-display": timerNode,
                    "quiz-timer-fuse": fuse,
                    "quiz-timer-spark": spark
                }[id] ?? null;
            }
        },
        setInterval(callback, delay) {
            assert.equal(delay, 1000);
            ticks.push(callback);
            return "assault-final-interval";
        },
        clearInterval(intervalId) {
            clearedIntervals.push(intervalId);
        },
        bilanFinal(quizRunId) {
            finalizedRuns.push(quizRunId);
        },
        expireQuiz(quizRunId) {
            context.stopQuizTimer();
            finalizedRuns.push(quizRunId);
        },
        console
    };

    vm.runInNewContext(timerFunctions.join("\n"), context);
    context.startQuizTimer(7);

    assert.equal(timerNode.hidden, false);
    assert.equal(timerNode.innerText, "60:00");
    assert.equal(fuse.style.strokeDashoffset, "0");
    assert.equal(spark.cx, "100");
    now = 1000;
    ticks[0]();
    assert.equal(timerNode.innerText, "59:59");
    assert.equal(Number(fuse.style.strokeDashoffset), 1 - 3599 / 3600);

    now = 3301000;
    ticks[0]();
    assert.equal(timerNode.innerText, "04:59");
    assert.equal(classes.has("urgent"), true);

    now = 3600000;
    ticks[0]();
    assert.equal(timerNode.innerText, "00:00");
    assert.equal(fuse.style.strokeDashoffset, "1");
    assert.equal(spark.style.display, "none");
    assert.deepEqual(finalizedRuns, [7]);
    assert.deepEqual(clearedIntervals, ["assault-final-interval"]);
    assert.equal(context.quizTimerInterval, null);
});

async function advanceQuiz(harness) {
    harness.nextQuestionButton.onclick();
    await flushScheduled(harness.scheduled);
    await new Promise(resolve => setImmediate(resolve));
}

test("last correct answer is counted and saved in the final note", async () => {
    const harness = createQuizFlowHarness();

    harness.context.afficherSituation();
    harness.optionsGrid.children[1].onclick();
    harness.context.quizTimerInterval = "active-assault-final-timer";

    assert.equal(harness.scheduled.length, 0);
    assert.equal(harness.progress.innerText, "Question 1 / 1");
    assert.equal(harness.nextQuestionButton.disabled, false);
    assert.equal(harness.nextQuestionButton.innerText, "Voir le bilan");

    await advanceQuiz(harness);

    assert.deepEqual(harness.getAnswerSounds(), [true]);
    assert.equal(harness.getActiveScreen(), "result-screen");
    assert.equal(harness.context.quizTimerInterval, null);
    assert.deepEqual(harness.clearedIntervals, ["active-assault-final-timer"]);
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

test("expiry strictly blocks late answers and saves unanswered questions once after the explosion", async () => {
    const questions = Array.from({ length: 50 }, (_, index) => ({
        q: `Question ${index + 1}`, r: ["A", "B", "C", "D"], correct: 0
    }));
    const harness = createQuizFlowHarness({ questions });
    harness.context.afficherSituation();
    harness.optionsGrid.children[0].onclick();
    await advanceQuiz(harness);
    const lateAnswer = harness.optionsGrid.children[0].onclick;
    harness.context.quizTimerDeadline = Date.now() - 1;
    lateAnswer();
    harness.skipButton.onclick();
    harness.nextQuestionButton.onclick();
    harness.context.afficherSituation();

    assert.equal(harness.context.quizEngine.stats.correct, 1);
    assert.equal(harness.context.quizEngine.stats.skipped, 49);
    assert.equal(harness.context.reviewItems.length, 49);
    assert.equal(harness.optionsGrid.children.every(button => button.disabled), true);
    assert.equal(harness.nextQuestionButton.disabled, true);
    assert.equal(harness.timerDisplay.innerText, "00:00");
    assert.equal(harness.timerNode.classList.contains("exploded"), true);
    assert.equal(harness.expiryStatus.hidden, false);
    assert.equal(harness.savedResults.length, 0);
    assert.equal(harness.scheduled.length, 1);
    assert.equal(harness.scheduled[0].delay, 900);
    assert.equal(harness.getExplosionSounds(), 1);
    await flushScheduled(harness.scheduled);
    assert.equal(harness.getActiveScreen(), "result-screen");
    assert.equal(harness.savedResults.length, 1);
    assert.equal(harness.savedResults[0].total, 50);
    assert.equal(harness.savedResults[0].score, 0.4);
    lateAnswer();
    assert.equal(harness.savedResults.length, 1);
    assert.equal(harness.context.quizEngine.stats.correct, 1);
    assert.equal(harness.getExplosionSounds(), 1);
});

test("delayed timer expires once and an abandoned run cannot open its result screen", async () => {
    const harness = createQuizFlowHarness();
    let now = 0;
    let tick;
    harness.context.Date = { now: () => now };
    harness.context.setInterval = callback => {
        tick = callback;
        return "timer";
    };
    harness.context.startQuizTimer(1);
    now = 3601000;
    tick();
    tick();
    assert.equal(harness.context.expiredQuizRunId, 1);
    assert.equal(harness.context.quizEngine.stats.skipped, 1);
    assert.equal(harness.scheduled.length, 1);
    harness.context.currentQuizRunId = 2;
    await flushScheduled(harness.scheduled);
    assert.equal(harness.savedResults.length, 0);
    assert.equal(harness.getActiveScreen(), "");
});

test("blocked explosion audio does not prevent the final result", async () => {
    const harness = createQuizFlowHarness();
    harness.context.playExplosionSound = async () => { throw new Error("Audio blocked"); };
    harness.context.expireQuiz(1);
    await flushScheduled(harness.scheduled);
    assert.equal(harness.getActiveScreen(), "result-screen");
    assert.equal(harness.savedResults.length, 1);
    assert.equal(harness.warnings[0][0], "Son d’explosion indisponible.");
});

test("explosion sound synthesizes a short noise burst and releases audio nodes", async () => {
    const events = [];
    const parameter = name => ({
        setValueAtTime(value, time) { events.push([name, "set", value, time]); },
        linearRampToValueAtTime(value, time) { events.push([name, "linear", value, time]); },
        exponentialRampToValueAtTime(value, time) { events.push([name, "exponential", value, time]); }
    });
    const node = name => ({
        connect() { events.push([name, "connect"]); },
        disconnect() { events.push([name, "disconnect"]); }
    });
    const source = {
        ...node("source"),
        start(time) { events.push(["start", time]); },
        stop(time) { events.push(["stop", time]); }
    };
    const context = {
        sampleRate: 48000,
        currentTime: 2,
        destination: {},
        createBuffer(channels, frames, rate) {
            assert.equal(channels, 1);
            assert.equal(frames, 38400);
            assert.equal(rate, 48000);
            return { getChannelData: () => new Float32Array(frames) };
        },
        createBufferSource: () => source,
        createBiquadFilter: () => ({ ...node("filter"), frequency: parameter("frequency") }),
        createGain: () => ({ ...node("gain"), gain: parameter("gain") })
    };
    const sandbox = {
        explosionAudioContext: context,
        prepareExplosionAudio: async () => {}
    };
    vm.runInNewContext(extractFunction(appJs, "playExplosionSound"), sandbox);
    await sandbox.playExplosionSound();
    assert.ok(events.some(event => event[0] === "start" && event[1] === 2));
    assert.ok(events.some(event => event[0] === "stop" && event[1] === 2.8));
    assert.ok(events.some(event => event[0] === "gain" && event[2] === 0.45));
    source.onended();
    assert.equal(events.filter(event => event[1] === "disconnect").length, 3);
});

test("last wrong answer is counted and saved in the final note", async () => {
    const harness = createQuizFlowHarness();

    harness.context.afficherSituation();
    harness.optionsGrid.children[0].onclick();

    assert.equal(harness.progress.innerText, "Question 1 / 1");
    await advanceQuiz(harness);

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

    assert.equal(harness.scheduled.length, 0);
    assert.equal(harness.progress.innerText, "Question 1 / 1");
    assert.equal(harness.nextQuestionButton.disabled, false);
    assert.equal(harness.optionsGrid.children[1].classList.contains("correct"), true);

    await advanceQuiz(harness);

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

test("five-question path reaches the result screen with the full score breakdown", async () => {
    const harness = createQuizFlowHarness({
        questions: [
            { q: "Situation 1", r: ["A1", "B1", "C1", "D1"], correct: 0 },
            { q: "Situation 2", r: ["A2", "B2", "C2", "D2"], correct: 2 },
            { q: "Situation 3", r: ["A3", "B3", "C3", "D3"], correct: 1 },
            { q: "Situation 4", r: ["A4", "B4", "C4", "D4"], correct: 3 },
            { q: "Situation 5", r: ["A5", "B5", "C5", "D5"], correct: 1 }
        ]
    });

    harness.context.afficherSituation();
    assert.equal(harness.progress.innerText, "Question 1 / 5");
    assert.equal(harness.question.innerText, "Situation 1");

    harness.optionsGrid.children[0].onclick();
    assert.equal(harness.getActiveScreen(), "");
    assert.equal(harness.progress.innerText, "Question 1 / 5");
    assert.equal(harness.question.innerText, "Situation 1");
    assert.equal(harness.nextQuestionButton.disabled, false);
    assert.equal(harness.nextQuestionButton.innerText, "Question suivante");
    await advanceQuiz(harness);
    assert.equal(harness.progress.innerText, "Question 2 / 5");
    assert.equal(harness.livePoints.innerText, "Points : 4");

    harness.optionsGrid.children[0].onclick();
    await advanceQuiz(harness);
    assert.equal(harness.progress.innerText, "Question 3 / 5");
    assert.equal(harness.livePoints.innerText, "Points : 3");

    harness.skipButton.onclick();
    assert.equal(harness.optionsGrid.children[1].classList.contains("correct"), true);
    assert.equal(harness.progress.innerText, "Question 3 / 5");
    await advanceQuiz(harness);
    assert.equal(harness.progress.innerText, "Question 4 / 5");
    assert.equal(harness.livePoints.innerText, "Points : 3");

    harness.optionsGrid.children[3].onclick();
    await advanceQuiz(harness);
    assert.equal(harness.progress.innerText, "Question 5 / 5");
    assert.equal(harness.livePoints.innerText, "Points : 7");

    harness.optionsGrid.children[2].onclick();
    await advanceQuiz(harness);

    assert.deepEqual(harness.getAnswerSounds(), [true, false, true, false]);
    assert.equal(harness.getActiveScreen(), "result-screen");
    assert.equal(harness.savedResults.length, 1);
    assert.equal(harness.savedResults[0].score, 6);
    assert.equal(harness.savedResults[0].correct, 2);
    assert.equal(harness.savedResults[0].wrong, 2);
    assert.equal(harness.savedResults[0].skipped, 1);
    assert.equal(harness.savedResults[0].total, 5);
    assert.equal(harness.scoreDisplay.innerText, "6.00 / 20");
    assert.equal(harness.statCorrect.innerText, 2);
    assert.equal(harness.statWrong.innerText, 2);
    assert.equal(harness.statSkipped.innerText, 1);
    assert.equal(harness.statBrut.innerText, 6);
    assert.equal(harness.brutMax.innerText, "/ 20");
    assert.equal(harness.context.reviewItems.length, 3);
    assert.equal(harness.context.reviewItems[0].type, "wrong");
    assert.equal(harness.context.reviewItems[1].type, "skipped");
    assert.equal(harness.context.reviewItems[2].type, "wrong");
});

test("final screen renders immediately even if remote result sync stays pending", async () => {
    const harness = createQuizFlowHarness({
        saveResultBehavior: () => new Promise(() => {})
    });

    harness.context.afficherSituation();
    harness.optionsGrid.children[1].onclick();

    await advanceQuiz(harness);

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
    assert.equal(harness.optionsGrid.children[1].classList.contains("correct"), true);
    await advanceQuiz(harness);

    assert.equal(harness.getActiveScreen(), "result-screen");
    assert.equal(harness.savedResults.length, 1);
    assert.equal(harness.savedResults[0].skipped, 1);
    assert.equal(harness.scoreDisplay.innerText, "0.00 / 20");
    assert.equal(harness.warnings.length, 1);
    assert.equal(harness.warnings[0][0], "Synchronisation distante du résultat indisponible.");
});

test("final screen still renders with legacy final-score id", async () => {
    const harness = createQuizFlowHarness({
        useLegacyResultIds: true
    });

    harness.context.afficherSituation();
    harness.optionsGrid.children[1].onclick();

    await advanceQuiz(harness);

    assert.equal(harness.getActiveScreen(), "result-screen");
    assert.equal(harness.savedResults.length, 1);
    assert.equal(harness.savedResults[0].correct, 1);
    assert.equal(harness.scoreDisplay.innerText, "20.00 / 20");
});

test("final screen still renders when result stat nodes are absent", async () => {
    const harness = createQuizFlowHarness({
        omitResultStatsNodes: true
    });

    harness.context.afficherSituation();
    harness.optionsGrid.children[1].onclick();

    await advanceQuiz(harness);

    assert.equal(harness.getActiveScreen(), "result-screen");
    assert.equal(harness.savedResults.length, 1);
    assert.equal(harness.scoreDisplay.innerText, "20.00 / 20");
});

test("final ranking includes the last result even before async save settles", async () => {
    const harness = createQuizFlowHarness({
        persistResultLocally: false,
        saveResultBehavior: () => new Promise(() => {})
    });

    harness.context.afficherSituation();
    harness.optionsGrid.children[1].onclick();

    await advanceQuiz(harness);

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

    await advanceQuiz(harness);

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

    await advanceQuiz(harness);

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

    await advanceQuiz(harness);

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
    const nextQuestionButton = createButton();
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
        quizTimerInterval: null,
        quizTimerDeadline: null,
        isQuizTimeExpired: () => false,
        clearInterval() {},
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
                    "next-question-btn": nextQuestionButton,
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
            extractFunction(appJs, "stopQuizTimer"),
            bilanFinalSource,
            afficherSituationSource
        ].join("\n"),
        context
    );

    context.afficherSituation();
    optionsGrid.children[1].onclick();

    assert.equal(activeScreen, "");
    nextQuestionButton.onclick();
    await flushScheduled(scheduled);
    await new Promise(resolve => setImmediate(resolve));

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
