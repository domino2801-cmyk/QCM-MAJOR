import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(testDirectory, "..");
const scoring = loadExportedConst("modules/quiz-engine/scoring.js", "scoring");
const stats = loadExportedConst("modules/stats/index.js", "stats");

test("quiz scoring computes final note from total questions and not only answered ones", () => {
    const quizStats = scoring.createStats();

    quizStats.correct = 1;
    quizStats.wrong = 1;
    quizStats.skipped = 1;
    quizStats.points = 3;

    assert.equal(scoring.computeFinal(quizStats, 3), 5);
});

test("quiz scoring clamps negative final note to zero", () => {
    const quizStats = scoring.createStats();

    quizStats.wrong = 2;
    quizStats.points = -2;

    assert.equal(scoring.computeFinal(quizStats, 2), 0);
});

test("stats module uses the same final note formula", () => {
    const statsObj = stats.create();

    statsObj.correct = 2;
    statsObj.wrong = 1;
    statsObj.skipped = 1;
    statsObj.points = 7;
    statsObj.totalQuestions = 4;

    assert.equal(stats.computeFinal(statsObj), 8.75);
    assert.equal(statsObj.finalScore, 8.75);
});

function loadExportedConst(relativePath, exportName) {
    const source = readFileSync(path.join(root, relativePath), "utf8");
    const script = new vm.Script(`${source.replace(`export const ${exportName} =`, `const ${exportName} =`)}\n${exportName};`);
    return script.runInNewContext({
        Date
    });
}
