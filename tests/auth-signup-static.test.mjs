import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(testDirectory, "..");
const html = readFileSync(`${root}/index.html`, "utf8");
const js = readFileSync(`${root}/app.js`, "utf8");
const css = readFileSync(`${root}/ui/Style.css`, "utf8");

test("register markup keeps required ids and HTML5 constraints", () => {
    [
        'id="register-view"',
        'id="register-form"',
        'id="register-pseudo"',
        'id="register-email"',
        'id="register-password"',
        'id="register-specialty"',
        'id="register-message"',
        'id="otp-view"',
        'id="otp-form"',
        'id="otp-email-display"'
    ].forEach(fragment => assert.ok(html.includes(fragment), `Missing markup fragment: ${fragment}`));

    assert.match(html, /id="register-password"[^>]*minlength="6"/);
    assert.match(html, /id="register-specialty"[^>]*required/);
});

test("signup flow still stores pending signup and switches to OTP", () => {
    assert.match(js, /document\.getElementById\("register-form"\)\.addEventListener\("submit"/);
    assert.match(js, /await supabase\.auth\.signUp\(\{/);
    assert.match(js, /setPendingSignup\(\{ name, email, specialty \}\)/);
    assert.match(js, /showAuthView\("otp", \{ email \}\)/);
    assert.match(js, /initializeRegisterFormValidation\(\)/);
});

test("register diagnostics cover invalid form inputs and hidden view toggling", () => {
    assert.match(js, /function getRegisterValidationMessage/);
    assert.match(js, /Impossible de joindre Supabase\./);
    assert.match(css, /\.hidden\s*\{\s*display:\s*none;\s*\}/);
    assert.match(css, /#auth-screen \.auth-view/);
});
