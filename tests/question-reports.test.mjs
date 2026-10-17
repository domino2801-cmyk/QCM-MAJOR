import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const app = readFileSync(path.join(root, "app.js"), "utf8");
const html = readFileSync(path.join(root, "index.html"), "utf8");
const migration = readFileSync(
    path.join(root, "supabase", "migrations", "20261004105000_create_question_reports.sql"),
    "utf8"
);
const deleteMigration = readFileSync(
    path.join(root, "supabase", "migrations", "20261004121500_allow_admin_delete_question_reports.sql"),
    "utf8"
);

function extractListener(marker) {
    const start = app.indexOf(marker);
    assert.notEqual(start, -1, `Unable to find listener: ${marker}`);
    const openingBrace = start + marker.length - 1;
    assert.equal(app[openingBrace], "{", `Listener marker must end with an opening brace: ${marker}`);
    let depth = 0;
    let end = openingBrace;

    while (end < app.length) {
        if (app[end] === "{") depth += 1;
        if (app[end] === "}") {
            depth -= 1;
            if (depth === 0) return `${app.slice(start, end + 1)});`;
        }
        end += 1;
    }

    throw new Error(`Unable to extract listener: ${marker}`);
}

test("le formulaire tactique signale la question, le type d’incident et sa priorité", () => {
    assert.match(html, /id="question-report-toggle"/);
    assert.match(html, /id="report-screen" class="screen report-screen"/);
    assert.match(html, /id="question-report-type"/);
    assert.match(html, /id="question-report-details"[^>]*maxlength="500"[^>]*required/);
    assert.match(html, /name="question-report-priority" value="Information" checked/);
    assert.match(html, /id="question-report-question"/);
    assert.match(html, /id="question-report-submit"/);
    assert.match(app, /uiController\.switchScreen\("report-screen"\)/);
    assert.match(app, /uiController\.switchScreen\("quiz-screen"\);\s*reportToggle\?\.focus\(\)/);
    assert.match(app, /Type d’incident : \$\{reportType\?\.value \|\| "Autre"\}/);
    assert.match(app, /Priorité : \$\{priority\}/);
    assert.match(html, /id="question-report-submit"/);
    assert.match(app, /await submitQuestionReport\(\s*question,\s*resolveQuestionAnswers\(question\),\s*selectedTheme,\s*\[/);
    assert.match(app, /question_id: question\.id == null \? null : String\(question\.id\)/);
    assert.match(app, /correct_answer_index: question\.correct/);
});

test("le bouton Signaler ouvre le formulaire associé au thème et à la question en cours", () => {
    const listeners = new Map();
    const screenChanges = [];
    const nodes = new Map([
        ["question-report-form", {
            reset() {},
            querySelectorAll() { return []; }
        }],
        ["question-report-count", { innerText: "12" }],
        ["question-report-submit", { disabled: true }],
        ["question-report-cancel", { innerText: "old" }],
        ["question-report-theme", { innerText: "" }],
        ["question-report-position", { innerText: "" }],
        ["question-report-question", { innerText: "" }],
        ["report-page-title", { focus() { this.focused = true; } }],
        ["theme-select", { selectedOptions: [{ textContent: "Matériels, Armements et Technologies" }] }]
    ]);
    const context = {
        displayedQuestion: { q: "Quel est le thème de la question ?" },
        currentQuizRunId: 8,
        selectedTheme: "2",
        quizFeedbackMode: "training",
        quizEngine: { index: 2, questions: [{}, {}, {}, {}] },
        isQuizTimeExpired: () => false,
        clearQuestionReport() {
            nodes.get("question-report-count").innerText = "0";
            nodes.get("question-report-submit").disabled = false;
        },
        uiController: {
            switchScreen: screen => screenChanges.push(screen)
        },
        setAuthMessage() {},
        document: {
            getElementById(id) {
                return nodes.get(id) || null;
            }
        },
        reportToggle: {
            addEventListener(name, handler) {
                listeners.set(name, handler);
            },
            innerText: "",
            disabled: false
        }
    };

    vm.runInNewContext(
        extractListener('reportToggle?.addEventListener("click", () => {'),
        context
    );
    listeners.get("click")();

    assert.deepEqual(screenChanges, ["report-screen"]);
    assert.equal(nodes.get("question-report-theme").innerText, "Matériels, Armements et Technologies");
    assert.equal(nodes.get("question-report-position").innerText, "Question 3 / 4");
    assert.equal(nodes.get("question-report-question").innerText, "Quel est le thème de la question ?");
    assert.equal(nodes.get("report-page-title").focused, true);
});

test("la transmission conserve la question et joint type d’incident et priorité au détail", async () => {
    const listeners = new Map();
    const sentReports = [];
    const status = { innerText: "" };
    const reportToggle = { innerText: "Signaler une erreur", disabled: false };
    const reportSubmit = { disabled: false };
    const reportCancel = { innerText: "Annuler le signalement" };
    const reportForm = {
        addEventListener(name, handler) {
            listeners.set(name, handler);
        },
        querySelector(selector) {
            assert.equal(selector, 'input[name="question-report-priority"]:checked');
            return { value: "Correction requise" };
        },
        querySelectorAll() {
            return [];
        }
    };
    const context = {
        displayedQuestion: { id: "q-12", q: "Question fautive", correct: 2 },
        reportQuizRunId: 4,
        currentQuizRunId: 4,
        expiredQuizRunId: -1,
        finalizedQuizRunId: -1,
        questionReportSubmitted: false,
        reportDetails: { value: "La réponse proposée est erronée." },
        reportType: { value: "Réponse incorrecte" },
        reportSubmit,
        reportCancel,
        reportToggle,
        reportForm,
        selectedTheme: "2",
        isQuizTimeExpired: () => false,
        resolveQuestionAnswers: () => ["A", "B", "C", "D"],
        async submitQuestionReport(...args) {
            sentReports.push(args);
        },
        setAuthMessage(id, message) {
            assert.equal(id, "question-report-status");
            status.innerText = message;
        }
    };

    vm.runInNewContext(
        extractListener('reportForm?.addEventListener("submit", async event => {'),
        context
    );
    await listeners.get("submit")({ preventDefault() {} });

    assert.deepEqual(sentReports, [[
        context.displayedQuestion,
        ["A", "B", "C", "D"],
        "2",
        "Type d’incident : Réponse incorrecte\nPriorité : Correction requise\nObservation : La réponse proposée est erronée."
    ]]);
    assert.equal(context.questionReportSubmitted, true);
    assert.equal(status.innerText, "Compte-rendu transmis à l’administration.");
    assert.equal(reportToggle.innerText, "Signalement transmis");
    assert.equal(reportToggle.disabled, true);
    assert.equal(reportCancel.innerText, "Retour au combat");
});

test("l’administration affiche l’e-mail des candidats et gère les signalements", () => {
    assert.match(html, /data-admin-section="question-reports"/);
    assert.match(html, /id="admin-question-reports-table"/);
    assert.match(app, /\/question_reports\?select=id,question_id,question_text,answers,correct_answer_index,quiz_theme,details,reporter_id,status,created_at/);
    assert.match(app, /reporter_email: profileEmailsById\.get\(String\(report\.reporter_id\)\) \|\| ""/);
    assert.match(app, /reporterCell\.innerText = report\.reporter_email \|\| "E-mail indisponible"/);
    assert.match(app, /Réponses : \$\{answers\.join\(" \| "\)/);
    assert.match(app, /body: \{ status: "resolved" \}/);
    assert.match(app, /Marquer comme traité/);
    assert.match(app, /Effacer signalement/);
    assert.match(app, /method: "DELETE"/);
    assert.match(app, /showConfirmOverlay\(\{\s*title: "Effacer le signalement \?"/);
});

test("l’onglet Signalements affiche le nombre de signalements à traiter", () => {
    assert.match(html, /class="admin-nav-icon" aria-hidden="true"/);
    assert.match(html, /id="admin-question-reports-badge" class="admin-nav-badge hidden"/);
    assert.match(app, /const pendingCount = questionReports\.filter\(report => report\.status !== "resolved"\)\.length/);
    assert.match(app, /badge\.classList\.toggle\("hidden", pendingCount === 0\)/);
    assert.match(app, /Signalements, \$\{pendingCount\} à traiter/);
    assert.match(app, /badge\.innerText = pendingCount > 99 \? "99\+" : String\(pendingCount\)/);
});

test("les politiques RLS limitent l’insertion au candidat et les actions de gestion aux administrateurs", () => {
    assert.match(migration, /alter table public\.question_reports enable row level security/i);
    assert.match(migration, /reporter_id = auth\.uid\(\)\s+and status = 'pending'/i);
    assert.match(migration, /create policy "Admins can read question reports"[\s\S]*?for select[\s\S]*?app_metadata/);
    assert.match(migration, /create policy "Admins can update question reports"[\s\S]*?for update[\s\S]*?app_metadata/);
    assert.doesNotMatch(migration, /for delete/i);
    assert.match(deleteMigration, /grant delete on public\.question_reports to authenticated/i);
    assert.match(deleteMigration, /create policy "Admins can delete question reports"[\s\S]*?for delete[\s\S]*?app_metadata/);
});
