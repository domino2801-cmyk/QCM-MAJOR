import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migration = readFileSync(
    path.join(root, "supabase", "migrations", "20261017190000_restrict_question_bank_read_policy.sql"),
    "utf8"
);

test("la politique publique question_bank est limitée aux questions actives", () => {
    assert.match(migration, /alter table public\.question_bank enable row level security/i);
    assert.match(migration, /drop policy if exists "Lecture des questions" on public\.question_bank/i);
    assert.match(migration, /drop policy if exists "Public can read question bank" on public\.question_bank/i);
    assert.match(migration, /drop policy if exists "Anyone can read question bank" on public\.question_bank/i);
    assert.match(migration, /create policy "Anyone can read active questions"[\s\S]*?for select[\s\S]*?to anon, authenticated[\s\S]*?using \(active is true\)/i);
});
