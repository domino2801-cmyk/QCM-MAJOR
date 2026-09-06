// =========================================================
// ROUTER — SYSTÈME DE NAVIGATION TACTIQUE
// =========================================================
//
// Rôle : gérer les transitions entre les écrans de l'application.
// Compatible avec : ui-controller, app.js
//
// Écrans disponibles :
//   - theme-screen
//   - quiz-screen
//   - result-screen
//
// =========================================================

export const router = {

    // -----------------------------------------------------
    // Aller vers un écran spécifique
    // -----------------------------------------------------
    go(screenId) {
        const screens = document.querySelectorAll(".screen");

        screens.forEach(screen => {
            screen.classList.remove("active");
        });

        const target = document.getElementById(screenId);
        if (target) {
            target.classList.add("active");
        }
    },

    // -----------------------------------------------------
    // Retour au menu principal (sélection du théâtre)
    // -----------------------------------------------------
    toMenu() {
        this.go("theme-screen");
    },

    // -----------------------------------------------------
    // Aller à l'écran de mission (quiz)
    // -----------------------------------------------------
    toMission() {
        this.go("quiz-screen");
    },

    // -----------------------------------------------------
    // Aller au bilan de campagne
    // -----------------------------------------------------
    toResult() {
        this.go("result-screen");
    },

    // -----------------------------------------------------
    // Vérifier si un écran est actif
    // -----------------------------------------------------
    isActive(screenId) {
        const screen = document.getElementById(screenId);
        return screen && screen.classList.contains("active");
    }
};
