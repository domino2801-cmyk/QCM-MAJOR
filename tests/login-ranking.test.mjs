import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const renderer = app.slice(app.indexOf("function renderGlobalRanking("), app.indexOf("function renderGlobalEvolution("));
const loader = app.slice(app.indexOf("async function loadPublicGlobalRanking("), app.indexOf("async function refreshPublicGlobalRanking("));
const normalizer = app.slice(app.indexOf("function normalizePublicRankingRecord("), app.indexOf("function setResults("));

function element() {
    const classes = new Set(["hidden"]);
    return {
        children: [], innerText: "", innerHTML: "",
        classList: {
            remove(value) { classes.delete(value); },
            toggle(value, enabled) { if (enabled) classes.add(value); else classes.delete(value); },
            contains(value) { return classes.has(value); }
        },
        append(...children) { this.children.push(...children); },
        appendChild(child) { this.children.push(child); }
    };
}

function harness(ranking = [], state = "ready") {
    const nodes = new Map([
        "login-global-ranking-section", "login-global-ranking-status", "login-global-ranking-list",
        "global-ranking-section", "global-ranking-list", "history-global-ranking-section", "history-global-ranking-list"
    ].map(id => [id, element()]));
    const context = vm.createContext({
        document: { getElementById: id => nodes.get(id), createElement: element },
        getPublicGlobalRanking: () => ranking,
        publicRankingState: state
    });
    vm.runInContext(renderer, context);
    return { context, nodes };
}

test("le Top 3 public est visible avant connexion et ne reprend pas les résultats privés", () => {
    const h = harness([{ name: "Alpha", score: 19, createdAt: "2026-10-01T12:00:00Z" }]);
    vm.runInContext('renderGlobalRanking([{theme:"all",name:"Privé",score:20}])', h.context);
    const items = h.nodes.get("login-global-ranking-list").children;
    assert.equal(items.length, 1);
    assert.equal(items[0].children[1].innerText, "Alpha");
    assert.equal(items[0].children[2].innerText, "19.00 / 20");
    assert.equal(h.nodes.get("login-global-ranking-section").classList.contains("hidden"), false);
    assert.equal(h.nodes.get("history-global-ranking-list").children[0].children[1].innerText, "Alpha");
    assert.equal(h.nodes.get("history-global-ranking-section").classList.contains("hidden"), false);
});

test("le bloc reste visible pendant le chargement, sans résultats et après erreur réseau", () => {
    for (const [state, expected] of [
        ["loading", /Chargement/], ["ready", /Aucun résultat/], ["error", /indisponible/]
    ]) {
        const h = harness([], state);
        vm.runInContext('renderGlobalRanking([{theme:"all",name:"Privé",score:20}])', h.context);
        assert.equal(h.nodes.get("login-global-ranking-list").children.length, 0);
        assert.equal(h.nodes.get("login-global-ranking-section").classList.contains("hidden"), false);
        assert.match(h.nodes.get("login-global-ranking-status").innerText, expected);
    }
});

test("le podium utilise la coupe et les médailles vectorielles même à notes égales", () => {
    const h = harness([
        { name: "Alpha", score: 19 },
        { name: "Bravo", score: 15 },
        { name: "Charlie", score: 15 }
    ]);
    vm.runInContext("renderGlobalRanking([])", h.context);
    for (const id of ["login-global-ranking-list", "history-global-ranking-list"]) {
        const icons = h.nodes.get(id).children.map(item => item.children[0].children[0]);
        assert.deepEqual(icons.map(icon => icon.src), [
            "public/icons/podium-gold.svg",
            "public/icons/podium-silver.svg",
            "public/icons/podium-bronze.svg"
        ]);
        assert.ok(icons.every(icon => icon.alt && icon.className === "podium-icon"));
    }
});

test("le cache public affiché après erreur est identifié comme non actualisé", () => {
    const h = harness([{ name: "Alpha", score: -5, createdAt: null }], "error");
    vm.runInContext("renderGlobalRanking([])", h.context);
    assert.match(h.nodes.get("login-global-ranking-status").innerText, /dernier classement enregistré/);
    assert.equal(h.nodes.get("login-global-ranking-list").children[0].children[2].innerText, "-5.00 / 20");
});

test("le chargement anonyme signale une RPC manquante ou une réponse invalide", async () => {
    for (const result of [null, [{display_name:"Alpha",score:"19",created_at:null}], new Error("RPC absente")]) {
        const warnings = [];
        const context = vm.createContext({
            supabase: {}, publicRankingState: "loading",
            console: { warn: (...args) => warnings.push(args) },
            supabaseRestRequest: async (path, options) => {
                assert.equal(path, "/rpc/get_public_global_campaign_top3");
                assert.equal(options.method, "POST");
                assert.equal(options.accessToken, undefined);
                if (result instanceof Error) throw result;
                return result;
            },
            setPublicGlobalRanking: () => assert.fail("Réponse invalide enregistrée")
        });
        vm.runInContext(loader, context);
        assert.equal(await vm.runInContext("loadPublicGlobalRanking()", context), false);
        assert.equal(context.publicRankingState, "error");
        assert.equal(warnings.length, 1);
    }
});

test("les adresses email ne deviennent jamais des pseudos publics, y compris dans un ancien cache", () => {
    const context = vm.createContext({ createRecordId: () => "local-id" });
    vm.runInContext(normalizer, context);
    for (const raw of [{display_name:"mail@example.fr"}, {label:"mail@example.fr"}, {email:"mail@example.fr"}]) {
        context.raw = raw;
        const result = vm.runInContext("normalizePublicRankingRecord(raw)", context);
        assert.ok(!result.name.includes("@"));
        assert.equal(result.email, "");
    }
});
