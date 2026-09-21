import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

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
    const registerMessageField = { innerText: "" };
    const form = { elements: [], noValidate: false };
    const fields = {
        pseudo: { id: "register-pseudo", name: "pseudo", value: "Caporal", validity: { valid: true } },
        email: { id: "register-email", name: "email", value: "Test@Example.com", validity: { valid: true } },
        password: { id: "register-password", name: "password", value: "secret6", validity: { valid: true }, minLength: 6 },
        specialty: { id: "register-specialty", name: "specialty", value: "INF", validity: { valid: true } },
        "register-message": registerMessageField
    };
    const controls = Object.values(fields).filter(field => field.id && field.id !== "register-message");
    form.elements = controls;
    form.elements.namedItem = name => fields[name] || null;

    let pendingSignup = null;
    let shownView = null;
    let otpInputsCleared = false;
    let signUpPayload = null;

    const submitHandler = extractNamedFunction("handleRegisterSubmit", {
        ensureSupabaseConfigured: () => true,
        getFirstInvalidRegisterField: () => null,
        getRegisterValidationMessage: () => "unused",
        setAuthMessage: (id, message) => {
            if (id === "register-message") registerMessageField.innerText = message;
        },
        getFriendlyAuthError: (error, fallback) => error?.message || fallback || "Erreur d’authentification",
        getRequiredFormElement: (_, name) => fields[name] || null,
        normalizeEmail: email => email.trim().toLowerCase(),
        supabase: {
            auth: {
                signUp: async payload => {
                    signUpPayload = payload;
                    return { data: { user: { id: "user-123" }, session: { access_token: "token-123" } } };
                }
            }
        },
        setPendingSignup: value => {
            pendingSignup = value;
        },
        upsertProfileForUser: async () => ({ email: "test@example.com", name: "Caporal", specialty: "INF" }),
        clearAuthMessages: () => {
            registerMessageField.innerText = "";
        },
        clearOtpInputs: () => {
            otpInputsCleared = true;
        },
        showAuthView: (view, options) => {
            shownView = { view, options };
        }
    });

    return submitHandler({
        preventDefault() {},
        currentTarget: form
    }).then(() => {
        assert.deepEqual(toPlainJson(signUpPayload), {
            email: "test@example.com",
            password: "secret6",
            options: {
                data: { name: "Caporal", specialty: "INF" }
            }
        });
        assert.deepEqual(toPlainJson(pendingSignup), {
            name: "Caporal",
            email: "test@example.com",
            specialty: "INF"
        });
        assert.equal(registerMessageField.innerText, "");
        assert.equal(otpInputsCleared, true);
        assert.deepEqual(toPlainJson(shownView), { view: "otp", options: { email: "test@example.com" } });
    });
});

test("signup flow stops on invalid field and shows register-message", async () => {
    const registerMessageField = { innerText: "" };
    const invalidField = {
        id: "register-specialty",
        validity: { valid: false, valueMissing: true },
        focusCalled: false,
        focus() {
            this.focusCalled = true;
        }
    };

    const submitHandler = extractNamedFunction("handleRegisterSubmit", {
        ensureSupabaseConfigured: () => true,
        getFirstInvalidRegisterField: () => invalidField,
        getRegisterValidationMessage: field => field.id === "register-specialty"
            ? "Sélectionnez une spécialité BM4 avant de créer le compte."
            : "unused",
        setAuthMessage: (id, message) => {
            if (id === "register-message") registerMessageField.innerText = message;
        },
        getRequiredFormElement: () => {
            throw new Error("should not read fields when form is invalid");
        },
        normalizeEmail: email => email,
        supabase: { auth: { signUp: async () => {
            throw new Error("should not call signUp when form is invalid");
        } } },
        setPendingSignup: () => {
            throw new Error("should not persist pending signup when form is invalid");
        },
        clearAuthMessages: () => {},
        clearOtpInputs: () => {},
        showAuthView: () => {
            throw new Error("should not show OTP when form is invalid");
        }
    });
    await submitHandler({
        preventDefault() {},
        currentTarget: { elements: [invalidField] }
    });

    assert.equal(registerMessageField.innerText, "Sélectionnez une spécialité BM4 avant de créer le compte.");
    assert.equal(invalidField.focusCalled, true);
});

test("register diagnostics mention Supabase connectivity problems", () => {
    const getFriendlyAuthError = extractNamedFunction("getFriendlyAuthError");
    const message = getFriendlyAuthError(new Error("Failed to fetch"), "Impossible de créer le compte.");

    assert.match(message, /Impossible de joindre Supabase/);
    assert.match(js, /initializeRegisterFormValidation\(\)/);
});

test("register diagnostics cover invalid form inputs and hidden view toggling", () => {
    assert.match(js, /function getRegisterValidationMessage/);
    assert.match(js, /function getFirstInvalidRegisterField/);
    assert.match(css, /\.hidden\s*\{\s*display:\s*none;\s*\}/);
    assert.match(css, /#auth-screen \.auth-view/);
});

function extractNamedFunction(name, globals = {}) {
    const asyncSignature = `async function ${name}`;
    const plainSignature = `function ${name}`;
    const start = js.includes(asyncSignature)
        ? js.indexOf(asyncSignature)
        : js.indexOf(plainSignature);
    assert.notEqual(start, -1, `Unable to find function ${name}`);

    const bodyStart = js.indexOf("{", start);
    let depth = 0;
    let cursor = bodyStart;
    while (cursor < js.length) {
        const character = js[cursor];
        if (character === "{") depth += 1;
        if (character === "}") {
            depth -= 1;
            if (depth === 0) break;
        }
        cursor += 1;
    }

    const functionSource = js.slice(start, cursor + 1);
    const script = new vm.Script(`(${functionSource})`);
    return script.runInNewContext(globals);
}

function toPlainJson(value) {
    return JSON.parse(JSON.stringify(value));
}
