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
        ">Valider l'engagement</button>",
        'id="otp-view"',
        'id="otp-form"',
        'id="otp-email-display"'
    ].forEach(fragment => assert.ok(html.includes(fragment), `Missing markup fragment: ${fragment}`));

    assert.match(html, /id="register-password"[^>]*minlength="6"/);
    assert.match(html, /id="register-password"[^>]*title="Le code de reconnaissance doit contenir au moins 6 caractères\."/);
    assert.match(html, /id="login-password"[^>]*title="Code de reconnaissance créé lors de l’enrôlement \(6 caractères minimum\)\."/);
    assert.match(html, /data-auth-mode="register">S'engager<\/button>\s*<button class="auth-tab active" type="button" data-auth-mode="login">Rallier l’unité<\/button>/);
    assert.match(html, /data-auth-mode="register" class="auth-tab active"|class="auth-tab active" type="button" data-auth-mode="register">S'engager<\/button>\s*<button class="auth-tab" type="button" data-auth-mode="login">Rallier l’unité<\/button>/);
    assert.match(css, /#auth-screen \.auth-tab\[data-auth-mode="login"\]\s*\{[^}]*#efe8d0/s);
    assert.match(css, /#auth-screen \.auth-tab\[data-auth-mode="register"\]\s*\{[^}]*#1d2a24/s);
    assert.match(css, /:is\(#login-global-ranking-list, #history-global-ranking-list, #admin-global-ranking-list\) \.global-ranking-item:first-child\s*\{[^}]*#c7a84d/);
    assert.match(css, /:is\(#login-global-ranking-list, #history-global-ranking-list, #admin-global-ranking-list\) \.global-ranking-item:nth-child\(2\)\s*\{[^}]*--ranking-metal: 203, 213, 225/);
    assert.match(css, /:is\(#login-global-ranking-list, #history-global-ranking-list, #admin-global-ranking-list\) \.global-ranking-item:nth-child\(3\)\s*\{[^}]*--ranking-metal: 205, 127, 50/);
    assert.match(css, /\.btn-main\s*\{[^}]*background:\s*linear-gradient\(135deg, #f4d067 0%, #f9c74f 20%, #ffdf73 45%, #ffb703 100%\);/);
    assert.match(html, /class="btn-main auth-preparation-btn" type="submit">[\s\S]*?auth-preparation-title">Entrez dans le Centre d'entraînement au combat du BM4[\s\S]*?auth-preparation-subtitle">Accès immédiat à la zone de confrontation/);
    assert.match(css, /#auth-screen #login-form \.auth-preparation-btn\s*\{[^}]*rgba\(245, 230, 179, 0\.96\)/s);
    assert.match(html, /auth-preparation-icon auth-preparation-icon-left"[^>]*>[\s\S]*?M7 15c8-4 16-3 25 2v34c-9-5-17-6-25-2V15Z[\s\S]*?m39 39 5 5 10-12/);
    assert.match(html, /auth-preparation-icon auth-preparation-icon-right"[^>]*>[\s\S]*?circle cx="30" cy="34" r="19"[\s\S]*?m52 12-16 16/);
    assert.match(css, /#auth-screen #login-form \.auth-preparation-btn\s*\{[^}]*margin-top:\s*-4px;/s);
    assert.match(css, /#auth-screen \.auth-preparation-title\s*\{[^}]*color:\s*#1a1b14;/);
    assert.match(css, /#auth-screen \.auth-preparation-subtitle\s*\{[^}]*white-space:\s*nowrap;/);
    assert.match(css, /#auth-screen \.auth-tab\[data-auth-mode="login"\]\.active\s*\{[^}]*rgba\(224, 180, 70, 0\.95\)/s);
    assert.match(html, /id="register-specialty"[^>]*required/);
    assert.equal((html.match(/Canal d'infiltration du combattant/g) || []).length, 3);
    assert.match(html, /<label for="login-password">Code de reconnaissance<\/label>/);
    assert.match(html, /<label for="register-password">Code de reconnaissance<\/label>/);
    assert.match(html, /class="password-toggle" type="button" aria-label="Afficher le mot de passe" aria-pressed="false" aria-controls="login-password"/);
    assert.match(js, /loginPassword\.type = isVisible \? "password" : "text"/);
    assert.doesNotMatch(html, /Mail personnel du candidat|Top 3 campagne globale|>Mot de passe</);
});

test("signup flow still stores pending signup and switches to OTP", () => {
    const registerMessageField = { innerText: "" };
    const form = { elements: [], noValidate: false };
    const fields = {
        pseudo: { id: "register-pseudo", name: "pseudo", value: "Caporal", validity: { valid: true } },
        email: { id: "register-email", name: "email", value: "Test@Example.com", validity: { valid: true } },
        password: { id: "register-password", name: "password", value: "abc123", validity: { valid: true }, minLength: 6 },
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
            password: "abc123",
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

test("signup rejects passwords shorter than six characters", async () => {
    const registerMessageField = { innerText: "" };
    const fields = {
        pseudo: { id: "register-pseudo", value: "Caporal", validity: { valid: true } },
        email: { id: "register-email", value: "test@example.com", validity: { valid: true } },
        password: {
            id: "register-password",
            name: "password",
            value: "abc12",
            validity: { valid: true },
            focusCalled: false,
            focus() {
                this.focusCalled = true;
            }
        },
        specialty: { id: "register-specialty", value: "INF", validity: { valid: true } }
    };
    const form = {
        elements: {
            namedItem: name => fields[name] || null,
            [Symbol.iterator]: function* () {
                yield* Object.values(fields);
            }
        }
    };
    let signUpCalled = false;
    const submitHandler = extractNamedFunction("handleRegisterSubmit", {
        ensureSupabaseConfigured: () => true,
        getFirstInvalidRegisterField: () => null,
        setAuthMessage: (id, message) => {
            if (id === "register-message") registerMessageField.innerText = message;
        },
        getRequiredFormElement: (_, name) => fields[name] || null,
        normalizeEmail: email => email,
        supabase: { auth: { signUp: async () => {
            signUpCalled = true;
            return { data: {} };
        } } }
    });

    await submitHandler({ preventDefault() {}, currentTarget: form });

    assert.equal(signUpCalled, false);
    assert.equal(registerMessageField.innerText, "Le code de reconnaissance doit contenir au moins 6 caractères.");
    assert.equal(fields.password.focusCalled, true);
});

test("register diagnostics mention Supabase connectivity problems", () => {
    const getFriendlyAuthError = extractNamedFunction("getFriendlyAuthError");
    const message = getFriendlyAuthError(new Error("Failed to fetch"), "Impossible de créer le compte.");

    assert.match(message, /Impossible de joindre Supabase/);
    assert.match(js, /initializeRegisterFormValidation\(\)/);
});

test("Supabase password errors report the server's actual minimum length", () => {
    const getFriendlyAuthError = extractNamedFunction("getFriendlyAuthError");

    assert.equal(
        getFriendlyAuthError(new Error("Password should be at least 8 characters"), "Impossible de créer le compte."),
        "Le code de reconnaissance doit contenir au moins 8 caractères."
    );
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
