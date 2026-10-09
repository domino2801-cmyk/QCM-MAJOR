import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../ui/Style.css", import.meta.url), "utf8");

test("admin delete buttons are compacted only on mobile, after the base rule", () => {
    const baseIndex = css.indexOf(".admin-delete-btn:hover {");
    const mobileMatch = /@media \(max-width: 560px\) \{\s*\.admin-delete-btn \{([^}]*)\}\s*\}/.exec(css);

    assert.ok(baseIndex >= 0);
    assert.ok(mobileMatch, "mobile admin delete rule is missing");
    assert.ok(mobileMatch.index > baseIndex, "mobile rule must follow the base rule to override it");

    const block = mobileMatch[1];
    assert.match(block, /font-size: min\(0\.8rem, 1em\);/);
    assert.match(block, /letter-spacing: 0;/);
    assert.match(block, /min-height: 36px;/);
    assert.match(block, /white-space: normal;/);
    assert.doesNotMatch(block, /color|background|border/);
});
