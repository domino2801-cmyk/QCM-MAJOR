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

        const shuffledPool = this.shuffle([...pool]);
        const freshQuestions = shuffledPool.filter(question =>
            !excludedQuestions.includes(question.q)
        );
        const previousQuestions = shuffledPool.filter(question =>
            excludedQuestions.includes(question.q)
        );

        return [...freshQuestions, ...previousQuestions].slice(0, qty);
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
