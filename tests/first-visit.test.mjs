import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { initializeFirstVisitPrompt } from "../modules/first-visit/index.js";

function fixture() {
    const doc = { activeElement: null };
    function element(classes = []) {
        const values = new Set(classes);
        const listeners = {};
        return {
            classList: {
                add: name => values.add(name),
                remove: name => values.delete(name),
                contains: name => values.has(name)
            },
            addEventListener: (name, callback) => { listeners[name] = callback; },
            dispatch: (name, event = {}) => listeners[name](event),
            focus() { doc.activeElement = this; }
        };
    }
    const elements = {
        "first-visit-overlay": element(["hidden"]),
        "first-visit-no-btn": element(),
        "first-visit-yes-btn": element(),
        "auth-screen": element(["active"]),
        "login-view": element(),
        "login-message": { innerText: "" },
        "login-email": element(),
        "register-pseudo": element()
    };
    const container = { inert: false };
    doc.getElementById = id => elements[id];
    doc.querySelector = () => container;
    let view;
    const show = initializeFirstVisitPrompt({ document: doc, showAuthView: value => { view = value; } });
    return { doc, elements, container, show, getView: () => view };
}

for (const [button, view, field] of [
    ["first-visit-no-btn", "login", "login-email"],
    ["first-visit-yes-btn", "register", "register-pseudo"]
]) {
    test(`${button} opens ${view} and restores interaction`, () => {
        const { doc, elements, container, show, getView } = fixture();
        show();
        assert.equal(elements["first-visit-overlay"].classList.contains("hidden"), false);
        assert.equal(container.inert, true);
        assert.equal(doc.activeElement, elements["first-visit-no-btn"]);
        elements[button].dispatch("click");
        assert.equal(getView(), view);
        assert.equal(container.inert, false);
        assert.equal(elements["first-visit-overlay"].classList.contains("hidden"), true);
        assert.equal(doc.activeElement, elements[field]);
    });
}

test("the prompt keeps keyboard focus inside its two choices", () => {
    const { doc, elements, show } = fixture();
    show();
    let prevented = false;
    elements["first-visit-overlay"].dispatch("keydown", {
        key: "Tab", shiftKey: true, preventDefault() { prevented = true; }
    });
    assert.equal(prevented, true);
    assert.equal(doc.activeElement, elements["first-visit-yes-btn"]);
    prevented = false;
    elements["first-visit-overlay"].dispatch("keydown", {
        key: "Tab", shiftKey: false, preventDefault() { prevented = true; }
    });
    assert.equal(prevented, true);
    assert.equal(doc.activeElement, elements["first-visit-no-btn"]);
});

test("the prompt does not interrupt another screen, auth view or login error", () => {
    for (const change of [
        elements => elements["auth-screen"].classList.remove("active"),
        elements => elements["login-view"].classList.add("hidden"),
        elements => { elements["login-message"].innerText = "Erreur"; }
    ]) {
        const { elements, container, show } = fixture();
        change(elements);
        show();
        assert.equal(elements["first-visit-overlay"].classList.contains("hidden"), true);
        assert.equal(container.inert, false);
    }
});

test("startup shows the prompt only after session restoration and outside recovery", () => {
    const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
    const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
    assert.match(app, /await restoreSupabaseSession\(\);[\s\S]*?hideStartupLoading\(\);\s*if \(!isRecoveryModeFromUrl\(\)\) showFirstVisitPrompt\(\);/);
    assert.match(html, /id="first-visit-overlay"[^>]*role="dialog"[^>]*aria-modal="true"/);
    assert.match(html, /class="first-visit-eyebrow">Bienvenue au Centre d'entrainement tactique du BM4<\/span>\s*<h2 id="first-visit-title">Est-ce votre première visite \?<\/h2>/);
    assert.doesNotMatch(html, /Choisissez votre accès pour rejoindre le centre d’entraînement/);
    assert.match(html, /id="first-visit-no-btn"[^>]*><span>NON<\/span><small>Rallier votre unité<\/small>/);
    assert.match(html, /id="first-visit-yes-btn"[^>]*><span>OUI<\/span><small>S’engager<\/small>/);
});
