import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(testDirectory, "..");
const html = readFileSync(`${root}/index.html`, "utf8");
const css = readFileSync(`${root}/ui/Style.css`, "utf8");

test("theme screen keeps the logout button, header and account summary order", () => {
    assert.match(
        html,
        /<div id="theme-screen" class="screen">\s*<div class="account-bar"><button id="logout-btn" type="button">Déconnexion<\/button><\/div>\s*<div class="brand-lockup"><img src="public\/images\/logo2\.png" width="100" alt=""><h1>Question pour un Major<\/h1><\/div>\s*<p class="subtitle">Préparation au combat du BM4<\/p>\s*<p id="account-summary" class="account-summary-under">\s*<\/p>/
    );
});

test("theme screen styles center the logout button without offsetting it", () => {
    assert.match(css, /#theme-screen \.account-bar\s*\{\s*justify-content:\s*center;\s*\}/);
    assert.match(
        css,
        /#theme-screen \.account-bar #logout-btn\s*\{[\s\S]*margin:\s*0;\s*[\s\S]*transform:\s*none;\s*\}/
    );
});
