import test from "node:test";
import assert from "node:assert/strict";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const types = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".mp3": "audio/mpeg"
};

test("CSP allows the app and Supabase but blocks injected scripts and other connections", async t => {
    const server = createServer(async (request, response) => {
        const pathname = new URL(request.url, "http://localhost").pathname;
        const file = path.resolve(root, `.${pathname}`);
        if (!file.startsWith(`${root}${path.sep}`)) {
            response.writeHead(403).end();
            return;
        }
        try {
            if (!(await stat(file)).isFile()) {
                response.writeHead(404).end();
                return;
            }
        } catch {
            response.writeHead(404).end();
            return;
        }
        response.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream" });
        createReadStream(file).pipe(response);
    });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));

    const browser = await chromium.launch({ headless: true });
    t.after(() => browser.close());
    const page = await browser.newPage();
    const errors = [];
    const violations = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.addInitScript(() => {
        window.addEventListener("securitypolicyviolation", event => {
            window.__cspViolations ||= [];
            window.__cspViolations.push(event.effectiveDirective);
        });
    });
    const user = { id: "00000000-0000-4000-8000-000000000001", email: "demo@example.test", user_metadata: { name: "Test" } };
    await page.route("https://beodiemzrunqjkvylffn.supabase.co/**", route => {
        const request = route.request();
        const pathname = new URL(request.url()).pathname;
        const body = pathname === "/auth/v1/token"
            ? { access_token: "test-token", refresh_token: "test-refresh", expires_in: 3600, user }
            : pathname === "/rpc/is_current_account_blocked" || pathname === "/rest/v1/rpc/is_current_account_blocked"
                ? false
                : pathname === "/rest/v1/profiles"
                    ? [{ ...user, name: "Test", speciality: "GEN" }]
                    : [];
        return route.fulfill({
            status: request.method() === "OPTIONS" ? 204 : 200,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
                "Content-Type": "application/json"
            },
            body: request.method() === "OPTIONS" ? "" : JSON.stringify(body)
        });
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
    await page.waitForSelector("#first-visit-overlay:not(.hidden)");
    await page.locator("#first-visit-no-btn").click();
    await page.locator("#login-email").fill(user.email);
    await page.locator("#login-password").fill("demo-password");
    await page.locator("#login-form button[type=submit]").click();
    await page.waitForSelector("#centre-screen.active");
    violations.push(...await page.evaluate(() => window.__cspViolations || []));
    assert.deepEqual(violations, []);

    const result = await page.evaluate(async () => {
        const script = document.createElement("script");
        script.textContent = "window.injectedScriptExecuted = true";
        document.body.appendChild(script);
        const externalBlocked = await new Promise(resolve => {
            const external = document.createElement("script");
            external.src = "https://example.invalid/injected.js";
            external.onload = () => resolve(false);
            external.onerror = () => resolve(true);
            document.body.appendChild(external);
        });
        const allowed = await fetch("https://beodiemzrunqjkvylffn.supabase.co/test").then(response => response.ok);
        const blocked = await fetch("https://example.invalid/test").then(() => false, () => true);
        return { inlineExecuted: window.injectedScriptExecuted === true, externalBlocked, allowed, blocked };
    });
    assert.deepEqual(result, { inlineExecuted: false, externalBlocked: true, allowed: true, blocked: true });
    await page.waitForFunction(() => window.__cspViolations?.includes("script-src-elem"));
    assert.deepEqual(errors, []);
});
