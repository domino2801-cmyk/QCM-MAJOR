import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(path.join(root, "app.js"), "utf8");

function extractFunction(functionName) {
    const marker = `function ${functionName}(`;
    const start = appJs.indexOf(marker);
    assert.notEqual(start, -1, `Unable to find ${functionName}`);
    const bodyStart = appJs.indexOf("{", appJs.indexOf(")", start));
    let depth = 0;

    for (let index = bodyStart; index < appJs.length; index += 1) {
        if (appJs[index] === "{") depth += 1;
        if (appJs[index] === "}") depth -= 1;
        if (depth === 0) return appJs.slice(start, index + 1);
    }

    throw new Error(`Unable to extract ${functionName}`);
}

function createStartHarness({ theme, mode, maxQuestions, historyByEmail = {} }) {
    const poolByTheme = {
        "1": [
            { id: "a", q: "Question Alpha", r: ["A", "B", "C", "D"], correct: 0 },
            { id: "b", q: "Question Bravo", r: ["A", "B", "C", "D"], correct: 1 },
            { id: "c", q: "Question Charlie", r: ["A", "B", "C", "D"], correct: 2 }
        ],
        all: [
            { id: "a", q: "Question Alpha", r: ["A", "B", "C", "D"], correct: 0 },
            { id: "d", q: "Question Delta", r: ["A", "B", "C", "D"], correct: 3 }
        ]
    };
    const calls = [];
    const storage = new Map();
    const status = { hidden: false };
    const timerNode = {
        hidden: false,
        classList: {
            removed: [],
            remove(name) {
                this.removed.push(name);
            }
        }
    };
    const history = structuredClone(historyByEmail);
    const context = {
        selectedTheme: theme,
        quizFeedbackMode: mode,
        maxQuestions,
        currentAuthenticatedAccount: { id: "candidate-id", email: "candidate@example.com" },
        supabase: {},
        questionSourceReady: true,
        getStoredSupabaseSession: () => ({ access_token: "candidate-token" }),
        setConnectionStatus: message => {
            if (message) calls.push(["connectionStatus", message]);
        },
        currentCandidateEmail: "",
        currentQuizRunId: 4,
        finalizedQuizRunId: 3,
        expiredQuizRunId: 3,
        questionTransitionLocked: true,
        displayedQuestion: { q: "old question" },
        reviewItems: [{ type: "wrong" }],
        questionHistoryStorageKey: "quiz-history",
        getQuestionHistory: () => history,
        getQuestionPool: themeId => poolByTheme[themeId] || [],
        normalizeQuestionHistoryKey: question =>
            String(question || "").trim().replace(/\s+/g, " ").toLowerCase(),
        quizEngine: {
            questions: [],
            selectTheme(themeId, quantity, excludedQuestions) {
                calls.push(["selectTheme", themeId, quantity, excludedQuestions]);
                const excluded = new Set(excludedQuestions.map(question =>
                    this.questionKey(question)
                ));
                this.questions = poolByTheme[themeId]
                    .filter(question => !excluded.has(this.questionKey(question.q)))
                    .slice(0, quantity);
            },
            questionKey: question => String(question).trim().replace(/\s+/g, " ").toLowerCase()
        },
        document: {
            getElementById(id) {
                return {
                    "quiz-expiry-status": status,
                    "quiz-timer": timerNode
                }[id] || null;
            }
        },
        localStorage: {
            setItem(key, value) {
                storage.set(key, value);
            }
        },
        uiController: {
            switchScreen: screen => calls.push(["switchScreen", screen])
        },
        startQuizTimer: runId => calls.push(["startTimer", runId]),
        stopQuizTimer: () => calls.push(["stopTimer"]),
        afficherSituation: runId => calls.push(["showQuestion", runId])
    };

    vm.runInNewContext(
        `${extractFunction("startQuiz")}\n${extractFunction("normalizeQuestionHistoryKey")}`,
        context
    );

    return { context, calls, history, storage, status, timerNode };
}

test("le lancement d'un QCM de zone applique l'historique, ouvre le quiz et affiche la première question", () => {
    const harness = createStartHarness({
        theme: "1",
        mode: "training",
        maxQuestions: 2,
        historyByEmail: {
            "candidate@example.com": {
                "1": ["  question   alpha  ", "Question déjà retirée"]
            }
        }
    });

    harness.context.startQuiz();

    assert.equal(harness.calls[0][0], "selectTheme");
    assert.equal(harness.calls[0][1], "1");
    assert.equal(harness.calls[0][2], 2);
    assert.deepEqual(Array.from(harness.calls[0][3]), ["  question   alpha  "]);
    assert.equal(harness.context.currentQuizRunId, 5);
    assert.equal(harness.context.finalizedQuizRunId, -1);
    assert.equal(harness.context.expiredQuizRunId, -1);
    assert.equal(harness.context.questionTransitionLocked, false);
    assert.equal(harness.context.displayedQuestion, null);
    assert.deepEqual(Array.from(harness.context.reviewItems), []);
    assert.deepEqual(harness.calls.slice(1), [
        ["switchScreen", "quiz-screen"],
        ["stopTimer"],
        ["showQuestion", 5]
    ]);
    assert.deepEqual(JSON.parse(harness.storage.get("quiz-history"))["candidate@example.com"]["1"], [
        "  question   alpha  ",
        "Question Bravo",
        "Question Charlie"
    ]);
    assert.equal(harness.status.hidden, true);
    assert.equal(harness.timerNode.hidden, true);
    assert.deepEqual(harness.timerNode.classList.removed, ["urgent"]);
});

test("le lancement d'un combat haute intensité démarre le chronomètre", () => {
    const harness = createStartHarness({
        theme: "all",
        mode: "exam",
        maxQuestions: 50
    });

    harness.context.startQuiz();

    assert.equal(harness.calls[0][0], "selectTheme");
    assert.equal(harness.calls[0][1], "all");
    assert.equal(harness.calls[0][2], 50);
    assert.deepEqual(harness.calls.slice(1), [
        ["switchScreen", "quiz-screen"],
        ["startTimer", 5],
        ["showQuestion", 5]
    ]);
    assert.equal(harness.timerNode.hidden, false);
});

function createElement(tagName) {
    return {
        tagName,
        children: [],
        className: "",
        innerText: "",
        append(...children) {
            this.children.push(...children);
        },
        appendChild(child) {
            this.children.push(child);
        }
    };
}

test("la revue tactique affiche la réponse choisie et la correction séparément", () => {
    const classes = new Set();
    const section = {
        classList: {
            toggle(name, enabled) {
                if (enabled) classes.add(name);
                else classes.delete(name);
            }
        }
    };
    const list = {
        children: [],
        _innerHTML: "ancienne revue",
        get innerHTML() {
            return this._innerHTML;
        },
        set innerHTML(value) {
            this._innerHTML = value;
            this.children = [];
        },
        appendChild(item) {
            this.children.push(item);
        }
    };
    const context = {
        reviewItems: [
            {
                type: "wrong",
                question: "Quelle est la bonne réponse ?",
                selected: "Réponse choisie",
                correct: "Réponse correcte"
            },
            {
                type: "skipped",
                question: "Quelle réponse a été passée ?",
                correct: "Réponse attendue"
            }
        ],
        document: {
            getElementById(id) {
                return {
                    "review-section": section,
                    "review-list": list
                }[id] || null;
            },
            createElement
        }
    };

    vm.runInNewContext(extractFunction("renderReview"), context);
    context.renderReview();

    assert.equal(list.innerHTML, "");
    assert.equal(list.children.length, 2);
    assert.equal(list.children[0].className, "review-item wrong");
    assert.deepEqual(
        list.children[0].children[2].children.map(answer => answer.innerText),
        ["Votre réponse : Réponse choisie", "Correction : Réponse correcte"]
    );
    assert.equal(list.children[1].className, "review-item skipped");
    assert.equal(
        list.children[1].children[2].children[0].innerText,
        "Réponse : Réponse attendue"
    );
    assert.equal(classes.has("hidden"), false);
});
