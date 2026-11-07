import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflow = readFileSync(`${root}/.github/workflows/pages.yml`, "utf8");

test("Pages deployment uses a unique artifact name for each run attempt", () => {
    const artifactName = "github-pages-${{ github.run_attempt }}";
    assert.ok(workflow.includes(`name: ${artifactName}`));
    assert.ok(workflow.includes(`artifact_name: ${artifactName}`));
});
