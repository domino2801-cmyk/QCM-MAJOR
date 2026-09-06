// =========================================================
// BANQUE DE QUESTIONS — POINT D’ENTRÉE
// =========================================================

import theme1 from "./theme-1.js";
import theme2 from "./theme-2.js";
import theme3 from "./theme-3.js";
import theme4 from "./theme-4.js";
import theme5 from "./theme-5.js";

function deduplicateTheme(theme) {
    const seen = new Set();
    const questions = theme.questions.filter(question => {
        const key = question.q.trim().replace(/\s+/g, " ").toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    return { ...theme, questions };
}

// ---------------------------------------------------------
// Structure officielle de la banque
// ---------------------------------------------------------

export const questionsBank = {
    "0": deduplicateTheme(theme1),   // Thème 1 : Organisation & Commandement
    "1": deduplicateTheme(theme2),   // Thème 2 : Matériels & Technologies
    "2": deduplicateTheme(theme3),   // Thème 3 : LPM & Budgets
    "3": deduplicateTheme(theme4),   // Thème 4 : OPEX & Missions intérieures
    "4": deduplicateTheme(theme5)    // Thème 5 : Histoire & Traditions
};

// ---------------------------------------------------------
// Fonction : récupérer toutes les questions (Campagne Globale)
// ---------------------------------------------------------

export function getAllQuestions() {
    let all = [];

    Object.values(questionsBank).forEach(theme => {
        if (theme && theme.questions) {
            all = all.concat(theme.questions);
        }
    });

    return all;
}
