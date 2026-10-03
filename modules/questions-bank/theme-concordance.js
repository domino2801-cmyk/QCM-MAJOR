import { themeAssignments } from "./theme-assignments.js";
import { isUnitLocationQuestion } from "./unit-locations.js";

function normalizeText(text) {
    return String(text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .trim().replace(/\s+/g, " ").toLowerCase();
}

function questionKey(question, includeAnswers = false) {
    const title = normalizeText(question.q);
    return includeAnswers
        ? JSON.stringify([title, (question.r || []).map(normalizeText)])
        : title;
}

const reviewedThemes = new Map();
const reviewedAnswerThemes = new Map();
for (const [, themeId, title, answers] of themeAssignments) {
    const question = { q: title, r: answers };
    const map = answers ? reviewedAnswerThemes : reviewedThemes;
    map.set(questionKey(question, Boolean(answers)), String(themeId));
}

export function getQuestionTheme(question, currentThemeId) {
    const reviewed = reviewedAnswerThemes.get(questionKey(question, true))
        ?? reviewedThemes.get(questionKey(question));
    if (reviewed !== undefined) return reviewed;
    return isUnitLocationQuestion(question.q) ? "5" : String(currentThemeId);
}

export function reconcileQuestionThemes(bank) {
    const destinations = Object.fromEntries(Object.keys(bank).map(themeId => [themeId, []]));
    for (const [themeId, theme] of Object.entries(bank)) {
        for (const question of theme.questions) {
            const target = getQuestionTheme(question, themeId);
            if (!destinations[target]) {
                throw new Error(`Thème de destination absent de la banque : ${target}`);
            }
            destinations[target].push(question);
        }
    }
    for (const [themeId, questions] of Object.entries(destinations)) {
        bank[themeId].questions = questions;
    }
}
