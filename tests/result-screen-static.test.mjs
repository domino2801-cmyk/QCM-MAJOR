import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(testDirectory, "..");
const html = readFileSync(`${root}/index.html`, "utf8");
const js = readFileSync(`${root}/app.js`, "utf8");

test("result screen exposes the ids expected by app.js", () => {
    assert.match(html, /id="score-display"/);
    assert.match(html, /id="result-details"/);
    assert.match(html, /id="stat-correct"/);
    assert.match(html, /id="stat-wrong"/);
    assert.match(html, /id="stat-skipped"/);
    assert.doesNotMatch(html, /id="stat-brut"|id="brut-max"/);
    assert.match(html, /id="review-section"/);
    assert.match(html, /id="review-list"/);
    assert.match(html, /id="btn-new-mission"/);
    assert.match(html, /id="btn-evolution-result"/);
    assert.match(html, /id="global-evolution-section"/);
    assert.match(html, /id="global-evolution-summary"/);
    assert.match(html, /id="global-evolution-period"/);
    assert.match(html, /id="global-evolution-chart"/);
    assert.match(html, /id="global-evolution-list"/);
    assert.match(html, /class="result-motivation-title"/);
    assert.match(html, /class="result-motivation-description"/);
    assert.match(html, /class="result-motivation-emphasis"/);
    assert.doesNotMatch(html, /id="final-score"/);
});

test("motivational feedback uses five note bands with the supplied feedback data", () => {
    const start = js.indexOf("function getRandomMotivationalPhrase(");
    const end = js.indexOf("async function bilanFinal(", start);
    assert.notEqual(start, -1);
    assert.notEqual(end, -1);
    const context = vm.createContext({ Math: { floor: Math.floor, random: () => 0 } });
    vm.runInContext(`${js.slice(start, end)}; this.getFeedback = getRandomMotivationalPhrase;`, context);
    const getFeedback = note => context.getFeedback(note);

    assert.match(getFeedback(7.99).title, /Mission non validée/);
    assert.match(getFeedback(8).title, /Note entre 8 et 10\/20.*Seuil de tolérance/);
    assert.match(getFeedback(9.99).title, /Note entre 8 et 10\/20/);
    assert.match(getFeedback(10).title, /Note entre 10 et 12\/20.*Objectif atteint/);
    assert.match(getFeedback(12).title, /Note entre 10 et 12\/20/);
    assert.equal(getFeedback(12.01).title, "🚀 Domination du terrain / Combat maîtrisé");
    assert.equal(getFeedback(15).title, "🚀 Domination du terrain / Combat maîtrisé");
    assert.match(getFeedback(15.01).title, /Note au-dessus de 15\/20.*Excellence tactique/);
    assert.equal(getFeedback(13).description, "Tu domines ton sujet et infliges de lourds dégâts à l'adversaire avec une belle régularité.");
    assert.equal(getFeedback(4).emphasis, "La ligne de défense a cédé au combat.");
    assert.match(getFeedback(4).description, /revue tactique/);
    assert.equal(getFeedback(16).emphasis, "Excellence tactique démontrée.");
});

test("quiz option locking and marking target #options-grid in app.js", () => {
    assert.match(js, /querySelectorAll\("#options-grid \.btn, #skip-btn"\)/);
    assert.match(js, /querySelectorAll\("#options-grid \.btn"\)/);
    assert.doesNotMatch(js, /querySelectorAll\("#options-grid \.btn, #options-grid \.btn-skip"\)/);
    assert.doesNotMatch(js, /querySelectorAll\("#options \.btn, #skip-btn"\)/);
    assert.doesNotMatch(js, /querySelectorAll\("#options \.btn"\)/);
});

test("result screen calculates and displays the final score out of 20", () => {
    assert.match(js, /scoring\.computeFinal\(quizEngine\.stats, total\)/);
    assert.match(js, /setResultText\(\["score-display", "final-score"\], `\$\{note\.toFixed\(2\)\} \/ 20`\)/);
});

test("result evolution only uses global campaign results", () => {
    assert.match(js, /result\.theme === "all"/);
    assert.match(js, /result\.candidateId === candidateId/);
    assert.match(js, /result\.email \|\| ""/);
    assert.match(js, /btn-evolution-result/);
    assert.match(js, /global-evolution-list/);
    assert.match(js, /Aucune note de Campagne Globale enregistrée/);
    assert.match(js, /Moyenne :/);
    assert.match(js, /Meilleure note :/);
    assert.match(js, /selectedTheme === "all"/);
    assert.match(js, /periodDays \* 24 \* 60 \* 60 \* 1000/);
});

test("global ranking displays the candidate pseudo before legacy labels", () => {
    assert.match(js, /result\.name \|\| result\.label \|\| result\.email/);
    assert.match(js, /global-ranking-rank/);
    assert.match(js, /rankingDateFormatter/);
    assert.match(js, /previousResult\.score === result\.score/);
});

test("theme screen exposes question rotation availability", () => {
    assert.match(html, /id="question-rotation-status"/);
    assert.match(html, /id="reset-question-history-btn"/);
    assert.match(js, /updateQuestionRotationStatus/);
    assert.match(js, /Rotation complète/);
    assert.doesNotMatch(js, /question\(s\) inédites disponibles/);
    assert.match(js, /Réinitialiser votre historique de questions/);
});
