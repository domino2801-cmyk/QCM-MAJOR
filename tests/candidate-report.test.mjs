import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
    buildCandidateSummaries,
    buildCandidateReportPdf,
    getCandidateStatus,
    sortByPriority
} from "../modules/candidate-report/index.js";

const results = [
    { candidateId: "a", email: "a@x.fr", name: "Alpha", theme: "1", score: 16, createdAt: "2027-01-02T10:00:00Z" },
    { candidateId: "a", email: "a@x.fr", name: "Alpha", theme: "all", score: 14, createdAt: "2027-01-05T10:00:00Z" },
    { candidateId: "b", email: "b@x.fr", name: "Bravo", theme: "2", score: 8, createdAt: "2027-01-03T10:00:00Z" },
    { candidateId: "candidat-inconnu", email: "c@x.fr", name: "Charlie", theme: "3", score: 11, createdAt: "2027-01-04T10:00:00Z" }
];
const accounts = [
    { id: "a", email: "a@x.fr", name: "Alpha", specialty: "Urgences" },
    { id: "d", email: "d@x.fr", name: "Delta", specialty: "Santé" }
];

test("status thresholds follow 14 / 10 on 20", () => {
    assert.equal(getCandidateStatus(14), "ready");
    assert.equal(getCandidateStatus(13.9), "watch");
    assert.equal(getCandidateStatus(10), "watch");
    assert.equal(getCandidateStatus(9.9), "struggling");
    assert.equal(getCandidateStatus(NaN), "none");
});

test("summaries merge accounts and results and sort by priority", () => {
    const summaries = buildCandidateSummaries({ results, accounts });
    assert.equal(summaries.length, 4);
    const alpha = summaries.find(summary => summary.name === "Alpha");
    assert.equal(alpha.seriesCount, 2);
    assert.equal(alpha.average, 15);
    assert.equal(alpha.specialty, "Urgences");
    assert.equal(alpha.themes.find(theme => theme.id === "1").average, 16);
    assert.deepEqual(sortByPriority(summaries).map(summary => summary.name), ["Bravo", "Charlie", "Delta", "Alpha"]);
});

test("the PDF is a valid multi-page A4 document", async () => {
    const blob = buildCandidateReportPdf(buildCandidateSummaries({ results, accounts }));
    const content = Buffer.from(await blob.arrayBuffer()).toString("latin1");
    assert.equal(blob.type, "application/pdf");
    assert.match(content, /^%PDF-1\.4/);
    assert.match(content, /\/Count 5 /);
    assert.match(content, /%%EOF$/);
});

test("the admin results panel exposes the dashboard and its PDF export", () => {
    const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
    const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
    ["admin-dashboard-cards", "admin-dashboard-status", "admin-dashboard-pdf"].forEach(id =>
        assert.match(html, new RegExp(`id="${id}"`)));
    assert.match(app, /getElementById\("admin-dashboard-pdf"\)\?\.addEventListener\("click", exportAdminCandidateReportPdf\)/);
});
