import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const indexHtml = readFileSync(path.join(root, "index.html"), "utf8");
const legalHtml = readFileSync(path.join(root, "legal.html"), "utf8");

test("the application links to its legal information", () => {
    assert.match(indexHtml, /href="legal\.html">Mentions légales et politique de confidentialité/);
});

test("legal information includes the confirmed publisher, host, audience, and contact", () => {
    assert.match(legalHtml, /personne physique sous le pseudonyme <strong>domino2801<\/strong>/);
    assert.match(legalHtml, /mailto:domino2801@gmail\.com/);
    assert.match(legalHtml, /GitHub Pages/);
    assert.match(legalHtml, /personnes majeures/);
});

test("the privacy policy discloses Supabase and the one-year retention limit", () => {
    assert.match(legalHtml, /Supabase pour l’authentification et le stockage/);
    assert.match(legalHtml, /d’un an au maximum/);
    assert.match(legalHtml, /purge automatique côté Supabase doit être configurée/);
});
