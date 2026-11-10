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

test("admin candidate page includes activity summaries and a shared timeline", () => {
    assert.match(html, /id="admin-history-activity"/);
    assert.match(html, /id="admin-history-theme-summary"/);
    assert.match(html, /id="admin-history-timeline"/);
    assert.match(app, /\/rpc\/get_admin_candidate_tracking/);
    assert.match(app, /renderAdminTrackingTimeline\(candidateResults, tracking, periodDays, candidateId\)/);
    assert.match(app, /function renderAdminThemeSummary/);
    assert.match(app, /6 séries sont nécessaires/);
    assert.match(app, /Corrigé rendu accessible/);
    assert.match(app, /tracking\.progress_events/);
    assert.match(app, /Transmission d’une fiche/);
});
