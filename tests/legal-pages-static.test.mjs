import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../ui/Style.css", import.meta.url), "utf8");
const pages = [
    ["mentions-legales", "Mentions légales"],
    ["confidentialite", "Confidentialité"]
];

test("legal links are in a shared footer after the app screens", () => {
    const footer = html.match(/<footer class="legal-footer">([\s\S]*?)<\/footer>/);
    assert.ok(footer);
    assert.ok(footer.index > html.indexOf('id="result-screen"'));
    assert.match(footer[1], /<nav id="legal-links" tabindex="-1" aria-label="Informations légales">/);
    for (const [id, title] of pages) {
        assert.ok(footer[1].includes(`<a href="#${id}">${title}</a>`));
    }
    assert.match(footer[1], /Confidentialité/);
});

test("French legal sections have static anchor targets and return links", () => {
    const sections = new Map(pages.map(([id, title]) => {
        const section = html.match(new RegExp(`<section id="${id}" class="legal-section" tabindex="-1" aria-labelledby="${id}-title">([\\s\\S]*?)<\\/section>`));
        assert.ok(section, `Missing static section: ${id}`);
        assert.ok(section[1].includes(`<h2 id="${id}-title">${title}</h2>`));
        assert.match(section[1], /<a href="#legal-links">Retour à l’application<\/a>/);
        return [id, section[1]];
    }));
    assert.doesNotMatch(sections.get("mentions-legales"), /Modèle à compléter par l’éditeur avant publication/);
    assert.match(sections.get("mentions-legales"), /Éditeur et responsable de publication : domino2801/);
    assert.match(sections.get("mentions-legales"), /domino2801@gmail\.com/);
    assert.match(sections.get("mentions-legales"), /GitHub Pages/);
    assert.match(sections.get("mentions-legales"), /Supabase ; le projet est configuré dans la région eu-west-1/);
    assert.match(sections.get("mentions-legales"), /Les contenus restent soumis aux droits de leurs auteurs/);
    assert.doesNotMatch(sections.get("confidentialite"), /Modèle à compléter par l’éditeur avant publication/);
    assert.match(sections.get("confidentialite"), /responsable du traitement est l’éditeur de QCM-MAJOR, domino2801/);
    assert.match(sections.get("confidentialite"), /domino2801@gmail\.com/);
    assert.match(sections.get("confidentialite"), /Mise à jour : 17 octobre 2026/);
    assert.match(sections.get("confidentialite"), /Le code de l’application ne prévoit pas de purge automatique après un an/);
    assert.match(sections.get("confidentialite"), /Les notifications push sont facultatives/);
    assert.match(sections.get("confidentialite"), /la correction est effectuée par Supabase/);
    assert.doesNotMatch(sections.get("confidentialite"), /Durée de conservation : 1 an/);
    assert.match(html, /classement public/);
    assert.match(html, /localStorage et sessionStorage/);
    assert.match(html, /Vos droits/);
    assert.doesNotMatch(sections.get("mentions-legales"), /libres de droits d’auteur/);
});

test("legal navigation works through CSS anchors without app routing", () => {
    assert.match(css, /\.legal-section\s*\{[^}]*display:\s*none;/);
    assert.match(css, /\.legal-section:target\s*\{\s*display:\s*block;/);
    assert.match(css, /\.legal-footer nav\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/);
    assert.match(css, /\.legal-footer a:focus-visible,\s*\.legal-section a:focus-visible\s*\{[^}]*outline:/);
});
