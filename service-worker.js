self.addEventListener("install", event => {
    event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", event => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener("push", event => {
    let pendingCount;
    try {
        pendingCount = event.data?.json()?.pendingCount;
    } catch {
        pendingCount = null;
    }
    const badgeUpdate = typeof self.registration.setAppBadge === "function"
        ? Number.isSafeInteger(pendingCount)
            ? pendingCount > 0
                ? self.registration.setAppBadge(pendingCount)
                : self.registration.clearAppBadge?.()
            : self.registration.setAppBadge()
        : Promise.resolve();
    event.waitUntil(Promise.all([
        self.registration.showNotification("QCM-MAJOR — Signalements", {
            body: "Un signalement nécessite votre attention. Ouvrez l’administration.",
            icon: new URL("public/icons/icon-192.png", self.registration.scope).href,
            badge: new URL("public/icons/push-badge.png", self.registration.scope).href,
            tag: "qcm-question-reports",
            renotify: true,
            data: { url: self.registration.scope }
        }),
        badgeUpdate?.catch(error => console.warn("Mise à jour du badge de l’application impossible.", error))
    ]));
});

self.addEventListener("notificationclick", event => {
    event.notification.close();
    event.waitUntil((async () => {
        const appUrl = new URL(self.registration.scope);
        appUrl.searchParams.set("admin-section", "question-reports");
        const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        const appClient = clients.find(client => {
            const url = new URL(client.url);
            return url.origin === appUrl.origin && url.pathname.startsWith(appUrl.pathname);
        });
        if (appClient) {
            appClient.postMessage({ type: "open-question-reports" });
            return appClient.focus();
        }
        return self.clients.openWindow(appUrl.href);
    })());
});
