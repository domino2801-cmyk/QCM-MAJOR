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
    computeFinal(stats, totalQuestions) {

        const evaluated = totalQuestions - stats.skipped;
        const maxPoints = evaluated * 4;

        const pts = Math.max(stats.points, 0);

        if (maxPoints === 0) return 0;

        return (pts / maxPoints) * 20;
    }
};
