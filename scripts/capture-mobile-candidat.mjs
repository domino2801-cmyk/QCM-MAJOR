import { createReadStream, statSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = path.join(ROOT, "screenshots_mobile_candidat");
const VIEWPORT = { width: 375, height: 812 };
const SETTLE_MS = 450;
const SUPABASE_HOST = "beodiemzrunqjkvylffn.supabase.co";
const MIME_TYPES = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".ico": "image/x-icon",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".mp3": "audio/mpeg",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".ttf": "font/ttf",
    ".webmanifest": "application/manifest+json"
};

function startStaticServer() {
    const server = createServer((request, response) => {
        let pathname;
        try {
            pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
        } catch {
            response.writeHead(400).end("Bad request");
            return;
        }

        const filePath = path.resolve(ROOT, `.${pathname}`);
        if (filePath !== ROOT && !filePath.startsWith(`${ROOT}${path.sep}`)) {
            response.writeHead(403).end("Forbidden");
            return;
        }

        try {
            if (!statSync(filePath).isFile()) {
                response.writeHead(404).end("Not found");
                return;
            }
        } catch {
            response.writeHead(404).end("Not found");
            return;
        }

        response.writeHead(200, {
            "Content-Type": MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream",
            "Cache-Control": "no-store"
        });
        if (request.method === "HEAD") response.end();
        else createReadStream(filePath).pipe(response);
    });

    return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => {
            const address = server.address();
            if (!address || typeof address === "string") {
                reject(new Error("Impossible de démarrer le serveur local."));
                return;
            }
            resolve({
                server,
                url: `http://127.0.0.1:${address.port}/index.html`
            });
        });
    });
}

async function pause(page) {
    await page.waitForTimeout(SETTLE_MS);
}

async function clickAndWait(page, selector) {
    await page.locator(selector).click();
    await pause(page);
}

async function fillAndWait(page, selector, value) {
    await page.locator(selector).fill(value);
    await pause(page);
}

async function checkAndWait(page, selector) {
    await page.locator(selector).check();
    await pause(page);
}

async function selectScreen(page, screenId) {
    await page.evaluate(id => {
        document.querySelectorAll(".screen").forEach(screen => screen.classList.remove("active"));
        document.getElementById(id)?.classList.add("active");
        const overlay = document.getElementById("first-visit-overlay");
        overlay?.classList.add("hidden");
        const container = document.querySelector(".container");
        if (container) container.inert = false;
    }, screenId);
    await pause(page);
}

async function selectAuthView(page, viewId) {
    await selectScreen(page, "auth-screen");
    await page.evaluate(id => {
        document.querySelectorAll("#auth-screen .auth-view").forEach(view => view.classList.add("hidden"));
        document.getElementById(id)?.classList.remove("hidden");
    }, viewId);
    await pause(page);
}

async function prepareQuestion(page, state = "pending") {
    await selectScreen(page, "quiz-screen");
    await page.evaluate(answerState => {
        document.getElementById("progress").textContent = "Question 1 / 10";
        document.getElementById("live-points").textContent = "Points : 7";
        document.getElementById("question").textContent =
            "Parmi ces qualités, laquelle ne relève pas du principe de confiance ?";
        document.getElementById("quiz-timer").hidden = true;
        document.getElementById("quiz-answer-status").textContent = "";
        const options = document.getElementById("options-grid");
        options.replaceChildren();
        [
            "La disponibilité",
            "La loyauté",
            "L'enthousiasme",
            "L'humilité"
        ].forEach((label, index) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "btn";
            button.textContent = label;
            if (answerState === "correct" && index === 1) button.classList.add("correct");
            if (answerState === "incorrect" && index === 2) button.classList.add("incorrect");
            if (answerState === "incorrect" && index === 1) button.classList.add("correct");
            button.disabled = answerState !== "pending";
            options.append(button);
        });
        const next = document.getElementById("next-question-btn");
        next.disabled = answerState === "pending";
        next.textContent = "Question suivante";
        document.getElementById("skip-btn").disabled = answerState !== "pending";
    }, state);
    await pause(page);
}

async function fillHistory(page) {
    await selectScreen(page, "history-screen");
    await page.evaluate(() => {
        document.getElementById("candidate-history-summary").textContent =
            "4 résultat(s) • Moyenne : 13.13 / 20";
        document.getElementById("candidate-history-recommendation").textContent =
            "Thème à travailler : Organisation et Commandement";
        document.getElementById("candidate-history-status").textContent = "";
        const charts = document.getElementById("candidate-history-charts");
        charts.replaceChildren();
        const section = document.createElement("section");
        section.className = "candidate-history-chart-section";
        const title = document.createElement("h3");
        title.textContent = "Combat haute intensité";
        const chart = document.createElement("div");
        chart.className = "global-evolution-chart";
        chart.setAttribute("role", "img");
        chart.setAttribute("aria-label", "Historique de démonstration");
        [12, 15, 13.2, 12.3].forEach(score => {
            const bar = document.createElement("div");
            bar.className = `global-evolution-bar ${score > 10 ? "score-good" : "score-warning"}`;
            bar.style.height = `${score * 5}%`;
            bar.setAttribute("aria-label", `${score.toFixed(2)} / 20`);
            const value = document.createElement("span");
            value.textContent = score.toFixed(2);
            bar.append(value);
            chart.append(bar);
        });
        section.append(title, chart);
        charts.append(section);
    });
    await pause(page);
}

async function capture(browser, name, stage) {
    const context = await browser.newContext({
        viewport: VIEWPORT,
        deviceScaleFactor: 1,
        isMobile: true,
        hasTouch: true,
        reducedMotion: "reduce"
    });
    const page = await context.newPage();
    await page.setViewportSize(VIEWPORT);
    await page.route(url => new URL(url).hostname === SUPABASE_HOST, async route => {
        const request = route.request();
        const url = new URL(request.url());
        const headers = {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "*",
            "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
            "Content-Type": "application/json; charset=utf-8"
        };
        if (request.method() === "OPTIONS") {
            await route.fulfill({ status: 204, headers });
            return;
        }
        if (url.pathname === "/auth/v1/token" && url.searchParams.get("grant_type") === "password") {
            await route.fulfill({
                status: 400,
                headers,
                body: JSON.stringify({ msg: "Invalid login credentials", error: "invalid_grant" })
            });
            return;
        }
        await route.fulfill({
            status: 200,
            headers,
            body: url.pathname.startsWith("/rest/v1/") ? "[]" : "{}"
        });
    });

    try {
        await page.goto(localUrl, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(
            () => document.getElementById("startup-loading")?.classList.contains("startup-loading-hidden"),
            null,
            { timeout: 20_000 }
        );
        await pause(page);
        await stage(page);
        await pause(page);
        await page.screenshot({
            path: path.join(OUTPUT, name),
            fullPage: false,
            animations: "disabled"
        });
        console.log(`Capture générée : ${name}`);
    } finally {
        await context.close();
    }
}

let localUrl;

async function main() {
    await mkdir(OUTPUT, { recursive: true });
    const { server, url } = await startStaticServer();
    localUrl = url;
    let browser;
    try {
        browser = await chromium.launch({ headless: true });

        await capture(browser, "01_premiere_visite.png", async page => {
            await selectScreen(page, "auth-screen");
            await page.evaluate(() => {
                const overlay = document.getElementById("first-visit-overlay");
                overlay.classList.remove("hidden");
                document.querySelector(".container").inert = true;
            });
        });

        await capture(browser, "02_connexion_vide.png", async page => {
            await selectAuthView(page, "login-view");
            await page.locator("#login-form").evaluate(form => form.reset());
        });

        await capture(browser, "03_connexion_champs_manquants.png", async page => {
            await selectAuthView(page, "login-view");
            await clickAndWait(page, "#login-form button[type=submit]");
        });

        await capture(browser, "04_erreur_identifiants.png", async page => {
            await selectAuthView(page, "login-view");
            await fillAndWait(page, "#login-email", "demo@example.test");
            await fillAndWait(page, "#login-password", "code-demo");
            await clickAndWait(page, "#login-form button[type=submit]");
            await page.locator("#login-message").getByText("incorrect").waitFor();
        });

        await capture(browser, "05_creation_compte.png", async page => {
            await selectAuthView(page, "register-view");
        });

        await capture(browser, "06_recuperation_mot_de_passe.png", async page => {
            await selectAuthView(page, "login-view");
            await clickAndWait(page, "#login-forgot-password-btn");
            await fillAndWait(page, "#reset-email", "demo@example.test");
        });

        await capture(browser, "07_recuperation_confirmee.png", async page => {
            await selectAuthView(page, "reset-view");
            await fillAndWait(page, "#reset-email", "demo@example.test");
            await clickAndWait(page, "#reset-request-form button[type=submit]");
            await page.locator("#success-view").waitFor({ state: "visible" });
        });

        await capture(browser, "08_choix_des_espaces.png", async page => {
            await selectScreen(page, "centre-screen");
        });

        await capture(browser, "09_briefing_candidat.png", async page => {
            await selectScreen(page, "theme-screen");
            await page.locator("#account-summary").evaluate(node => {
                node.textContent = "Candidat Démo • RHL — Restauration, hôtellerie et loisirs";
            });
            await page.locator("#connection-status").evaluate(node => node.textContent = "");
        });

        await capture(browser, "10_briefing_combat_haute_intensite.png", async page => {
            await selectScreen(page, "theme-screen");
            await page.locator("#account-summary").evaluate(node => {
                node.textContent = "Candidat Démo • RHL — Restauration, hôtellerie et loisirs";
            });
            await page.locator("#theme-global-btn").evaluate(button => {
                button.classList.add("active");
                button.setAttribute("aria-pressed", "true");
            });
            await page.locator("#start-btn").evaluate(button => { button.disabled = false; });
        });

        await capture(browser, "11_question_en_cours.png", page => prepareQuestion(page));
        await capture(browser, "12_reponse_correcte.png", page => prepareQuestion(page, "correct"));
        await capture(browser, "13_reponse_incorrecte.png", page => prepareQuestion(page, "incorrect"));

        await capture(browser, "14_formulaire_signalement.png", async page => {
            await selectScreen(page, "report-screen");
            await page.locator("#question-report-theme").evaluate(node => node.textContent = "Organisation et Commandement");
            await page.locator("#question-report-position").evaluate(node => node.textContent = "Question 1 / 10");
            await page.locator("#question-report-question").evaluate(node => {
                node.textContent = "Parmi ces qualités, laquelle ne relève pas du principe de confiance ?";
            });
            await fillAndWait(page, "#question-report-details", "La réponse attendue semble à vérifier.");
        });

        await capture(browser, "15_erreur_signalement.png", async page => {
            await selectScreen(page, "report-screen");
            await page.locator("#question-report-status").evaluate(node => {
                node.textContent = "Transmission impossible : serveur temporairement indisponible.";
            });
            await fillAndWait(page, "#question-report-details", "La réponse attendue semble à vérifier.");
        });

        await capture(browser, "16_signalement_transmis.png", async page => {
            await selectScreen(page, "report-screen");
            await page.locator("#question-report-theme").evaluate(node => node.textContent = "Organisation et Commandement");
            await page.locator("#question-report-position").evaluate(node => node.textContent = "Question 1 / 10");
            await page.locator("#question-report-question").evaluate(node => {
                node.textContent = "Parmi ces qualités, laquelle ne relève pas du principe de confiance ?";
            });
            await page.locator("#question-report-details").evaluate(node => {
                node.value = "La réponse attendue semble à vérifier.";
                node.disabled = true;
            });
            await page.locator("#question-report-status").evaluate(node => {
                node.textContent = "Compte-rendu transmis à l’administration.";
            });
            await page.locator("#question-report-submit").evaluate(button => {
                button.disabled = true;
                button.textContent = "Signalement transmis";
            });
        });

        await capture(browser, "17_bilan_de_campagne.png", async page => {
            await selectScreen(page, "result-screen");
            await page.locator("#score-display").evaluate(node => node.textContent = "15.00 / 20");
            await page.locator("#stat-correct").evaluate(node => node.textContent = "8");
            await page.locator("#stat-wrong").evaluate(node => node.textContent = "2");
            await page.locator("#stat-skipped").evaluate(node => node.textContent = "0");
            await page.locator("#result-motivation").evaluate(node => {
                node.querySelector(".result-motivation-title").textContent = "Engagement solide";
                node.querySelector(".result-motivation-description").textContent = "Tu as de bonnes bases et progresses régulièrement.";
                node.querySelector(".result-motivation-emphasis").textContent = "Bilan satisfaisant.";
            });
        });

        await capture(browser, "18_revue_tactique.png", async page => {
            await selectScreen(page, "result-screen");
            await page.locator("#score-display").evaluate(node => node.textContent = "15.00 / 20");
            await page.locator("#review-section").evaluate(node => node.classList.remove("hidden"));
            await page.locator("#review-list").evaluate(node => {
                node.textContent = "Question : Parmi ces qualités, laquelle ne relève pas du principe de confiance ? Réponse choisie : l’enthousiasme. Bonne réponse : la disponibilité.";
            });
            await page.locator(".review-accordion").evaluate(node => node.open = true);
        });

        await capture(browser, "19_historique_vide.png", async page => {
            await selectScreen(page, "history-screen");
            await page.locator("#candidate-history-summary").evaluate(node => {
                node.textContent = "Aucun résultat Combat haute intensité sur cette période.";
            });
            await page.locator("#candidate-history-recommendation").evaluate(node => {
                node.textContent = "Thème à travailler : Aucun résultat par thème disponible.";
            });
        });

        await capture(browser, "20_historique_avec_resultats.png", fillHistory);

        await capture(browser, "21_formulaire_retex.png", async page => {
            await selectScreen(page, "retex-screen");
            await page.locator("#retex-pseudo").evaluate(node => node.textContent = "Candidat Démo");
            await page.locator("#retex-specialty").evaluate(node => node.textContent = "RHL - Restauration, hôtellerie et loisirs");
            await checkAndWait(page, 'input[name="retex-themes"][value^="1."]');
            await checkAndWait(page, 'input[name="retex-navigation"][value^="Fluide"]');
            await fillAndWait(page, "#retex-comment", "La navigation est claire sur mobile.");
        });

        await capture(browser, "22_retex_transmis.png", async page => {
            await selectScreen(page, "retex-screen");
            await page.locator("#retex-pseudo").evaluate(node => node.textContent = "Candidat Démo");
            await page.locator("#retex-specialty").evaluate(node => node.textContent = "RHL - Restauration, hôtellerie et loisirs");
            await page.locator("#retex-status").evaluate(node => {
                node.textContent = "RETEX transmis à l’administration. Merci pour ton retour.";
            });
            await page.locator("#btn-submit-retex").evaluate(button => {
                button.disabled = true;
                button.textContent = "RETEX transmis";
            });
        });

        console.log(`\n${22} captures enregistrées dans ${OUTPUT}`);
        console.log("Les scénarios d’offres d’emploi, de candidatures et de menu burger ne correspondent pas aux écrans de QCM-MAJOR.");
    } finally {
        await browser?.close();
        await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
}

main().catch(error => {
    console.error("Échec de la génération des captures :", error);
    process.exitCode = 1;
});
