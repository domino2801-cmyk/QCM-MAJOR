// =========================================================
// SCORING — BARÈME MILITAIRE
// =========================================================

export const scoring = {

    // -----------------------------------------------------
    // Création du tableau de statistiques
    // -----------------------------------------------------
    createStats() {
        return {
            correct: 0,
            wrong: 0,
            skipped: 0,
            points: 0
        };
    },

    // -----------------------------------------------------
    // Application du barème
    // -----------------------------------------------------
    applyAnswer(stats, selected, correct) {

        if (selected === null) {
            stats.skipped++;
            return;
        }

        if (selected === correct) {
            stats.correct++;
            stats.points += 4;
        } else {
            stats.wrong++;
            stats.points -= 1;
        }
    },

    // -----------------------------------------------------
    // Calcul final sur 20
    // -----------------------------------------------------
    getQuestionCount(stats, totalQuestions = 0) {
        const answeredQuestions = stats.correct + stats.wrong + stats.skipped;

        return Math.max(totalQuestions, answeredQuestions);
    },

    computeFinal(stats, totalQuestions) {

        const questionCount = this.getQuestionCount(stats, totalQuestions);
        const maxPoints = questionCount * 4;

        if (maxPoints === 0) return 0;

        return (stats.points / maxPoints) * 20;
    }
};
