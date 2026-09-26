import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(testDirectory, "..");
const html = readFileSync(`${root}/index.html`, "utf8");
const js = readFileSync(`${root}/app.js`, "utf8");
const readme = readFileSync(`${root}/README.md`, "utf8");
const migration = readFileSync(
    `${root}/supabase/migrations/20260926082000_create_public_global_campaign_top3_view.sql`,
    "utf8"
);

test("public ranking migration exposes an anonymous-safe Top 3 RPC", () => {
    assert.match(migration, /create or replace function public\.get_public_global_campaign_top3\(\)/i);
    assert.match(migration, /security definer/i);
    assert.match(migration, /set search_path = public/i);
    assert.match(migration, /coalesce\(/i);
    assert.match(migration, /where theme = 'all'/i);
    assert.match(migration, /limit 3;/i);
    assert.match(migration, /grant execute on function public\.get_public_global_campaign_top3\(\) to anon, authenticated;/i);
});

test("application loads and caches the public ranking separately from quiz_results", () => {
    assert.match(js, /const publicRankingStorageKey = "bm4-public-ranking-v1";/);
    assert.match(js, /let publicGlobalRankingCache = \[\];/);
    assert.match(js, /function setPublicGlobalRanking\(results\)/);
    assert.match(js, /function getPublicGlobalRanking\(\)/);
    assert.match(js, /\/rpc\/get_public_global_campaign_top3/);
    assert.match(js, /method: "POST"/);
    assert.match(js, /const storedPublicRanking = getStoredJson\(localStorage, publicRankingStorageKey, \[\]\);/);
    assert.match(js, /setPublicGlobalRanking\(Array\.isArray\(storedPublicRanking\) \? storedPublicRanking : \[\]\);/);
    assert.match(js, /await loadPublicGlobalRanking\(\);/);
});

test("login Top 3 uses the public ranking cache without opening private results", () => {
    assert.match(js, /const loginRanking = getPublicGlobalRanking\(\);/);
    assert.match(js, /const effectiveGlobalRanking = loginRanking\.length > 0 \? loginRanking : ranking;/);
    assert.match(js, /loginSection\?\.classList\.toggle\("hidden", effectiveGlobalRanking\.length === 0\);/);
    assert.match(js, /adminSection\?\.classList\.toggle\("hidden", effectiveGlobalRanking\.length === 0\);/);
    assert.match(js, /appendRanking\(loginList, effectiveGlobalRanking\);/);
    assert.match(js, /appendRanking\(adminList, effectiveGlobalRanking\);/);
    assert.match(js, /appendRanking\(themeList, effectiveGlobalRanking\);/);
    assert.match(js, /appendRanking\(historyList, effectiveGlobalRanking\);/);
    assert.match(readme, /fonction RPC publique `get_public_global_campaign_top3\(\)`/);
    assert.match(readme, /sans ouvrir `quiz_results` en lecture anonyme/);
});

test("candidate login screen keeps the Top 3 above the login form", () => {
    const rankingIndex = html.indexOf('id="login-global-ranking-section"');
    const formIndex = html.indexOf('id="login-form"');

    assert.notEqual(rankingIndex, -1);
    assert.notEqual(formIndex, -1);
    assert.ok(rankingIndex < formIndex);
});

test("login view retries the public Top 3 refresh when the auth screen is shown again", () => {
    assert.match(js, /let publicRankingRefreshPromise = null;/);
    assert.match(js, /function refreshVisibleLoginGlobalRanking\(\)/);
    assert.match(js, /if \(!hasSupabaseAuth\(\) \|\| publicRankingRefreshPromise\) return publicRankingRefreshPromise;/);
    assert.match(js, /if \(!document\.getElementById\("login-view"\)\?\.classList\.contains\("hidden"\)\) \{\s*renderGlobalRanking\(getResults\(\)\);/s);
    assert.match(js, /if \(view === "login" && authUiReady\) \{\s*void refreshVisibleLoginGlobalRanking\(\);\s*\}/s);
});
