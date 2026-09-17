import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(testDirectory, "..");
const js = readFileSync(`${root}/app.js`, "utf8");

test("initializeAppInteractions ignores missing new mission button and still wires close-app fallback", async () => {
    const listeners = new Map();
    const body = { innerHTML: "" };
    let closeCalls = 0;
    const elements = new Map(
        [
            "start-btn",
            "logout-btn",
            "admin-logout-btn",
            "admin-question-theme",
            "question-cancel-btn",
            "cleanup-questions-btn",
            "clear-results-btn",
            "question-form",
            "close-app"
        ].map(id => [id, createEventTarget(listeners, id)])
    );

    const initializeAppInteractions = extractNamedFunction("initializeAppInteractions", {
        document: {
            body,
            querySelectorAll(selector) {
                if (selector === ".btn-theme" || selector === ".admin-nav-btn") return [];
                return [];
            },
            getElementById(id) {
                return elements.get(id) ?? null;
            }
        },
        window: {
            close() {
                closeCalls += 1;
            }
        },
        startQuiz() {},
        uiController: { switchScreen() {} },
        supabase: null,
        clearPendingSignup() {},
        showAuthView() {},
        resetQuestionForm() {},
        renderAdminQuestions() {},
        syncQuestionMutation: async () => null,
        setAuthMessage() {},
        loadQuestionsFromSupabase: async () => false,
        switchAdminSection() {},
        clearResults: async () => {},
        renderAdminResults() {},
        renderGlobalRanking() {},
        getResults: () => [],
        questionsBank: { default: { questions: [] } },
        editingQuestionIndex: null,
        createRecordId: () => "question-1",
        saveCurrentThemeQuestions() {},
        questionSourceReady: false,
        currentAuthenticatedAccount: null,
        currentCandidateEmail: "",
        maxQuestions: 20,
        selectedTheme: null
    });

    await initializeAppInteractions();

    const closeHandler = listeners.get("close-app:click");
    assert.equal(typeof closeHandler, "function");

    closeHandler();
    assert.equal(closeCalls, 1);
    assert.equal(body.innerHTML, "<main class=\"app-closed\"><h1>Application fermée</h1></main>");
});

function createEventTarget(listeners, id) {
    return {
        disabled: true,
        addEventListener(eventName, handler) {
            listeners.set(`${id}:${eventName}`, handler);
        }
    };
}

function extractNamedFunction(name, globals = {}) {
    const asyncSignature = `async function ${name}`;
    const plainSignature = `function ${name}`;
    const start = js.includes(asyncSignature)
        ? js.indexOf(asyncSignature)
        : js.indexOf(plainSignature);
    assert.notEqual(start, -1, `Unable to find function ${name}`);

    const bodyStart = js.indexOf("{", start);
    let depth = 0;
    let cursor = bodyStart;
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
