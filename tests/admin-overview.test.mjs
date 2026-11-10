import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const migration = readFileSync(
    new URL("../supabase/migrations/20261110140000_admin_candidate_overview.sql", import.meta.url),
    "utf8"
);

function loadFunction(name, context) {
    const start = app.search(new RegExp(`(?:async )?function ${name}\\(`));
    assert.notEqual(start, -1, `function ${name} should exist`);
    const end = app.indexOf("\nfunction ", start + 1);
    const asyncEnd = app.indexOf("\nasync function ", start + 1);
    const ends = [end, asyncEnd].filter(index => index >= 0);
    vm.runInContext(app.slice(start, Math.min(...ends)), context);
    return context[name];
}

test("la RPC d’aperçu limite la cohorte aux candidats et exige un rôle administrateur", () => {
    assert.match(migration, /create or replace function public\.get_admin_candidate_overview/i);
    assert.match(migration, /security definer[\s\S]*set search_path = ''/i);
    assert.match(migration, /Administrator access required/i);
    assert.match(migration, /users\.raw_app_meta_data[\s\S]*'bm4_admin'\) in \('true', '1'\)/i);
    assert.match(migration, /revoke all on function public\.get_admin_candidate_overview\(\) from public, anon/i);
    assert.match(migration, /grant execute on function public\.get_admin_candidate_overview\(\) to authenticated/i);
    assert.match(migration, /from public\.retex_responses as responses/i);
    assert.doesNotMatch(migration, /document_url|reports\.details|candidate_email/i);
});

test("les filtres gèrent spécialité, étape observée, activité et seuil d’inactivité", () => {
    const now = Date.now();
    const context = vm.createContext({
        adminCandidateOverview: [
            {
                specialty: "Urgences",
                doctrine_module_id: "2",
                doctrine_event_type: "module_started",
                qcm_max_unlocked_questions: 20,
                last_activity: new Date(now - 2 * 86400000).toISOString()
            },
            {
                specialty: "Urgences",
                doctrine_module_id: "2",
                doctrine_event_type: "dossier_completed",
                qcm_max_unlocked_questions: 10,
                last_activity: new Date(now - 40 * 86400000).toISOString()
            },
            {
                specialty: "Anesthésie",
                last_activity: null
            }
        ],
        document: {
            getElementById(id) {
                const values = {
                    "admin-overview-specialty": "Urgences",
                    "admin-overview-period": "30",
                    "admin-overview-stage": "doctrine:2",
                    "admin-overview-activity-filter": "inactive",
                    "admin-overview-inactivity": "30"
                };
                return { value: values[id] };
            }
        }
    });
    loadFunction("getAdminCandidateStageKeys", context);
    const getState = loadFunction("getAdminCandidateOverviewState", context);
    const state = getState();
    assert.equal(state.cohort.length, 2);
    assert.equal(state.filtered.length, 1);
    assert.equal(state.activeCount, 1);
    assert.equal(state.inactiveCount, 1);
    assert.equal(state.filtered[0].doctrine_event_type, "dossier_completed");
});

test("le palier QCM n’est jamais présenté comme acquis en l’absence de progression enregistrée", () => {
    const context = vm.createContext({});
    const getKeys = loadFunction("getAdminCandidateStageKeys", context);
    const getLabel = loadFunction("getAdminCandidateStageLabel", context);
    assert.deepEqual(Array.from(getKeys({})), []);
    assert.equal(getLabel({}), "Aucune étape enregistrée");
    assert.match(getLabel({
        doctrine_module_id: "4",
        doctrine_event_type: "correction_accessible",
        doctrine_dossier: 12,
        doctrine_completed_modules: ["4"]
    }), /dossier 12 rendu accessible.*module terminé/);
});

test("l’interface expose les indicateurs non punitifs et l’export CSV filtré aux six champs autorisés", () => {
    assert.match(html, /id="admin-overview-specialty"/);
    assert.match(html, /id="admin-overview-period"/);
    assert.match(html, /id="admin-overview-stage"/);
    assert.match(html, /id="admin-overview-inactivity"/);
    assert.match(html, /sans score composite ni classement/i);
    assert.match(app, /function exportAdminCandidateOverview/);
    assert.match(app, /"Nom ou pseudo", "E-mail", "Spécialité", "Étape observée", "Dernière activité DOCTRINE", "Dernière activité QCM-MAJOR"/);
    assert.match(app, /if \(!hasNarrowingFilter \|\| state\.filtered\.length === 0\)/);
    assert.match(app, /text\.replace\(\/"\/g, '""'\)/);
    assert.match(app, /adminCandidateOverview = \[\];/);
});
