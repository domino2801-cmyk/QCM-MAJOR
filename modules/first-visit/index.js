export function initializeFirstVisitPrompt({ document: doc = document, showAuthView }) {
    const overlay = doc.getElementById("first-visit-overlay");
    const container = doc.querySelector(".container");
    const noButton = doc.getElementById("first-visit-no-btn");
    const yesButton = doc.getElementById("first-visit-yes-btn");

    function chooseView(view) {
        overlay.classList.add("hidden");
        container.inert = false;
        showAuthView(view);
        doc.getElementById(view === "login" ? "login-email" : "register-pseudo").focus();
    }

    noButton.addEventListener("click", () => chooseView("register"));
    yesButton.addEventListener("click", () => chooseView("login"));
    overlay.addEventListener("keydown", event => {
        if (event.key !== "Tab") return;
        if (event.shiftKey && doc.activeElement === noButton) {
            event.preventDefault();
            yesButton.focus();
        } else if (!event.shiftKey && doc.activeElement === yesButton) {
            event.preventDefault();
            noButton.focus();
        }
    });

    return () => {
        if (!doc.getElementById("auth-screen").classList.contains("active")
            || doc.getElementById("login-view").classList.contains("hidden")
            || doc.getElementById("login-message").innerText) return;

        container.inert = true;
        overlay.classList.remove("hidden");
        noButton.focus();
    };
}
