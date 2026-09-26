import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(testDirectory, "..");
const js = readFileSync(`${root}/app.js`, "utf8");
const readme = readFileSync(`${root}/README.md`, "utf8");
const migration = readFileSync(
    `${root}/supabase/migrations/20260926082000_create_public_global_campaign_top3_view.sql`,
    "utf8"
);

test("public ranking migration exposes an anonymous-safe Top 3 view", () => {
    assert.match(migration, /create or replace view public\.public_global_campaign_top3 as/i);
    assert.match(migration, /coalesce\(/i);
    assert.match(migration, /where theme = 'all'/i);
    assert.match(migration, /limit 3;/i);
    assert.match(migration, /grant select on public\.public_global_campaign_top3 to anon, authenticated;/i);
});

test("application loads and caches the public ranking separately from quiz_results", () => {
    assert.match(js, /const publicRankingStorageKey = "bm4-public-ranking-v1";/);
    assert.match(js, /let publicGlobalRankingCache = \[\];/);
    assert.match(js, /function setPublicGlobalRanking\(results\)/);
    assert.match(js, /function getPublicGlobalRanking\(\)/);
    assert.match(js, /\/public_global_campaign_top3\?select=display_name,score,created_at&order=score\.desc,created_at\.desc/);
    assert.match(js, /const storedPublicRanking = getStoredJson\(localStorage, publicRankingStorageKey, \[\]\);/);
    assert.match(js, /setPublicGlobalRanking\(Array\.isArray\(storedPublicRanking\) \? storedPublicRanking : \[\]\);/);
    assert.match(js, /await loadPublicGlobalRanking\(\);/);
});

test("login Top 3 uses the public ranking cache without opening private results", () => {
    assert.match(js, /const loginRanking = getPublicGlobalRanking\(\);/);
    assert.match(js, /loginSection\?\.classList\.toggle\("hidden", loginRanking\.length === 0\);/);
    assert.match(js, /appendRanking\(loginList, loginRanking\);/);
    assert.match(readme, /vue publique `public_global_campaign_top3`/);
    assert.match(readme, /sans ouvrir `quiz_results` en lecture anonyme/);
});
