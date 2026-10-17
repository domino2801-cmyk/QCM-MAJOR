import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(path.join(root, "index.html"), "utf8");
const appJs = readFileSync(path.join(root, "app.js"), "utf8");
const css = readFileSync(path.join(root, "ui", "Style.css"), "utf8");

function extractListener(buttonId) {
    const marker = `document.getElementById("${buttonId}")?.addEventListener("click", () => {`;
    const start = appJs.indexOf(marker);
    assert.notEqual(start, -1, `Unable to find ${buttonId} listener`);
    const bodyStart = start + marker.length;
    let depth = 1;
    let end = bodyStart;

    while (end < appJs.length && depth > 0) {
        if (appJs[end] === "{") depth += 1;
        if (appJs[end] === "}") depth -= 1;
        end += 1;
    }

    return `${appJs.slice(start, end)});`;
}

test("la page Aide présente le barème, les modes et le journal avec son logo", () => {
    assert.match(html, /id="btn-help-theme"[^>]*>Aide<\/button>/);
    assert.match(html, /id="help-screen" class="screen help-screen"/);
    assert.match(html, /id="help-title"[^>]*>Aide<\/h1>/);
    assert.match(html, /class="help-eyebrow">GUIDE DE MISSION<\/p>\s*<img src="public\/images\/renseignements\.png"/);
    assert.match(html, /Bonne réponse<\/strong><span>\+4 points<\/span>/);
    assert.match(html, /Mauvaise réponse<\/strong><span>−1 point<\/span>/);
    assert.match(html, /Question passée<\/strong><span>0 point<\/span>/);
    assert.match(html, /points nets ÷ \(4 × questions\) × 20/);
    assert.match(html, /Simulation de combat/);
    assert.match(html, /Combat de haute intensité/);
    assert.match(html, /six zones géographiques/);
    assert.match(html, /src="public\/images\/renseignements\.png"[^>]*alt="Insigne Renseignements"/);

    const logoPath = path.join(root, "public", "images", "renseignements.png");
    assert.equal(existsSync(logoPath), true);
    assert.deepEqual(Array.from(readFileSync(logoPath).subarray(0, 8)), [
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a
    ]);
});

test("les commandes Aide et retour naviguent entre briefing et aide avec le focus", () => {
    const transitions = [];
    const focused = [];
    const listeners = new Map();
    const context = {
        uiController: {
            switchScreen(screen) {
                transitions.push(screen);
            }
        },
        document: {
            getElementById(id) {
                return {
                    addEventListener(_event, handler) {
                        listeners.set(id, handler);
                    },
                    focus() {
                        focused.push(id);
                    }
                };
            }
        }
    };

    vm.runInNewContext(
        `${extractListener("btn-help-theme")}\n${extractListener("btn-back-from-help")}`,
        context
    );

    listeners.get("btn-help-theme")();
    listeners.get("btn-back-from-help")();
    assert.deepEqual(transitions, ["help-screen", "theme-screen"]);
    assert.deepEqual(focused, ["help-title", "btn-help-theme"]);
});

test("l’écran d’aide et son accès restent adaptés aux petits écrans", () => {
    assert.match(css, /body:has\(#help-screen\.active\) \.close-app/);
    assert.match(css, /\.help-screen\s*\{[^}]*max-width:\s*760px/s);
    assert.match(css, /\.help-branding\s*\{[^}]*flex-direction:\s*column/s);
    assert.match(css, /\.help-logo\s*\{[^}]*object-fit:\s*contain/s);
    assert.match(css, /\.theme-bottom-actions #btn-help-theme\s*\{[^}]*grid-column:\s*1 \/ -1/s);
    assert.match(css, /\.help-panel\s*\{[^}]*padding:\s*16px 12px/s);
});
