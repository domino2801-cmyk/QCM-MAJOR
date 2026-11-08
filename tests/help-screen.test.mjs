import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(path.join(root, "index.html"), "utf8");
const css = readFileSync(path.join(root, "ui", "Style.css"), "utf8");

const appJs = readFileSync(path.join(root, "app.js"), "utf8");

test("la page Aide et son accès sont supprimés sans retirer les accès du centre", () => {
    assert.doesNotMatch(html, /btn-help-theme|help-screen|help-doctrine-link|btn-back-from-help/);
    assert.doesNotMatch(appJs, /btn-help-theme|help-screen|help-doctrine-link|btn-back-from-help/);
    assert.doesNotMatch(css, /#help-screen|\.help-screen|help-branded-link/);
    assert.match(html, /id="centre-doctrine-link"/);
    assert.match(appJs, /link: document\.getElementById\("centre-doctrine-link"\)/);
    assert.match(html, /id="retex-screen" class="screen"/);
});
