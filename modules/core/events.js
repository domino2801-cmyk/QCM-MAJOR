// =========================================================
// EVENTS — BUS D’ÉVÉNEMENTS TACTIQUES
// =========================================================
//
// Rôle : permettre aux modules de communiquer entre eux
// sans dépendances directes.
//
// Exemple d’utilisation :
//   events.on("mission.started", () => {...});
//   events.emit("mission.completed", { score: 18.5 });
//
// =========================================================

export const events = {

    // Stockage des abonnés
    listeners: {},

    // -----------------------------------------------------
    // Abonnement à un événement
    // -----------------------------------------------------
    on(eventName, callback) {
        if (!this.listeners[eventName]) {
            this.listeners[eventName] = [];
        }
        this.listeners[eventName].push(callback);
    },

    // -----------------------------------------------------
    // Désabonnement
    // -----------------------------------------------------
    off(eventName, callback) {
        if (!this.listeners[eventName]) return;

        this.listeners[eventName] = this.listeners[eventName].filter(
            fn => fn !== callback
        );
    },

    // -----------------------------------------------------
    // Émission d’un événement
    // -----------------------------------------------------
    emit(eventName, payload = {}) {
        if (!this.listeners[eventName]) return;

        this.listeners[eventName].forEach(callback => {
            try {
                callback(payload);
            } catch (err) {
                console.error(`Erreur dans l'événement ${eventName}:`, err);
            }
        });
    },

    // -----------------------------------------------------
    // Nettoyage complet (reset)
    // -----------------------------------------------------
    clear() {
        this.listeners = {};
    }
};
