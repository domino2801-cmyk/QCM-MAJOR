import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const app = readFileSync(path.join(root, "app.js"), "utf8");
const html = readFileSync(path.join(root, "index.html"), "utf8");
const migration = readFileSync(
    path.join(root, "supabase", "migrations", "20261110120000_admin_candidate_tracking.sql"),
    "utf8"
);

test("admin candidate tracking RPC is restricted to administrators", () => {
    assert.match(migration, /create or replace function public\.get_admin_candidate_tracking/i);
    assert.match(migration, /security definer/i);
    assert.match(migration, /set search_path = ''/i);
    assert.match(migration, /Administrator access required/i);
    assert.match(migration, /'bm4_admin'\) in \('true', '1'\)/i);
    assert.match(migration, /revoke all on function public\.get_admin_candidate_tracking\(uuid, timestamptz\) from public, anon/i);
    assert.match(migration, /grant execute on function public\.get_admin_candidate_tracking\(uuid, timestamptz\) to authenticated/i);
});

test("tracking RPC returns only required metadata and filters by candidate and date", () => {
    assert.match(migration, /where views\.user_id = p_user_id/i);
    assert.match(migration, /where submissions\.user_id = p_user_id/i);
    assert.match(migration, /where reports\.user_id = p_user_id/i);
    assert.match(migration, /where events\.user_id = p_user_id/i);
    assert.match(migration, /p_since is null or views\.opened_at >= p_since/i);
    assert.match(migration, /p_since is null or submissions\.created_at >= p_since/i);
    assert.match(migration, /p_since is null or reports\.created_at >= p_since/i);
    assert.match(migration, /p_since is null or events\.created_at >= p_since/i);
    assert.match(migration, /'progress_events'/i);
    assert.doesNotMatch(migration, /reports\.details|views\.document_url|candidate_email/i);
});

test("admin candidate page keeps activity summaries without a shared timeline", () => {
    assert.match(html, /id="admin-history-activity"/);
    assert.match(html, /id="admin-history-theme-summary"/);
    assert.match(html, /id="admin-history-period"/);
    assert.doesNotMatch(html, /admin-history-timeline|Chronologie commune|Les consultations DOCTRINE sont conservées/);
    assert.match(app, /\/rpc\/get_admin_candidate_tracking/);
    assert.match(app, /renderAdminTrackingActivity\(candidateResults, tracking, periodDays, candidateId\)/);
    assert.doesNotMatch(app, /renderAdminTrackingTimeline/);
    assert.match(app, /function renderAdminThemeSummary/);
    assert.match(app, /6 séries sont nécessaires/);
    assert.match(app, /Corrigé rendu accessible/);
    assert.match(app, /tracking\.progress_events/);
    assert.match(app, /Transmission d’une fiche/);
});

const moduleProgressMigration = readFileSync(
    path.join(root, "supabase", "migrations", "20261122100000_admin_candidate_module_progress.sql"),
    "utf8"
);

test("DOCTRINE module progress RPC exposes only aggregated completion metadata to administrators", () => {
    assert.match(moduleProgressMigration, /create or replace function public\\.get_admin_candidate_module_progress\\(\\)/i);
    assert.match(moduleProgressMigration, /security definer/i);
    assert.match(moduleProgressMigration, /set search_path = ''/i);
    assert.match(moduleProgressMigration, /Administrator access required/i);
    assert.match(moduleProgressMigration, /event_type = 'module_completed'/i);
    assert.match(moduleProgressMigration, /event_type = 'module_started'/i);
    assert.match(moduleProgressMigration, /max\\(events\\.created_at\\) as last_activity/i);
    assert.match(moduleProgressMigration, /revoke all on function public\\.get_admin_candidate_module_progress\\(\\) from public, anon/i);
    assert.match(moduleProgressMigration, /grant execute on function public\\.get_admin_candidate_module_progress\\(\\) to authenticated/i);
    assert.doesNotMatch(moduleProgressMigration, /candidate_email|document_url|reports\\.details/i);
});

test("admin dashboard classifies candidates from the seven DOCTRINE modules", () => {
    assert.match(html, /Classement automatique selon les validations des 7 modules DOCTRINE/i);
    assert.match(app, /get_admin_candidate_module_progress/);
    assert.match(app, /completed_modules/);
    assert.match(app, /completedCount === 7/);
    assert.match(app, /completedCount <= 1 && inactiveDays !== null && inactiveDays >= 30/);
    assert.match(app, /completedCount >= 2/);
    assert.match(app, /"Non prêt"/);
    assert.match(app, /"À suivre"/);
    assert.match(app, /"En difficulté"/);
});
