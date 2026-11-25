const DOCTRINE_ORIGIN = "https://domino2801-cmyk.github.io";
const DOCTRINE_URL = `${DOCTRINE_ORIGIN}/DOCTRINE/index.html?from=qcm-major`;

export function setupDoctrineAccess({ link, status, getSession, returnToConsole, adminMode = false }) {
    if (!link) return;
    const windows = new Set();
    let sessionRequest = null;

    link.addEventListener("click", event => {
        if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        const targetUrl = new URL(DOCTRINE_URL);
        if (adminMode) targetUrl.searchParams.set("admin", "1");
        const opened = window.open(targetUrl.toString(), "doctrine-armoire");
        if (!opened) {
            if (status) status.textContent = "Autorisez l’ouverture des fenêtres pour accéder directement à l’armoire.";
            return;
        }
        if (status) status.textContent = "";
        windows.add(opened);
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
}
