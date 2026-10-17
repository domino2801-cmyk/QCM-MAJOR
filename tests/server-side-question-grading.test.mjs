import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migration = readFileSync(
    path.join(root, "supabase", "migrations", "20261017192000_server_side_question_grading.sql"),
    "utf8"
);
const app = readFileSync(path.join(root, "app.js"), "utf8");
const questionBankDirectory = path.join(root, "modules", "questions-bank");

test("les candidats ne peuvent lire que les colonnes publiques des questions actives", () => {
    assert.match(migration, /drop policy %I on public\.question_bank/i);
    assert.match(migration, /using \(active is true\)/i);
    assert.match(migration, /revoke select on table public\.question_bank from public, anon, authenticated/i);
    assert.match(migration, /grant select\s*\([\s\S]*?answer_4,\s*active[\s\S]*?\)\s*on table public\.question_bank to anon, authenticated/i);
    assert.doesNotMatch(migration, /grant select\s*\([\s\S]*?correct_answer[\s\S]*?\)\s*on table public\.question_bank to anon, authenticated/i);
});

test("les RPC de correction et de lecture admin sont protégées et ne renvoient pas la clé brute", () => {
    assert.match(migration, /create or replace function public\.grade_question_answer[\s\S]*?security definer[\s\S]*?set search_path = ''/i);
    assert.match(migration, /if auth\.uid\(\) is null then[\s\S]*?Authentication required/i);
    assert.match(migration, /return correct_index = p_selected_index/i);
    assert.doesNotMatch(
        migration.match(/create or replace function public\.grade_question_answer[\s\S]*?\$\$;/i)?.[0] || "",
        /returns table[\s\S]*correct_index/i
    );
    assert.match(migration, /create or replace function public\.get_admin_question_bank[\s\S]*?security definer[\s\S]*?set search_path = ''/i);
    assert.match(migration, /not coalesce\(\([\s\S]*?bm4_admin[\s\S]*?\), false\)/i);
    assert.match(migration, /Administrator access required/);
    assert.match(migration, /grant execute on function public\.grade_question_answer\(text, integer\) to authenticated/i);
});

test("les corrigés ne sont plus inclus dans le JavaScript envoyé aux candidats", () => {
    const themeFiles = readdirSync(questionBankDirectory).filter(file => /^theme-\d+\.js$/.test(file));
    assert.ok(themeFiles.length > 0);
    for (const file of themeFiles) {
        const source = readFileSync(path.join(questionBankDirectory, file), "utf8");
        assert.doesNotMatch(source, /\bcorrect\s*:\s*\d+/);
    }
    assert.match(app, /\/question_bank\?select=id,theme_id,question,answer_1,answer_2,answer_3,answer_4,active/);
    assert.match(app, /\/rpc\/get_admin_question_bank/);
    assert.match(app, /\/rpc\/grade_question_answer/);
});
