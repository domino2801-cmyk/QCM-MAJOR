// =========================================================
// STATS — MODULE DE STATISTIQUES TACTIQUES
// =========================================================
//
// Rôle : gérer les statistiques d’une mission BM4
//        + historique des missions
//        + export des résultats
//
// Compatible avec : quiz-engine, ui-controller, app.js
//
// =========================================================

export const stats = {

    // -----------------------------------------------------
    // Création d’un bloc de statistiques vierge
    // -----------------------------------------------------
    create() {
        return {
            correct: 0,
            wrong: 0,
            skipped: 0,
            points: 0,
            totalQuestions: 0,
            finalScore: 0,
            date: new Date().toISOString()
        };
    },

    // -----------------------------------------------------
    // Mise à jour selon la réponse
    // -----------------------------------------------------
    apply(statsObj, selected, correct) {

        if (selected === null) {
            statsObj.skipped++;
            return;
        }

        if (selected === correct) {
            statsObj.correct++;
            statsObj.points += 4;
        } else {
            statsObj.wrong++;
            statsObj.points -= 1;
        }
    },

    // -----------------------------------------------------
    // Calcul final sur 20
    // -----------------------------------------------------
    computeFinal(statsObj) {

        const evaluated = statsObj.totalQuestions - statsObj.skipped;
        const maxPoints = evaluated * 4;

        const pts = Math.max(statsObj.points, 0);

        if (maxPoints === 0) {
            statsObj.finalScore = 0;
            return 0;
        }

        const score = (pts / maxPoints) * 20;

        statsObj.finalScore = score;
        return score;
    },

    // -----------------------------------------------------
    // Sauvegarde dans l’historique local
    // -----------------------------------------------------
    save(statsObj) {
        const history = this.loadHistory();
        history.push(statsObj);
        localStorage.setItem("bm4_history", JSON.stringify(history));
    },

    // -----------------------------------------------------
    // Chargement de l’historique
    // -----------------------------------------------------
    loadHistory() {
        try {
            const raw = localStorage.getItem("bm4_history");
            return raw ? JSON.parse(raw) : [];
        } catch {
            return [];
        }
    },

    // -----------------------------------------------------
    // Effacer l’historique
    // -----------------------------------------------------
    clearHistory() {
        localStorage.removeItem("bm4_history");
    },

    // -----------------------------------------------------
    // Export des résultats (format JSON)
    // -----------------------------------------------------
    export(statsObj) {
        return JSON.stringify(statsObj, null, 2);
    }
};
