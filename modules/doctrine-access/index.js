const DOCTRINE_ORIGIN = "https://domino2801-cmyk.github.io";
const DOCTRINE_URL = `${DOCTRINE_ORIGIN}/DOCTRINE/index.html?from=qcm-major`;

export function setupDoctrineAccess({ link, status, getSession, returnToConsole, supabaseUrl, supabaseAnonKey, adminMode = false }) {
    if (!link) return;
    const windows = new Set();
    let sessionRequest = null;
    let preparedAdminWindow = null;

    async function prepareHandoffUrl(targetUrl) {
        const session = await getSession();
        if (!session?.access_token || !session.user?.id) throw new Error("Session QCM-MAJOR indisponible.");
        if (!supabaseUrl || !supabaseAnonKey) throw new Error("Configuration du relais indisponible.");
        const response = await fetch(`${supabaseUrl.replace(/\\/$/, "")}/functions/v1/doctrine-auth-handoff`, {
            method: "POST",
            headers: {
                apikey: supabaseAnonKey,
                Authorization: `Bearer ${session.access_token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ action: "create" })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || typeof data.code !== "string" || !data.code) {
            throw new Error(data.error || "Création du relais sécurisé impossible.");
        }
        targetUrl.hash = new URLSearchParams({ anc_handoff: data.code }).toString();
        return targetUrl;
    }

    async function navigateWithHandoff(opened, targetUrl) {
        try {
            const secureUrl = await prepareHandoffUrl(targetUrl);
            if (!opened.closed) opened.location.replace(secureUrl.toString());
            return true;
        } catch (error) {
            console.warn("Relais sécurisé ANC indisponible ; tentative du relais de fenêtre classique.", error);
            if (status) status.textContent = "Relais sécurisé momentanément indisponible. Tentative de connexion classique…";
            if (!opened.closed) opened.location.replace(targetUrl.toString());
            return false;
        }
    }

    link.addEventListener("click", event => {
        if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        const targetUrl = new URL(DOCTRINE_URL);
        if (adminMode) targetUrl.searchParams.set("admin", "1");
        const opened = window.open("about:blank", "doctrine-armoire");
        if (!opened) {
            if (status) status.textContent = "Autorisez l’ouverture des fenêtres pour accéder directement à l’armoire.";
            return;
        }
        if (status) status.textContent = "Ouverture de l’Armoire…";
        windows.add(opened);
        void navigateWithHandoff(opened, targetUrl).then(secure => {
            if (status) status.textContent = secure ? "" : status.textContent;
        });
    });

    window.addEventListener("message", async event => {
        if (event.origin !== DOCTRINE_ORIGIN || !windows.has(event.source)) return;
        if (event.data?.type === "doctrine-return-to-qcm") {
            if (typeof event.data.id !== "string" || typeof event.data.user_id !== "string" || !event.data.user_id) return;
            try {
                const session = await getSession();
                if (!session?.access_token || session.user?.id !== event.data.user_id) {
                    if (status) status.textContent = "La session QCM-MAJOR ne correspond plus à celle de l’Armoire. Reconnectez-vous si nécessaire.";
                    event.source.postMessage({ type: "doctrine-return-response", id: event.data.id, ok: false }, DOCTRINE_ORIGIN);
                    return;
                }
                const ok = returnToConsole?.(event.data.user_id) === true;
                event.source.postMessage({ type: "doctrine-return-response", id: event.data.id, ok }, DOCTRINE_ORIGIN);
            } catch (error) {
                console.warn("Retour depuis l’Armoire impossible.", error);
                if (status) status.textContent = "Impossible de vérifier la session QCM-MAJOR. Réessayez.";
                event.source.postMessage({ type: "doctrine-return-response", id: event.data.id, ok: false }, DOCTRINE_ORIGIN);
            }
            return;
        }
        if (event.data?.type !== "doctrine-session-request" || typeof event.data.id !== "string") return;
        try {
            sessionRequest ||= Promise.resolve().then(getSession).finally(() => { sessionRequest = null; });
            const session = await sessionRequest;
            event.source.postMessage({
                type: "doctrine-session-response",
                id: event.data.id,
                access_token: session?.access_token || null,
                expires_at: session?.expires_at || null
            }, DOCTRINE_ORIGIN);
        } catch (error) {
            console.warn("Transmission de la session à l’armoire impossible.", error);
            event.source.postMessage({ type: "doctrine-session-response", id: event.data.id }, DOCTRINE_ORIGIN);
        }
    });
    return {
        prepareAdminLaunch() {
            if (!adminMode) return false;
            try {
                preparedAdminWindow = window.open("about:blank", "doctrine-armoire");
                if (!preparedAdminWindow) return false;
                windows.add(preparedAdminWindow);
                return true;
            } catch {
                preparedAdminWindow = null;
                return false;
            }
        },
        async launchPreparedAdmin() {
            if (!adminMode || !preparedAdminWindow || preparedAdminWindow.closed) {
                preparedAdminWindow = null;
                return false;
            }
            const opened = preparedAdminWindow;
            preparedAdminWindow = null;
            const targetUrl = new URL(DOCTRINE_URL);
            targetUrl.searchParams.set("admin", "1");
            await navigateWithHandoff(opened, targetUrl);
            return true;
        },
        cancelPreparedAdminLaunch() {
            if (preparedAdminWindow && !preparedAdminWindow.closed) preparedAdminWindow.close();
            if (preparedAdminWindow) windows.delete(preparedAdminWindow);
            preparedAdminWindow = null;
        }
    };
}
