import { spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const branch = "main";

function run(command, args, { capture = false, timeout = 120_000 } = {}) {
    const result = spawnSync(command, args, {
        cwd: root,
        encoding: "utf8",
        stdio: capture ? "pipe" : "inherit",
        timeout,
        maxBuffer: 10 * 1024 * 1024
    });

    if (result.error) {
        throw new Error(`Impossible d’exécuter ${command} : ${result.error.message}`);
    }
    if (result.status !== 0) {
        const details = capture ? result.stderr.trim() || result.stdout.trim() : "";
        throw new Error(
            `${command} ${args.join(" ")} a échoué${result.signal ? ` (${result.signal})` : ""}`
                + (details ? ` : ${details}` : "")
        );
    }
    return capture ? result.stdout.trim() : "";
}

function git(...args) {
    return run("git", ["-C", root, ...args], { capture: true });
}

async function waitForPagesDeployment(repository, commit) {
    const deadline = Date.now() + 180_000;
    let runId = "";

    while (Date.now() < deadline) {
        const output = run("gh", [
            "run", "list",
            "--repo", repository,
            "--workflow", "pages.yml",
            "--branch", branch,
            "--commit", commit,
            "--limit", "5",
            "--json", "databaseId"
        ], { capture: true, timeout: 30_000 });
        const runs = JSON.parse(output);
        runId = runs[0]?.databaseId ? String(runs[0].databaseId) : "";
        if (runId) break;
        await delay(3_000);
    }

    if (!runId) {
        throw new Error(
            `Le commit ${commit.slice(0, 7)} est poussé, mais le workflow Pages n’est pas apparu après 3 minutes.`
        );
    }

    console.log(`Suivi du déploiement GitHub Pages (workflow ${runId})…`);
    run("gh", ["run", "watch", runId, "--repo", repository, "--exit-status"], {
        timeout: 15 * 60_000
    });
}

async function main() {
    const args = process.argv.slice(2);
    if (args.includes("--help") || args.includes("-h")) {
        console.log('Usage : npm run release -- "Message du commit"');
        console.log("Lance les tests, ajoute tous les changements, commit et push sur main, puis attend GitHub Pages.");
        return;
    }

    const message = args.join(" ").trim();
    if (!message || message.startsWith("-")) {
        throw new Error('Indiquez un message de commit : npm run release -- "Message du commit"');
    }

    const currentBranch = git("branch", "--show-current");
    if (currentBranch !== branch) {
        throw new Error(`Publication annulée : branche actuelle « ${currentBranch} », branche requise « ${branch} ».`);
    }

    const status = git("status", "--porcelain");
    if (!status) {
        throw new Error("Aucun changement à publier.");
    }

    const repository = run("gh", ["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"], {
        capture: true
    });
    const remote = git("remote", "get-url", "origin");
    const expectedRemote = new RegExp(
        `github\\.com[:/]${repository.replace("/", "\\/")}(?:\\.git)?$`,
        "i"
    );
    if (!expectedRemote.test(remote)) {
        throw new Error(`Le dépôt origin (${remote}) ne correspond pas au dépôt GitHub ${repository}.`);
    }

    const workflows = JSON.parse(run("gh", [
        "workflow", "list", "--repo", repository, "--json", "name,path,state"
    ], { capture: true }));
    if (!workflows.some(workflow =>
        workflow.path === ".github/workflows/pages.yml" && workflow.state === "active"
    )) {
        throw new Error("Le workflow actif .github/workflows/pages.yml est introuvable.");
    }

    console.log("Vérification de la synchronisation avec origin/main…");
    run("git", ["-C", root, "fetch", "origin", branch]);
    const divergence = git("rev-list", "--left-right", "--count", `HEAD...origin/${branch}`)
        .split(/\s+/)
        .map(Number);
    if (divergence[0] !== 0 || divergence[1] !== 0) {
        throw new Error("Publication annulée : main n’est pas synchronisée avec origin/main. Synchronisez la branche puis réessayez.");
    }

    console.log("Exécution de la suite complète de tests…");
    run(process.execPath, ["--test"], { timeout: 10 * 60_000 });

    console.log("Vérification des espaces et ajout de tous les changements…");
    run("git", ["-C", root, "diff", "--check"]);
    run("git", ["-C", root, "add", "--all"]);
    if (!git("diff", "--cached", "--name-only")) {
        throw new Error("Aucun changement à committer après les vérifications.");
    }

    const commitMessage = `${message}\n\nCo-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`;
    run("git", ["-C", root, "commit", "-m", commitMessage]);
    const commit = git("rev-parse", "HEAD");

    console.log(`Envoi de ${commit.slice(0, 7)} sur origin/main…`);
    run("git", ["-C", root, "push", "origin", branch]);
    await waitForPagesDeployment(repository, commit);

    console.log(`Publication terminée : ${commit.slice(0, 7)} est déployé sur GitHub Pages.`);
}

main().catch(error => {
    console.error(`Publication interrompue : ${error.message}`);
    process.exitCode = 1;
});
