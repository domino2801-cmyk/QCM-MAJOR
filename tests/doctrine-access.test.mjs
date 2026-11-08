import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { setupDoctrineAccess } from "../modules/doctrine-access/index.js";

function fixture(getSession) {
    const listeners = {};
    const messages = [];
    const child = { postMessage: (data, origin) => messages.push({ data, origin }) };
    const link = { addEventListener: (_type, callback) => { listeners.click = callback; } };
    const status = { textContent: "" };
    const returns = [];
    const previousWindow = globalThis.window;
    globalThis.window = {
        open: (url, target) => {
            assert.equal(url, "https://domino2801-cmyk.github.io/DOCTRINE/index.html?from=qcm-major");
            assert.equal(target, "_blank");
            return child;
        },
        addEventListener: (_type, callback) => { listeners.message = callback; }
    };
    setupDoctrineAccess({ link, status, getSession, returnToConsole: id => { returns.push(id); return true; } });
    return { listeners, child, status, messages, returns, restore: () => { globalThis.window = previousWindow; } };
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

test("l'administration utilise le même relais sécurisé que le centre", async () => {
    const source = await readFile(new URL("../app.js", import.meta.url), "utf8");
    const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
    assert.match(source, /setupDoctrineAccess\(\{\s*\.\.\.doctrineAccess,\s*link: document\.getElementById\("admin-doctrine-btn"\),\s*status: document\.getElementById\("admin-doctrine-status"\)/);
    assert.match(html, /id="admin-doctrine-status"[^>]*role="status"/);
    const f = fixture(async () => ({
        access_token: "admin-access", refresh_token: "secret", expires_at: 12345
    }));
    try {
        f.listeners.click({ button: 0, preventDefault() {} });
        await f.listeners.message({
            origin: "https://domino2801-cmyk.github.io", source: f.child,
            data: { type: "doctrine-session-request", id: "admin" }
        });
        assert.equal(f.messages[0].data.access_token, "admin-access");
        assert.equal("refresh_token" in f.messages[0].data, false);
    } finally { f.restore(); }
});

test("le retour vers la console exige l'onglet autorisé et la même session", async () => {
    let session = { access_token: "access", user: { id: "candidate" } };
    const f = fixture(async () => session);
    try {
        f.listeners.click({ button: 0, preventDefault() {} });
        const data = { type: "doctrine-return-to-qcm", id: "3", user_id: "candidate" };
        await f.listeners.message({ origin: "https://evil.example", source: f.child, data });
        await f.listeners.message({ origin: "https://domino2801-cmyk.github.io", source: {}, data });
        await f.listeners.message({ origin: "https://domino2801-cmyk.github.io", source: f.child, data: { ...data, user_id: "autre" } });
        assert.deepEqual(f.returns, []);
        assert.match(f.status.textContent, /ne correspond plus/);
        await f.listeners.message({ origin: "https://domino2801-cmyk.github.io", source: f.child, data });
        assert.deepEqual(f.returns, ["candidate"]);
        assert.equal(f.messages.at(-1).data.ok, true);
        session = null;
        await f.listeners.message({ origin: "https://domino2801-cmyk.github.io", source: f.child, data });
        assert.deepEqual(f.returns, ["candidate"]);
    } finally { f.restore(); }
});

test("le retour affiche la console sans interrompre une partie ni changer de compte", async () => {
    const source = await readFile(new URL("../app.js", import.meta.url), "utf8");
    const start = source.indexOf("function returnToDoctrineConsole(");
    const end = source.indexOf("async function initializeAppInteractions()", start);
    assert.ok(start >= 0 && end > start);
    let active = "";
    const screens = [];
    const context = vm.createContext({
        currentAuthenticatedAccount: { id: "candidate" }, currentCandidateEmail: "candidate@example.test",
        document: { getElementById: id => ({ classList: { contains: () => id === active } }) },
        uiController: { switchScreen: id => screens.push(id) }
    });
    vm.runInContext(source.slice(start, end), context);
    context.returnToDoctrineConsole("autre");
    active = "quiz-screen";
    context.returnToDoctrineConsole("candidate");
    active = "report-screen";
    context.returnToDoctrineConsole("candidate");
    assert.deepEqual(screens, []);
    active = "";
    context.returnToDoctrineConsole("candidate");
    assert.deepEqual(screens, ["theme-screen"]);
});
