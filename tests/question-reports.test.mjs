import test from "node:test";
import assert from "node:assert/strict";
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

test("le formulaire candidat signale la question, sa bonne réponse et un commentaire facultatif", () => {
    assert.match(html, /id="question-report-toggle"/);
    assert.match(html, /id="question-report-details"[^>]*maxlength="1000"/);
    assert.match(html, /id="question-report-submit"/);
    assert.match(app, /await submitQuestionReport\(\s*question,\s*resolveQuestionAnswers\(question\),\s*selectedTheme,\s*reportDetails\?\.value \|\| ""\s*\)/);
    assert.match(app, /question_id: question\.id == null \? null : String\(question\.id\)/);
    assert.match(app, /correct_answer_index: question\.correct/);
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

test("les politiques RLS limitent l’insertion au candidat et les actions de gestion aux administrateurs", () => {
    assert.match(migration, /alter table public\.question_reports enable row level security/i);
    assert.match(migration, /reporter_id = auth\.uid\(\)\s+and status = 'pending'/i);
    assert.match(migration, /create policy "Admins can read question reports"[\s\S]*?for select[\s\S]*?app_metadata/);
    assert.match(migration, /create policy "Admins can update question reports"[\s\S]*?for update[\s\S]*?app_metadata/);
    assert.doesNotMatch(migration, /for delete/i);
    assert.match(deleteMigration, /grant delete on public\.question_reports to authenticated/i);
    assert.match(deleteMigration, /create policy "Admins can delete question reports"[\s\S]*?for delete[\s\S]*?app_metadata/);
});
