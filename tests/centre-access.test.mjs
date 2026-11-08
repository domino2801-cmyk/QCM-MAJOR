import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../ui/Style.css", import.meta.url), "utf8");

function listener(id) {
    const marker = `document.getElementById("${id}")?.addEventListener("click", () => {`;
    const start = app.indexOf(marker);
    assert.notEqual(start, -1);
    const end = app.indexOf("\n    });", start);
    assert.notEqual(end, -1);
    return app.slice(start, end + "\n    });".length);
}

test("le centre propose les espaces Armoire, QCM et forum, avec une déconnexion", () => {
    assert.match(html, /id="centre-screen" class="screen centre-screen"/);
    assert.match(html, /id="centre-doctrine-link"[^>]*href="https:\/\/domino2801-cmyk\.github\.io\/DOCTRINE\/index\.html"/);
    assert.match(html, /id="centre-doctrine-link"[\s\S]*?armoire-logo\.png[\s\S]*?Armoire numérique de campagne/);
    assert.match(html, /id="centre-quiz-btn"[\s\S]*?logo2\.png[\s\S]*?Question pour un Major/);
    assert.match(html, /id="centre-forum-link"[^>]*href="https:\/\/tchap\.gouv\.fr\/#\/room\/#Bm4QCArLJuiyp:agent\.intradef\.tchap\.gouv\.fr"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/);
    assert.match(html, /id="centre-forum-link"[\s\S]*?tchap-logo\.png[\s\S]*?FORUM[\s\S]*?Un forum d'échange pour les candidats BM4/);
    assert.match(html, /id="centre-forum-link"[\s\S]*?ADC "Nom" du "Régiment" spécialité "XXX"/);
    assert.match(html, /id="centre-logout-btn"/);
    assert.match(app, /getElementById\("centre-logout-btn"\)\.addEventListener\("click", logoutCandidate\)/);
    assert.match(app, /link: document\.getElementById\("centre-doctrine-link"\),\s*status: document\.getElementById\("centre-doctrine-status"\)/);
    assert.match(css, /\.centre-access-grid\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
    assert.match(css, /\.centre-access-card\s*\{[^}]*justify-content:\s*flex-start/);
    assert.match(css, /@media \(max-width: 700px\)\s*\{\s*\.centre-access-grid\s*\{\s*grid-template-columns: 1fr/);
});

test("le choix QCM ouvre les zones et permet de revenir au centre", () => {
    const handlers = new Map();
    const transitions = [];
    const focused = [];
    const context = {
        document: {
            getElementById(id) {
                return {
                    addEventListener(_type, handler) { handlers.set(id, handler); },
                    focus() { focused.push(id); }
                };
            }
        },
        uiController: { switchScreen: id => transitions.push(id) }
    };
    vm.runInNewContext(`${listener("centre-quiz-btn")}\n${listener("btn-centre-theme")}`, context);
    handlers.get("centre-quiz-btn")();
    handlers.get("btn-centre-theme")();
    assert.deepEqual(transitions, ["theme-screen", "centre-screen"]);
    assert.deepEqual(focused, ["theme-welcome-message", "centre-title"]);
});
