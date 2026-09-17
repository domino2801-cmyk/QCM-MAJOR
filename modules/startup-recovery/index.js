const degradedModeLabel = "MODE DÉGRADÉ";

export function showStartupRecoveryState({ document: doc = document, message } = {}) {
    doc.querySelectorAll(".screen").forEach(screen => {
        screen.classList.toggle("active", screen.id === "auth-screen");
    });

    ["register-view", "otp-view", "reset-view", "success-view", "admin-form"].forEach(id => {
        doc.getElementById(id)?.classList.add("hidden");
    });
    doc.getElementById("login-view")?.classList.remove("hidden");

    doc.querySelectorAll('#auth-screen [data-auth-mode="login"]').forEach(button => {
        button.classList.add("active");
    });
    doc.querySelectorAll('#auth-screen [data-auth-mode="register"]').forEach(button => {
        button.classList.remove("active");
    });

    const authState = doc.getElementById("auth-terminal-state");
    if (authState) authState.innerText = degradedModeLabel;

    const loginMessage = doc.getElementById("login-message");
    if (loginMessage) loginMessage.innerText = message;
}
