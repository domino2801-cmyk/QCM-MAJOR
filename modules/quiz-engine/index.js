// =========================================================
// QUIZ-ENGINE — POINT D’ENTRÉE
// =========================================================

import { engine } from "./engine.js";
import { scoring } from "./scoring.js";

export const quizEngine = {
    selectedTheme: null,
    questions: [],
    index: 0,
    stats: scoring.createStats(),

    // -----------------------------------------------------
    // Sélection du thème et préparation de la campagne
    // -----------------------------------------------------
    selectTheme(themeId, qty, excludedQuestions = []) {
        this.selectedTheme = themeId;
        this.index = 0;
        this.stats = scoring.createStats();

        // Récupération des questions via le moteur
        this.questions = engine.loadQuestions(themeId, qty, excludedQuestions);
    },

    // -----------------------------------------------------
    // Récupération de la situation en cours
    // -----------------------------------------------------
    getCurrent() {
        return this.questions[this.index];
    },

    // -----------------------------------------------------
    // Traitement d’une réponse
    // -----------------------------------------------------
    answer(choice) {
        const q = this.getCurrent();

        scoring.applyAnswer(this.stats, choice, q.correct);

        this.index++;

        return this.index < this.questions.length;
    }
};
