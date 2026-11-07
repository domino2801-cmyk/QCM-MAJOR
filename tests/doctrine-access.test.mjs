import test from "node:test";
import assert from "node:assert/strict";
import { setupDoctrineAccess } from "../modules/doctrine-access/index.js";

function fixture(getSession) {
    const listeners = {};
    const messages = [];
    const child = { postMessage: (data, origin) => messages.push({ data, origin }) };
    const link = { addEventListener: (_type, callback) => { listeners.click = callback; } };
    const status = { textContent: "" };
    const previousWindow = globalThis.window;
    globalThis.window = {
        open: (url, target) => {
            assert.equal(url, "https://domino2801-cmyk.github.io/DOCTRINE/index.html?from=qcm-major");
            assert.equal(target, "_blank");
            return child;
        },
        addEventListener: (_type, callback) => { listeners.message = callback; }
    };
    setupDoctrineAccess({ link, status, getSession });
    return { listeners, child, status, messages, restore: () => { globalThis.window = previousWindow; } };
}

test("seul l'onglet ouvert à la bonne origine reçoit le jeton d'accès", async () => {
    const f = fixture(async () => ({
        access_token: "access", refresh_token: "secret", expires_at: 12345
    }));
    try {
        let prevented = false;
        f.listeners.click({ button: 0, preventDefault: () => { prevented = true; } });
        assert.equal(prevented, true);
        const request = { type: "doctrine-session-request", id: "1" };
        await f.listeners.message({ origin: "https://evil.example", source: f.child, data: request });
        await f.listeners.message({ origin: "https://domino2801-cmyk.github.io", source: {}, data: request });
        assert.equal(f.messages.length, 0);
        await f.listeners.message({ origin: "https://domino2801-cmyk.github.io", source: f.child, data: request });
        assert.deepEqual(f.messages, [{
            origin: "https://domino2801-cmyk.github.io",
            data: { type: "doctrine-session-response", id: "1", access_token: "access", expires_at: 12345 }
        }]);
    } finally { f.restore(); }
});

test("une session absente ne transmet aucun jeton", async () => {
    const f = fixture(async () => null);
    try {
        f.listeners.click({ button: 0, preventDefault() {} });
        await f.listeners.message({
            origin: "https://domino2801-cmyk.github.io", source: f.child,
            data: { type: "doctrine-session-request", id: "2" }
        });

        assert.equal(f.messages[0].data.access_token, null);
        assert.equal(f.messages[0].data.expires_at, null);
    } finally { f.restore(); }
});

test("un bloqueur de fenêtres affiche une indication", () => {
    const f = fixture(async () => null);
    try {
        globalThis.window.open = () => null;
        f.listeners.click({ button: 0, preventDefault() {} });
        assert.match(f.status.textContent, /Autorisez l’ouverture/);
    } finally { f.restore(); }
});
