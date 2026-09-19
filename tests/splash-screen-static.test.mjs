import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(testDirectory, "..");
const html = readFileSync(`${root}/index.html`, "utf8");
const css = readFileSync(`${root}/ui/Style.css`, "utf8");
const js = readFileSync(`${root}/app.js`, "utf8");

test("startup splash appears before the application", () => {
    assert.match(html, /id="startup-loading"/);
    assert.match(html, /aria-label="Écran de démarrage de l’application"/);
    assert.doesNotMatch(html, /<span>Chargement\.\.\.<\/span>/);
    assert.doesNotMatch(html, /script type="module" src="startup-splash-bootstrap\.js"/);
    assert.match(css, /public\/splash\/android\/android-1440x2560\.png/);
    assert.match(css, /public\/splash\/ios\/iphone-12-1170x2532\.png/);
    assert.match(css, /public\/splash\/ios\/ipad-pro-11-1668x2388\.png/);
    assert.match(css, /\.startup-loading::after/);
    assert.match(css, /splash-loading-progress/);
});

test("mobile splash assets are stored and declared for iOS", () => {
    const splashAssets = [
        "public/splash/ios/iphone-se-640x1136.png",
        "public/splash/ios/iphone-8-750x1334.png",
        "public/splash/ios/iphone-x-1125x2436.png",
        "public/splash/ios/iphone-12-1170x2532.png",
        "public/splash/ios/iphone-13-pro-max-1284x2778.png",
        "public/splash/ios/iphone-14-pro-max-1290x2796.png",
        "public/splash/ios/ipad-9-7-1536x2048.png",
        "public/splash/ios/ipad-pro-11-1668x2388.png",
        "public/splash/ios/ipad-pro-12-9-2048x2732.png",
        "public/splash/android/android-1080x1920.png",
        "public/splash/android/android-1080x2400.png",
        "public/splash/android/android-1440x2560.png",
        "public/splash/android/android-tablet-1200x1920.png",
        "public/splash/android/android-tablet-1600x2560.png"
    ];

    for (const asset of splashAssets) {
        assert.ok(existsSync(path.join(root, asset)), `${asset} should exist`);
    }

    assert.match(html, /rel="apple-touch-startup-image"/);
    assert.match(html, /public\/splash\/ios\/iphone-14-pro-max-1290x2796\.png/);
    assert.match(html, /public\/splash\/ios\/ipad-pro-12-9-2048x2732\.png/);
});

test("startup loading overlay is black and dismissible", () => {
    assert.match(css, /\.startup-loading\s*\{/);
    assert.match(css, /background:\s*#000/);
    assert.match(css, /\.startup-loading-hidden\s*\{/);
});

test("app bootstrap no longer wires startup splash logic", () => {
    assert.doesNotMatch(js, /from "\.\/modules\/startup-splash\/index\.js"/);
    assert.doesNotMatch(js, /setSplashStatus\(/);
    assert.doesNotMatch(js, /activateSplashFallback\(/);
    assert.doesNotMatch(js, /hideSplashScreen\(/);
});

test("app bootstrap keeps an explicit startup recovery fallback", () => {
    assert.match(js, /from "\.\/modules\/startup-recovery\/index\.js"/);
    assert.match(js, /showStartupRecoveryState\(\{ message: startupFallbackMessage \}\)/);
    assert.match(js, /hideStartupLoading\(\);/);
    assert.match(js, /if \(authUiReady\) \{\s*clearAuthMessages\(\);/);
});
