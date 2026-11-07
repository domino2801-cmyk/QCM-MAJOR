const DOCTRINE_ORIGIN = "https://domino2801-cmyk.github.io";
const DOCTRINE_URL = `${DOCTRINE_ORIGIN}/DOCTRINE/index.html?from=qcm-major`;

export function setupDoctrineAccess({ link, status, getSession }) {
    if (!link) return;
    const windows = new Set();
    let sessionRequest = null;

    link.addEventListener("click", event => {
        if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        const opened = window.open(DOCTRINE_URL, "_blank");
        if (!opened) {
            if (status) status.textContent = "Autorisez l’ouverture des fenêtres pour accéder directement à l’armoire.";
            return;
        }
        if (status) status.textContent = "";
        windows.add(opened);
    });

    window.addEventListener("message", async event => {
        if (event.origin !== DOCTRINE_ORIGIN || !windows.has(event.source) ||
            event.data?.type !== "doctrine-session-request" || typeof event.data.id !== "string") return;
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
