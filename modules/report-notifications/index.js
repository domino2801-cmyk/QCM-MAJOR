const serviceWorkerUrl = new URL("../../service-worker.js", import.meta.url);
const serviceWorkerScope = new URL("../../", import.meta.url).pathname;

function ensureSupported() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        throw new Error("Les notifications ne sont pas disponibles ici. Utilisez Chrome sur Android en HTTPS.");
    }
}

async function getRegistration() {
    ensureSupported();
    return navigator.serviceWorker.getRegistration(serviceWorkerScope);
}

async function request(url, key, accessToken, path, options = {}) {
    const response = await fetch(`${url}${path}`, {
        ...options,
        headers: {
            apikey: key,
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            ...(path.startsWith("/rest/v1/")
                ? { Prefer: "return=representation,resolution=merge-duplicates" }
                : {})
        }
    });
    const data = await response.json();
    if (!response.ok) {
        throw new Error(data?.message || data?.error || `Notifications HTTP ${response.status}`);
    }
    return data;
}

function subscriptionPath(userId, endpoint) {
    return `/rest/v1/admin_push_subscriptions?user_id=eq.${encodeURIComponent(userId)}&endpoint=eq.${encodeURIComponent(endpoint)}`;
}

export async function reportNotificationsEnabled({ url, key, accessToken, userId }) {
    const registration = await getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return false;
    const rows = await request(url, key, accessToken, `${subscriptionPath(userId, subscription.endpoint)}&select=endpoint`);
    if (!Array.isArray(rows)) throw new Error("Réponse des abonnements aux notifications invalide.");
    return rows.length > 0;
}

export async function enableReportNotifications({ url, key, accessToken, userId }) {
    ensureSupported();
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
        throw new Error("Notifications refusées. Autorisez-les dans les paramètres de Chrome puis réessayez.");
    }

    const config = await request(url, key, accessToken, "/functions/v1/report-push");
    if (typeof config?.publicKey !== "string" || !config.publicKey) {
        throw new Error("La clé publique des notifications n’est pas configurée sur Supabase.");
    }
    await navigator.serviceWorker.register(serviceWorkerUrl, { scope: serviceWorkerScope });
    const registration = await navigator.serviceWorker.ready;
    const encodedKey = config.publicKey.replace(/-/g, "+").replace(/_/g, "/");
    const applicationServerKey = Uint8Array.from(atob(encodedKey), character => character.charCodeAt(0));
    const subscription = await registration.pushManager.getSubscription()
        || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
    const { keys } = subscription.toJSON();
    if (!keys?.p256dh || !keys?.auth) throw new Error("Abonnement aux notifications incomplet.");

    const rows = await request(url, key, accessToken, "/rest/v1/admin_push_subscriptions?on_conflict=user_id,endpoint", {
        method: "POST",
        body: JSON.stringify([{ user_id: userId, endpoint: subscription.endpoint, p256dh: keys.p256dh, auth: keys.auth }])
    });
    if (!Array.isArray(rows) || rows.length !== 1) {
        throw new Error("Supabase n’a pas confirmé l’activation des notifications.");
    }
}

export async function disableReportNotifications({ url, key, accessToken, userId }) {
    const registration = await getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return;
    await request(url, key, accessToken, subscriptionPath(userId, subscription.endpoint), { method: "DELETE" });
    const unsubscribed = await subscription.unsubscribe();
    if (!unsubscribed) throw new Error("Le navigateur n’a pas confirmé la désactivation des notifications.");
}

export async function testReportNotification({ url, key, accessToken }) {
    return request(url, key, accessToken, "/functions/v1/report-push", {
        method: "POST",
        body: JSON.stringify({ type: "test" })
    });
}
