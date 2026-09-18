import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const engineSource = readFileSync(`${root}/modules/quiz-engine/engine.js`, "utf8")
    .replace(/import\s+\{\s*questionsBank,\s*getAllQuestions\s*\}\s+from\s+"\.\.\/questions-bank\/index\.js";\s*/, "")
    .replace("export const engine =", "const engine =");

function createEngine() {
    const themeQuestions = [
        { q: "Question commune", correct: 0 },
        { q: "Question commune  ", correct: 1 },
        { q: "Question unique", correct: 2 },
        { q: "Question finale", correct: 3 }
    ];
    const context = {
        questionsBank: { "0": { questions: themeQuestions } },
        getAllQuestions: () => themeQuestions,
        Math
    };
    return vm.runInNewContext(`${engineSource}\nengine;`, context);
}

test("question selection never duplicates normalized questions", () => {
    const engine = createEngine();
    const questions = engine.loadQuestions("all", 10);
    const keys = questions.map(question => engine.questionKey(question.q));

    assert.equal(questions.length, 3);
    assert.equal(new Set(keys).size, questions.length);
});

test("question selection excludes questions already used", () => {
    const engine = createEngine();
    const questions = engine.loadQuestions("all", 10, ["Question commune"]);

    assert.equal(questions.length, 2);
    assert.ok(questions.every(question => engine.questionKey(question.q) !== "question commune"));
});