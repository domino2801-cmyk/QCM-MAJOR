import test from "node:test";
import assert from "node:assert/strict";
import { showStartupRecoveryState } from "../modules/startup-recovery/index.js";

test("showStartupRecoveryState centralizes degraded login state", () => {
    const loginView = createViewFixture();
    const hiddenViews = new Map(
        ["register-view", "otp-view", "reset-view", "success-view", "admin-form"]
            .map(id => [id, createViewFixture()])
    );
    const loginMessage = { innerText: "" };
    const authTerminalState = { innerText: "" };
    const screenFixtures = [
        createScreenFixture("auth-screen"),
        createScreenFixture("theme-screen")
    ];
    const loginTabs = [createTabFixture(), createTabFixture()];
    const registerTabs = [createTabFixture(), createTabFixture("active")];

    showStartupRecoveryState({
        document: {
            getElementById(id) {
                if (id === "login-view") return loginView;
                if (hiddenViews.has(id)) return hiddenViews.get(id);
                if (id === "login-message") return loginMessage;
                if (id === "auth-terminal-state") return authTerminalState;
                return null;
            },
            querySelectorAll(selector) {
                if (selector === ".screen") return screenFixtures;
                if (selector === '#auth-screen [data-auth-mode="login"]') return loginTabs;
                if (selector === '#auth-screen [data-auth-mode="register"]') return registerTabs;
                return [];
            }
        },
        message: "Mode secours"
    });

    assert.equal(loginView.hiddenClasses.has("hidden"), false);
    hiddenViews.forEach(view => assert.equal(view.hiddenClasses.has("hidden"), true));
    assert.equal(screenFixtures[0].active, true);
    assert.equal(screenFixtures[1].active, false);
    assert.equal(authTerminalState.innerText, "MODE DÉGRADÉ");
    assert.equal(loginMessage.innerText, "Mode secours");
    loginTabs.forEach(tab => assert.equal(tab.active, true));
    registerTabs.forEach(tab => assert.equal(tab.active, false));
});

function createViewFixture(initialClass) {
    return createClassListFixture(initialClass);
}

function createTabFixture(initialClass) {
    return createClassListFixture(initialClass);
}

function createScreenFixture(id) {
    const fixture = createClassListFixture();
    fixture.id = id;
    return fixture;
}

function createClassListFixture(initialClass) {
    const fixture = {
        hiddenClasses: new Set(initialClass ? [initialClass] : []),
        classList: {
            add(className) {
                fixture.hiddenClasses.add(className);
            },
            remove(className) {
                fixture.hiddenClasses.delete(className);
            },
            toggle(className, force) {
                if (force) fixture.hiddenClasses.add(className);
                else fixture.hiddenClasses.delete(className);
            }
        }
    };
    fixture.classList.owner = fixture;
    Object.defineProperty(fixture, "active", {
        get() {
            return fixture.hiddenClasses.has("active");
        },
        set(value) {
            if (value) fixture.hiddenClasses.add("active");
            else fixture.hiddenClasses.delete("active");
        }
    });
    return fixture;
}
