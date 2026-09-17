import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(testDirectory, "..");
const html = readFileSync(`${root}/index.html`, "utf8");
const manifest = JSON.parse(readFileSync(`${root}/manifest.json`, "utf8"));

const expectedPngSizes = new Map([
    ["public/icons/favicon.png", [32, 32]],
    ["public/icons/apple-touch-icon.png", [180, 180]],
    ["public/icons/icon-192.png", [192, 192]],
    ["public/icons/icon-192-maskable.png", [192, 192]],
    ["public/icons/icon-512.png", [512, 512]],
    ["public/icons/icon-512-maskable.png", [512, 512]]
]);

test("html and manifest keep referencing the generated icon set", () => {
    assert.match(html, /href="public\/icons\/favicon\.png"/);
    assert.match(html, /href="public\/icons\/apple-touch-icon\.png"/);

    const manifestIcons = manifest.icons.map(icon => ({
        src: icon.src,
        sizes: icon.sizes,
        purpose: icon.purpose ?? null
    }));

    assert.deepEqual(manifestIcons, [
        { src: "public/icons/icon-192.png", sizes: "192x192", purpose: null },
        { src: "public/icons/icon-512.png", sizes: "512x512", purpose: null },
        { src: "public/icons/icon-192-maskable.png", sizes: "192x192", purpose: "maskable" },
        { src: "public/icons/icon-512-maskable.png", sizes: "512x512", purpose: "maskable" }
    ]);
});

test("generated icon files exist and keep their expected png dimensions", () => {
    for (const [relativePath, expectedSize] of expectedPngSizes) {
        const absolutePath = path.join(root, relativePath);
        assert.ok(existsSync(absolutePath), `${relativePath} should exist`);
        assert.deepEqual(readPngSize(absolutePath), expectedSize, `${relativePath} should keep ${expectedSize.join("x")}`);
    }
});

function readPngSize(filePath) {
    const buffer = readFileSync(filePath);
    assert.equal(buffer.toString("ascii", 1, 4), "PNG", `${filePath} should be a PNG`);
    return [buffer.readUInt32BE(16), buffer.readUInt32BE(20)];
}
