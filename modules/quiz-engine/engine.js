// =========================================================
// ENGINE — LOGIQUE PURE DU MOTEUR
// =========================================================

import { questionsBank, getAllQuestions } from "../questions-bank/index.js";

export const engine = {

    // -----------------------------------------------------
    // Charger les questions selon le thème
    // -----------------------------------------------------
    loadQuestions(themeId, qty, excludedQuestions = []) {

        let pool = [];

        if (themeId === "all") {
            pool = getAllQuestions();
        } else {
            const themeIndex = (parseInt(themeId, 10) - 1).toString();

            if (questionsBank[themeIndex]) {
                pool = questionsBank[themeIndex].questions;
            }
        }

        const seen = new Set();
        const uniquePool = pool.filter(question => {
            const key = this.questionKey(question.q);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
        const excluded = new Set(excludedQuestions.map(question => this.questionKey(question)));

        return this.shuffle(uniquePool)
            .filter(question => !excluded.has(this.questionKey(question.q)))
            .slice(0, qty);
    },

    questionKey(questionText) {
        return String(questionText || "").trim().replace(/\s+/g, " ").toLowerCase();
    },

    // -----------------------------------------------------
    // Mélange Fisher-Yates
    // -----------------------------------------------------
    shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }
};
