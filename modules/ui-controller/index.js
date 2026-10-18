// =========================================================
// UI-CONTROLLER — GESTION DES ÉCRANS ET DE L’INTERFACE
// =========================================================

export const uiController = {

    // -----------------------------------------------------
    // Changement d’écran (theme-screen, quiz-screen, result-screen)
    // -----------------------------------------------------
    switchScreen(screenId) {
        document.querySelectorAll(".screen").forEach(screen => {
            screen.classList.remove("active");
        });

        const target = document.getElementById(screenId);
        if (target) {
            target.classList.add("active");
        }
    },

    // -----------------------------------------------------
    // Mise à jour du texte d’une zone
    // -----------------------------------------------------
    setText(id, text) {
        const el = document.getElementById(id);
        if (el) el.innerText = text;
    },

    // -----------------------------------------------------
    // Nettoyage des options de réponse
    // -----------------------------------------------------
    clearOptions() {
        const options = document.getElementById("options-grid");
        if (options) options.innerHTML = "";
    },

    // -----------------------------------------------------
    // Désactivation de tous les boutons de réponse
    // -----------------------------------------------------
    lockOptions() {
        document.querySelectorAll("#options-grid .btn, #skip-btn")
            .forEach(btn => btn.disabled = true);
    },

    // -----------------------------------------------------
    // Marquage visuel des réponses
    // -----------------------------------------------------
    markAnswer(selected, correct) {
        const btns = document.querySelectorAll("#options-grid .btn");

        if (btns[selected]) {
            btns[selected].classList.add(
                selected === correct ? "correct" : "incorrect"
            );
        }

        if (btns[correct]) {
            btns[correct].classList.add("correct");
        }
    },

    // -----------------------------------------------------
    // Réinitialisation de la sélection des thèmes
    // -----------------------------------------------------
    resetThemeSelection() {
        const themeSelect = document.getElementById("theme-select");
        if (themeSelect) themeSelect.value = "1";

        const qtyInput = document.getElementById("qty-theme");
        if (qtyInput) qtyInput.value = 10;

        const globalBtn = document.getElementById("theme-global-btn");
        if (globalBtn) {
            globalBtn.classList.remove("active");
            globalBtn.setAttribute("aria-pressed", "false");
        }

        const trainingBtn = document.getElementById("theme-training-btn");
        if (trainingBtn) {
            trainingBtn.classList.remove("active");
            trainingBtn.setAttribute("aria-pressed", "false");
        }

        document.querySelectorAll(".theme-objective-btn").forEach(button => {
            const isDefault = button.dataset.theme === "1";
            button.classList.toggle("active", isDefault);
            button.setAttribute("aria-pressed", String(isDefault));
        });

        document.querySelectorAll(".qty-choice-btn").forEach(button => {
            const isDefault = button.dataset.qty === "10";
            button.classList.toggle("active", isDefault);
            button.setAttribute("aria-pressed", String(isDefault));
        });

        const startBtn = document.getElementById("start-btn");
        if (startBtn) startBtn.disabled = false;
        themeSelect?.dispatchEvent(new Event("change", { bubbles: true }));
    }
};
