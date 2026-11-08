import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migration = readFileSync(
    path.join(root, "supabase/migrations/20261108152100_add_admin_account_blocking.sql"),
    "utf8"
);
const app = readFileSync(path.join(root, "app.js"), "utf8");

test("les blocages ne sont accessibles qu’avec les RPC réservées aux administrateurs", () => {
    assert.match(migration, /alter table public\.account_blocks enable row level security/);
    assert.match(migration, /revoke all on table public\.account_blocks from public, anon, authenticated/);
    assert.match(migration, /function public\.get_admin_blocked_accounts\(\)[\s\S]*?Administrator access required/);
    assert.match(migration, /function public\.set_account_blocked\(p_user_id uuid, p_blocked boolean\)[\s\S]*?Administrator access required[\s\S]*?insert into public\.account_blocks/);
    assert.match(migration, /auth\.jwt\(\) -> 'app_metadata' ->> 'bm4_admin'/);
    assert.match(migration, /revoke all on function public\.set_account_blocked\(uuid, boolean\) from public, anon/);
});

test("la connexion candidat vérifie le blocage côté Supabase avant d’ouvrir l’application", () => {
    assert.match(app, /\/rpc\/is_current_account_blocked/);
    assert.match(app, /if \(accountBlocked\) \{[\s\S]*?accountBlockedErrorCode/);
    assert.match(app, /handleBlockedAccount\("login-message"\)/);
});
