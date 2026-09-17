const defaultSplashId = "app-splash";
const defaultSplashStatusId = "app-splash-status";
const defaultSplashHiddenClass = "app-splash--hidden";
const defaultStartupErrorMessage = "Initialisation incomplète. Vérifiez la connexion puis relancez l’application.";
const degradedModeLabel = "MODE DÉGRADÉ";

export function setSplashStatus({ document: doc = document, statusId = defaultSplashStatusId, message } = {}) {
    const status = doc.getElementById(statusId);
    if (status) {
        status.innerText = message;
    }
}

export function activateSplashFallback({
    document: doc = document,
    splashId = defaultSplashId,
    hiddenClass = defaultSplashHiddenClass,
    message = defaultStartupErrorMessage
} = {}) {
    const splash = doc.getElementById(splashId);
    if (splash && splash.dataset.state !== "hidden") {
        splash.dataset.state = "hidden";
        splash.classList.add(hiddenClass);
        splash.setAttribute("aria-hidden", "true");
        splash.hidden = true;
    }

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

export function installSplashFallback({
    window: win = window,
    document: doc = document,
    splashId = defaultSplashId,
    hiddenClass = defaultSplashHiddenClass,
    timeoutMs = 4000,
    minDuration = 1400,
    fallbackMessage = defaultStartupErrorMessage
} = {}) {
    const activateFallback = () => activateSplashFallback({
        document: doc,
        splashId,
        hiddenClass,
        message: fallbackMessage
    });
    const state = {
        shownAt: Date.now(),
        minDuration,
        hiddenClass,
        activateFallback,
        timeoutId: win.setTimeout(activateFallback, timeoutMs)
    };
    win.__bm4Splash = state;
    return state;
}

export async function hideSplashScreen({
    window: win = window,
    document: doc = document,
    splashId = defaultSplashId,
    hiddenClass = defaultSplashHiddenClass,
    immediate = false
} = {}) {
    const splash = doc.getElementById(splashId);
    if (!splash || splash.dataset.state === "hidden") return;

    const state = win.__bm4Splash || {};
    if (state.hidePromise) {
        await state.hidePromise;
        return;
    }

    state.hidePromise = (async () => {
        if (state.timeoutId !== undefined && state.timeoutId !== null) {
            win.clearTimeout(state.timeoutId);
            state.timeoutId = null;
        }

        const shownAt = Number(state.shownAt || Date.now());
        const minDuration = Number(state.minDuration || 1400);
        const elapsed = Date.now() - shownAt;
        const waitTime = immediate ? 0 : Math.max(0, minDuration - elapsed);

        await new Promise(resolve => win.setTimeout(resolve, waitTime));
        splash.dataset.state = "hidden";
        splash.classList.add(state.hiddenClass || hiddenClass);
        splash.setAttribute("aria-hidden", "true");

        if (win.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
            splash.hidden = true;
            return;
        }

        await new Promise(resolve => win.setTimeout(resolve, 320));
        splash.hidden = true;
    })();

    try {
        await state.hidePromise;
    } finally {
        state.hidePromise = null;
    }
}
