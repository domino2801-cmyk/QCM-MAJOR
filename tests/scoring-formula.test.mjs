import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(testDirectory, "..");
const scoring = loadExportedConst("modules/quiz-engine/scoring.js", "scoring");

test("quiz scoring computes final note from total questions and not only answered ones", () => {
    const quizStats = scoring.createStats();

    quizStats.correct = 1;
    quizStats.wrong = 1;
    quizStats.skipped = 1;
    quizStats.points = 3;

    assert.equal(scoring.computeFinal(quizStats, 3), 5);
});

test("quiz scoring keeps negative final note when points are negative", () => {
    const quizStats = scoring.createStats();

    quizStats.wrong = 2;
    quizStats.points = -2;

    assert.equal(scoring.computeFinal(quizStats, 2), -5);
});

test("quiz scoring returns 0 when there is no question", () => {
    const quizStats = scoring.createStats();

    assert.equal(scoring.computeFinal(quizStats, 0), 0);
});

test("quiz scoring applyAnswer keeps the tactical barème", () => {
    const quizStats = scoring.createStats();

    scoring.applyAnswer(quizStats, 2, 2);
    scoring.applyAnswer(quizStats, 1, 3);
    scoring.applyAnswer(quizStats, null, 0);

    assert.equal(quizStats.correct, 1);
    assert.equal(quizStats.wrong, 1);
    assert.equal(quizStats.skipped, 1);
    assert.equal(quizStats.points, 3);
});

function loadExportedConst(relativePath, exportName) {
    const source = readFileSync(path.join(root, relativePath), "utf8");
    const script = new vm.Script(`${source.replace(`export const ${exportName} =`, `const ${exportName} =`)}\n${exportName};`);
    return script.runInNewContext({
        Date
    });
}
