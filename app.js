// =========================================================
// APP.JS — POINT D’ENTRÉE TACTIQUE DE L’APPLICATION BM4
// =========================================================

// Importation des modules (à créer dans /modules/)
import { quizEngine } from "./modules/quiz-engine/index.js";
import { scoring } from "./modules/quiz-engine/scoring.js";
import { questionsBank, getAllQuestions } from "./modules/questions-bank/index.js";
import { uiController } from "./modules/ui-controller/index.js";

// =========================================================
// VARIABLES D’ÉTAT
// =========================================================

let selectedTheme = null;
let maxQuestions = 0;
let reviewItems = [];
let questionSourceReady = false;
const accountsStorageKey = "bm4-accounts";
const sessionStorageKey = "bm4-session";
const adminSessionStorageKey = "bm4-admin-session";
const questionStorageKey = "bm4-question-overrides-v2";
const resultsStorageKey = "bm4-results";
const questionHistoryStorageKey = "bm4-question-history";
const adminEmail = "admin@admin.fr";
const adminPassword = "delemotte";
const googleSheetEndpoint = "https://script.google.com/macros/s/AKfycbwljrsgofGfgUPpSvsBAKC3VL14VHrrquupvc6V2r9KwfBXDP-Gfh19LT9-w5s7paYJrQ/exec";
let editingQuestionIndex = null;
let authAudioRetry = null;
const waitingConnectionAudio = new Audio("public/audio/ATTENTE%20CONNECTION.mp3");
waitingConnectionAudio.loop = FALSE;
waitingConnectionAudio.preload = "auto";
const correctAnswerAudio = new Audio("public/audio/BONNE%20REPONSE.mp3");
correctAnswerAudio.preload = "auto";
const incorrectAnswerAudio = new Audio("public/audio/MAUVAISE%20REPONSE.mp3");
incorrectAnswerAudio.preload = "auto";

function getAccounts() {
    try {
        return JSON.parse(localStorage.getItem(accountsStorageKey) || "{}");
    } catch {
        return {};
    }
}

function getQuestionOverrides() {
    try {
        return JSON.parse(localStorage.getItem(questionStorageKey) || "{}");
    } catch {
        return {};
    }
}

function getResults() {
    try {
        return JSON.parse(localStorage.getItem(resultsStorageKey) || "[]");
    } catch {
        return [];
    }
}

function getQuestionHistory() {
    try {
        return JSON.parse(localStorage.getItem(questionHistoryStorageKey) || "{}");
    } catch {
        return {};
    }
}

function getQuestionPool(themeId) {
    if (themeId === "all") return getAllQuestions();

    const themeIndex = (parseInt(themeId, 10) - 1).toString();
    return questionsBank[themeIndex]?.questions || [];
}

function applyQuestionOverrides() {
    const overrides = getQuestionOverrides();
    Object.entries(overrides).forEach(([themeId, questions]) => {
        if (questionsBank[themeId] && Array.isArray(questions)) {
            questionsBank[themeId].questions = questions;
        }
    });
}

function applyRemoteQuestions(questions) {
    Object.values(questionsBank).forEach(theme => {
        theme.questions = [];
    });

    questions.forEach(question => {
        if (questionsBank[question.themeId]) {
            questionsBank[question.themeId].questions.push({
                id: question.id,
                q: question.q,
                r: question.r,
                correct: question.correct
            });
        }
    });
}

async function syncQuestionMutation(payload) {
    if (!googleSheetEndpoint) return;

    try {
        await fetch(googleSheetEndpoint, {
            method: "POST",
            mode: "no-cors",
            cache: "no-store",
            body: JSON.stringify({ type: "questions", ...payload })
        });
    } catch {
        // La copie locale reste disponible si Google Sheets est temporairement indisponible.
    }
}

async function fetchGoogleSheetQuestions() {
    const url = `${googleSheetEndpoint}?type=questions&refresh=${Date.now()}`;

    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const response = await fetch(url, { cache: "no-store" });
            if (!response.ok) throw new Error(`Google Sheets HTTP ${response.status}`);
            return await response.json();
        } catch (error) {
            if (attempt === 2) throw error;
            await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
        }
    }
}

async function loadQuestionsFromGoogleSheet() {
    if (!googleSheetEndpoint) return false;

    try {
        const data = await fetchGoogleSheetQuestions();

        if (!Array.isArray(data.questions)) return false;

        const localQuestions = Object.entries(questionsBank).flatMap(([themeId, theme]) =>
            theme.questions.map((question, index) => ({
                id: question.id || `${themeId}-${index + 1}`,
                themeId,
                q: question.q,
                r: question.r,
                correct: question.correct
            }))
        );

        if (data.questions.length >= localQuestions.length) {
            applyRemoteQuestions(data.questions);
            questionSourceReady = true;
            return true;
        }

        await syncQuestionMutation({ action: "seed", force: true, questions: localQuestions });
        const verifyData = await fetchGoogleSheetQuestions();
        if (!Array.isArray(verifyData.questions) || verifyData.questions.length === 0) return false;

        applyRemoteQuestions(verifyData.questions);
        questionSourceReady = true;
        return true;
    } catch {
        return false;
    }
}

function updateThemeQuestionCounts() {
    document.querySelectorAll(".btn-theme").forEach(button => {
        const themeId = button.dataset.theme;
        const count = themeId === "all"
            ? getAllQuestions().length
            : getQuestionPool(themeId).length;
        const label = button.dataset.label || button.innerText.trim();
        const quantityInput = document.getElementById(`qty-${themeId}`);

        button.dataset.label = label.replace(/\s+\(\d+ questions?\)$/, "");
        button.innerText = `${button.dataset.label} (${count} questions)`;

        if (quantityInput) {
            quantityInput.max = count;
            quantityInput.value = Math.min(parseInt(quantityInput.value, 10) || 1, count);
        }
    });
}

async function hashPassword(password) {
    const data = new TextEncoder().encode(password);
    const hash = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
}

function syncAccountToGoogleSheet(account) {
    if (!googleSheetEndpoint) return;

    fetch(googleSheetEndpoint, {
        method: "POST",
        mode: "no-cors",
        body: JSON.stringify({
            name: account.name,
            email: account.email,
            specialty: account.specialty
        })
    }).catch(() => {});
}

function setAuthMessage(id, message) {
    document.getElementById(id).innerText = message;
}

function setAuthAudioPlaying(playing) {
    if (playing) {
        waitingConnectionAudio.play().catch(() => {
            if (authAudioRetry) return;

            const resumeAudio = () => {
                authAudioRetry = null;
                waitingConnectionAudio.play().catch(() => {});
                document.removeEventListener("pointerdown", resumeAudio);
                document.removeEventListener("keydown", resumeAudio);
            };
            authAudioRetry = resumeAudio;
            document.addEventListener("pointerdown", resumeAudio, { once: true });
            document.addEventListener("keydown", resumeAudio, { once: true });
        });
        return;
    }

    if (authAudioRetry) {
        document.removeEventListener("pointerdown", authAudioRetry);
        document.removeEventListener("keydown", authAudioRetry);
        authAudioRetry = null;
    }
    waitingConnectionAudio.pause();
    waitingConnectionAudio.currentTime = 0;
}

function playAnswerSound(isCorrect) {
    const answerAudio = isCorrect ? correctAnswerAudio : incorrectAnswerAudio;
    answerAudio.currentTime = 0;
    answerAudio.play().catch(() => {});
}

function showAuthenticatedApp(email) {
    setAuthAudioPlaying(false);
    const account = getAccounts()[email];
    document.getElementById("account-summary").innerText =
        `${account.name || "Candidat"} • ${email} • ${account.specialty}`;
    uiController.switchScreen("theme-screen");
}

function showAdminApp() {
    setAuthAudioPlaying(false);
    renderAdminAccounts();
    renderAdminQuestions();
    renderAdminResults();
    switchAdminSection("accounts");
    uiController.switchScreen("admin-screen");
}

function switchAdminSection(section) {
    document.querySelectorAll(".admin-panel").forEach(panel => {
        panel.classList.toggle("hidden", panel.id !== `admin-${section}-section`);
    });
    document.querySelectorAll(".admin-nav-btn").forEach(button => {
        button.classList.toggle("active", button.dataset.adminSection === section);
    });
}

function renderAdminAccounts() {
    const accounts = getAccounts();
    const list = document.getElementById("admin-accounts-list");
    list.innerHTML = "";

    Object.entries(accounts).forEach(([email, account]) => {
        const row = document.createElement("tr");
        const nameCell = document.createElement("td");
        const emailCell = document.createElement("td");
        const specialtyCell = document.createElement("td");
        const actionCell = document.createElement("td");
        const deleteButton = document.createElement("button");

        nameCell.innerText = account.name || "Non renseigné";
        emailCell.innerText = email;
        specialtyCell.innerText = account.specialty || "Non renseignée";
        deleteButton.type = "button";
        deleteButton.className = "admin-delete-btn";
        deleteButton.innerText = "Supprimer";
        deleteButton.addEventListener("click", () => {
            delete accounts[email];
            localStorage.setItem(accountsStorageKey, JSON.stringify(accounts));
            if (localStorage.getItem(sessionStorageKey) === email) {
                localStorage.removeItem(sessionStorageKey);
            }
            renderAdminAccounts();
        });

        actionCell.appendChild(deleteButton);
        row.append(nameCell, emailCell, specialtyCell, actionCell);
        list.appendChild(row);
    });

    document.getElementById("admin-account-count").innerText = Object.keys(accounts).length;
}

function saveCurrentThemeQuestions(themeId) {
    const overrides = getQuestionOverrides();
    overrides[themeId] = questionsBank[themeId].questions;
    localStorage.setItem(questionStorageKey, JSON.stringify(overrides));
}

function resetQuestionForm() {
    editingQuestionIndex = null;
    const selectedTheme = document.getElementById("admin-question-theme").value;
    document.getElementById("question-form").reset();
    document.getElementById("admin-question-theme").value = selectedTheme;
    document.getElementById("question-submit-btn").innerText = "Ajouter la question";
    document.getElementById("question-cancel-btn").classList.add("hidden");
    setAuthMessage("question-message", "");
}

function renderAdminQuestions() {
    const themeId = document.getElementById("admin-question-theme").value;
    const list = document.getElementById("admin-questions-list");
    const questions = questionsBank[themeId].questions;
    list.innerHTML = "";

    questions.forEach((question, index) => {
        const row = document.createElement("tr");
        const questionCell = document.createElement("td");
        const answersCell = document.createElement("td");
        const correctCell = document.createElement("td");
        const actionCell = document.createElement("td");
        const editButton = document.createElement("button");
        const deleteButton = document.createElement("button");

        questionCell.innerText = question.q;
        answersCell.innerText = question.r.join(" | ");
        correctCell.innerText = question.r[question.correct];
        editButton.type = "button";
        editButton.className = "admin-edit-btn";
        editButton.innerText = "Modifier";
        editButton.addEventListener("click", () => editQuestion(themeId, index));
        deleteButton.type = "button";
        deleteButton.className = "admin-delete-btn";
        deleteButton.innerText = "Supprimer";
        deleteButton.addEventListener("click", async () => {
            questions.splice(index, 1);
            saveCurrentThemeQuestions(themeId);
            if (questionSourceReady && question.id) {
                await syncQuestionMutation({ action: "delete", id: question.id });
            }
            resetQuestionForm();
            document.getElementById("admin-question-theme").value = themeId;
            renderAdminQuestions();
        });

        actionCell.append(editButton, deleteButton);
        row.append(questionCell, answersCell, correctCell, actionCell);
        list.appendChild(row);
    });
}

function editQuestion(themeId, index) {
    const question = questionsBank[themeId].questions[index];
    editingQuestionIndex = index;
    document.getElementById("admin-question-theme").value = themeId;
    document.getElementById("admin-question-text").value = question.q;
    question.r.forEach((answer, answerIndex) => {
        document.getElementById(`admin-answer-${answerIndex + 1}`).value = answer;
    });
    document.getElementById("admin-correct-answer").value = question.correct;
    document.getElementById("question-submit-btn").innerText = "Enregistrer la modification";
    document.getElementById("question-cancel-btn").classList.remove("hidden");
    setAuthMessage("question-message", "");
}

function renderAdminResults() {
    const list = document.getElementById("admin-results-list");
    const results = getResults();
    list.innerHTML = "";

    results.forEach((result, index) => {
        const row = document.createElement("tr");
        const candidateCell = document.createElement("td");
        const scoreCell = document.createElement("td");
        const answersCell = document.createElement("td");
        const dateCell = document.createElement("td");
        const actionCell = document.createElement("td");
        const deleteButton = document.createElement("button");

        candidateCell.innerText = result.email;
        scoreCell.innerText = `${result.score.toFixed(2)} / 20`;
        answersCell.innerText = `${result.correct} correcte(s), ${result.wrong} fausse(s), ${result.skipped} passée(s)`;
        dateCell.innerText = result.date;
        deleteButton.type = "button";
        deleteButton.className = "admin-delete-btn";
        deleteButton.innerText = "Supprimer";
        deleteButton.addEventListener("click", () => {
            results.splice(index, 1);
            localStorage.setItem(resultsStorageKey, JSON.stringify(results));
            renderAdminResults();
        });

        actionCell.appendChild(deleteButton);
        row.append(candidateCell, scoreCell, answersCell, dateCell, actionCell);
        list.appendChild(row);
    });
}

function renderGlobalRanking(results) {
    const section = document.getElementById("global-ranking-section");
    const list = document.getElementById("global-ranking-list");
    const bestScoresByCandidate = new Map();

    results
        .filter(result => result.theme === "all")
        .forEach(result => {
            const candidate = result.email || "Candidat inconnu";
            const currentBest = bestScoresByCandidate.get(candidate);
            if (!currentBest || result.score > currentBest.score) {
                bestScoresByCandidate.set(candidate, result);
            }
        });

    const ranking = [...bestScoresByCandidate.values()]
        .sort((first, second) => second.score - first.score)
        .slice(0, 3);

    list.innerHTML = "";
    section.classList.toggle("hidden", ranking.length === 0);

    const rankingSymbols = ["🏆", "🥈", "🥉"];

    ranking.forEach((result, index) => {
        const item = document.createElement("li");
        item.innerText = `${rankingSymbols[index]} ${result.name || result.email} — ${result.score.toFixed(2)} / 20`;
        list.appendChild(item);
    });
}

function setAuthMode(mode) {
    const isLogin = mode === "login";
    const isAdmin = mode === "admin";
    document.getElementById("login-form").classList.toggle("hidden", !isLogin);
    document.getElementById("register-form").classList.toggle("hidden", isLogin || isAdmin);
    document.getElementById("admin-form").classList.toggle("hidden", !isAdmin);
    document.querySelectorAll(".auth-tab").forEach(tab => {
        tab.classList.toggle("active", tab.dataset.authMode === mode);
    });
    setAuthAudioPlaying(true);
}

function initializeAuth() {
    setAuthMode("register");

    document.querySelectorAll(".auth-tab").forEach(tab => {
        tab.addEventListener("click", () => setAuthMode(tab.dataset.authMode));
    });

    document.getElementById("admin-access-btn").addEventListener("click", () => {
        uiController.switchScreen("auth-screen");
        setAuthMode("admin");
    });

    document.getElementById("login-form").addEventListener("submit", async event => {
        event.preventDefault();
        const email = document.getElementById("login-email").value.trim().toLowerCase();
        const password = document.getElementById("login-password").value;
        const account = getAccounts()[email];

        if (!account || account.passwordHash !== await hashPassword(password)) {
            setAuthMessage("login-message", "Adresse mail ou mot de passe incorrect.");
            return;
        }

        localStorage.setItem(sessionStorageKey, email);
        setAuthMessage("login-message", "");
        showAuthenticatedApp(email);
    });

    document.getElementById("register-form").addEventListener("submit", async event => {
        event.preventDefault();
        const name = document.getElementById("register-name").value.trim();
        const email = document.getElementById("register-email").value.trim().toLowerCase();
        const password = document.getElementById("register-password").value;
        const specialty = document.getElementById("register-specialty").value;
        const accounts = getAccounts();

        if (accounts[email] || email === adminEmail) {
            setAuthMessage("register-message", "Un compte existe déjà avec cette adresse mail.");
            return;
        }

        accounts[email] = {
            name,
            passwordHash: await hashPassword(password),
            specialty
        };
        localStorage.setItem(accountsStorageKey, JSON.stringify(accounts));
        localStorage.setItem(sessionStorageKey, email);
        syncAccountToGoogleSheet({ name, email, specialty });
        setAuthMessage("register-message", "");
        showAuthenticatedApp(email);
    });

    document.getElementById("admin-form").addEventListener("submit", event => {
        event.preventDefault();
        const email = document.getElementById("admin-email").value.trim().toLowerCase();
        const password = document.getElementById("admin-password").value;

        if (email !== adminEmail || password !== adminPassword) {
            setAuthMessage("admin-message", "Identifiant ou mot de passe administrateur incorrect.");
            return;
        }

        localStorage.setItem(adminSessionStorageKey, "true");
        setAuthMessage("admin-message", "");
        showAdminApp();
    });
}

async function initializeApp() {
    initializeAuth();
    const loadedFromDrive = await loadQuestionsFromGoogleSheet();
    if (!loadedFromDrive) applyQuestionOverrides();
    updateThemeQuestionCounts();
    renderGlobalRanking(getResults());

    const savedEmail = localStorage.getItem(sessionStorageKey);
    if (localStorage.getItem(adminSessionStorageKey) === "true") {
        showAdminApp();
    } else if (savedEmail && getAccounts()[savedEmail]) {
        showAuthenticatedApp(savedEmail);
    }

    // =========================================================
    // SÉLECTION DU THÉÂTRE D’OPÉRATION
    // =========================================================

    document.querySelectorAll(".btn-theme").forEach(btn => {
        btn.addEventListener("click", () => {
            const themeId = btn.dataset.theme;

            // Désélection visuelle
            document.querySelectorAll(".btn-theme").forEach(b => b.classList.remove("selected"));
            btn.classList.add("selected");

            selectedTheme = themeId;

            // Récupération du nombre de questions
            const qtyInput = document.getElementById(`qty-${themeId}`);
            maxQuestions = qtyInput ? parseInt(qtyInput.value, 10) : 20;

            // Activation du bouton d’engagement
            document.getElementById("start-btn").disabled = false;
        });
    });

    // =========================================================
    // DÉBUT DE LA CAMPAGNE
    // =========================================================

    document.getElementById("start-btn").addEventListener("click", () => {
        startQuiz(); // Appel sonar + moteur
    });

    document.getElementById("btn-new-mission").addEventListener("click", () => {
        uiController.switchScreen("theme-screen");
    });

    document.getElementById("logout-btn").addEventListener("click", () => {
        localStorage.removeItem(sessionStorageKey);
        uiController.switchScreen("auth-screen");
        document.getElementById("login-form").reset();
        setAuthMode("login");
    });

    document.getElementById("admin-logout-btn").addEventListener("click", () => {
        localStorage.removeItem(adminSessionStorageKey);
        uiController.switchScreen("auth-screen");
        document.getElementById("admin-form").reset();
        setAuthMode("login");
    });

    document.getElementById("admin-question-theme").addEventListener("change", () => {
        resetQuestionForm();
        renderAdminQuestions();
    });

    document.getElementById("question-cancel-btn").addEventListener("click", resetQuestionForm);

    document.getElementById("cleanup-questions-btn").addEventListener("click", async () => {
        if (!questionSourceReady) return;

        await syncQuestionMutation({ action: "cleanup" });
        setAuthMessage("question-message", "Doublons supprimés. Rechargez la liste pour actualiser les questions.");
        const loaded = await loadQuestionsFromGoogleSheet();
        if (loaded) renderAdminQuestions();
    });

    document.querySelectorAll(".admin-nav-btn").forEach(button => {
        button.addEventListener("click", () => switchAdminSection(button.dataset.adminSection));
    });

    document.getElementById("clear-results-btn").addEventListener("click", () => {
        localStorage.removeItem(resultsStorageKey);
        renderAdminResults();
    });

    document.getElementById("question-form").addEventListener("submit", async event => {
        event.preventDefault();
        const themeId = document.getElementById("admin-question-theme").value;
        const question = {
            id: editingQuestionIndex === null
                ? crypto.randomUUID()
                : questionsBank[themeId].questions[editingQuestionIndex].id,
            q: document.getElementById("admin-question-text").value.trim(),
            r: [1, 2, 3, 4].map(answerIndex =>
                document.getElementById(`admin-answer-${answerIndex}`).value.trim()
            ),
            correct: parseInt(document.getElementById("admin-correct-answer").value, 10)
        };
        const questions = questionsBank[themeId].questions;

        if (editingQuestionIndex === null) {
            questions.push(question);
            if (questionSourceReady) {
                await syncQuestionMutation({
                    action: "create",
                    question: { ...question, themeId }
                });
            }
        } else {
            questions[editingQuestionIndex] = question;
            if (questionSourceReady) {
                await syncQuestionMutation({
                    action: "update",
                    id: question.id,
                    question: { ...question, themeId }
                });
            }
        }

        saveCurrentThemeQuestions(themeId);
        document.getElementById("admin-question-theme").value = themeId;
        setAuthMessage("question-message", "Question enregistrée.");
        resetQuestionForm();
        document.getElementById("admin-question-theme").value = themeId;
        renderAdminQuestions();
    });

    document.getElementById("close-app").addEventListener("click", () => {
        window.close();
        document.body.innerHTML = "<main class=\"app-closed\"><h1>Application fermée</h1></main>";
    });
}

// =========================================================
// FONCTION : LANCEMENT TACTIQUE
// =========================================================

function startQuiz() {
    const email = localStorage.getItem(sessionStorageKey) || "anonymous";
    const history = getQuestionHistory();
    const themeHistory = history[email]?.[selectedTheme] || [];
    const pool = getQuestionPool(selectedTheme);
    const currentHistory = themeHistory.filter(question =>
        pool.some(item => item.q === question)
    );
    const excludedQuestions = currentHistory.length >= pool.length ? [] : currentHistory;

    // Sélection du thème dans le moteur
    quizEngine.selectTheme(selectedTheme, maxQuestions, excludedQuestions);
    reviewItems = [];

    if (!history[email]) history[email] = {};
    history[email][selectedTheme] = [
        ...new Set([...excludedQuestions, ...quizEngine.questions.map(question => question.q)])
    ];
    localStorage.setItem(questionHistoryStorageKey, JSON.stringify(history));

    // Passage à l’écran quiz
    uiController.switchScreen("quiz-screen");

    // Affichage de la première question
    afficherSituation();
}

// =========================================================
// AFFICHAGE D’UNE SITUATION TACTIQUE
// =========================================================

function afficherSituation() {
    const q = quizEngine.getCurrent();

    document.getElementById("progress").innerText =
        `Question ${quizEngine.index + 1} / ${quizEngine.questions.length}`;

    document.getElementById("live-points").innerText =
        `Points : ${quizEngine.stats.points}`;

    document.getElementById("question").innerText = q.q;

    const optionsGrid = document.getElementById("options");
    optionsGrid.innerHTML = "";

    // Génération des options
    q.r.forEach((optionText, index) => {
        const btn = document.createElement("button");
        btn.className = "btn";
        btn.innerText = optionText;

        btn.onclick = () => {
            verrouillerOptions();
            playAnswerSound(index === q.correct);
            if (index !== q.correct) {
                reviewItems.push({
                    type: "wrong",
                    question: q.q,
                    selected: optionText,
                    correct: q.r[q.correct]
                });
            }
            const encore = quizEngine.answer(index);
            marquerBoutons(index, q.correct);

            setTimeout(() => {
                if (encore) afficherSituation();
                else bilanFinal();
            }, 900);
        };

        optionsGrid.appendChild(btn);
    });

    // Bouton skip
    const skip = document.createElement("button");
    skip.className = "btn-skip";
    skip.innerText = "Passer la situation tactique (0 pt)";
    skip.onclick = () => {
        reviewItems.push({
            type: "skipped",
            question: q.q,
            correct: q.r[q.correct]
        });
        const encore = quizEngine.answer(null);
        if (encore) afficherSituation();
        else bilanFinal();
    };

    optionsGrid.appendChild(skip);
}

// =========================================================
// VERROUILLAGE DES OPTIONS
// =========================================================

function verrouillerOptions() {
    document.querySelectorAll("#options .btn, #options .btn-skip")
        .forEach(btn => btn.disabled = true);
}

// =========================================================
// MARQUAGE VISUEL DES RÉPONSES
// =========================================================

function marquerBoutons(selected, correct) {
    const btns = document.querySelectorAll("#options .btn");

    btns[selected].classList.add(
        selected === correct ? "correct" : "incorrect"
    );

    btns[correct].classList.add("correct");
}

// =========================================================
// BILAN FINAL
// =========================================================

function bilanFinal() {
    const total = quizEngine.questions.length;
    const note = scoring.computeFinal(quizEngine.stats, total);
    const results = getResults();
    const email = localStorage.getItem(sessionStorageKey) || "Candidat inconnu";
    const account = getAccounts()[email];

    results.unshift({
        email,
        name: account?.name || email,
        theme: selectedTheme,
        score: note,
        correct: quizEngine.stats.correct,
        wrong: quizEngine.stats.wrong,
        skipped: quizEngine.stats.skipped,
        total,
        date: new Date().toLocaleString("fr-FR")
    });
    localStorage.setItem(resultsStorageKey, JSON.stringify(results));

    uiController.switchScreen("result-screen");

    document.getElementById("score-display").innerText =
        `${note.toFixed(2)} / 20`;

    document.getElementById("stat-correct").innerText = quizEngine.stats.correct;
    document.getElementById("stat-wrong").innerText = quizEngine.stats.wrong;
    document.getElementById("stat-skipped").innerText = quizEngine.stats.skipped;

    const maxPts = (total - quizEngine.stats.skipped) * 4;
    document.getElementById("stat-brut").innerText = quizEngine.stats.points;
    document.getElementById("brut-max").innerText = `/ ${maxPts}`;
    renderGlobalRanking(results);
    renderReview();
}

function renderReview() {
    const section = document.getElementById("review-section");
    const list = document.getElementById("review-list");
    list.innerHTML = "";
    section.classList.toggle("hidden", reviewItems.length === 0);

    reviewItems.forEach(item => {
        const article = document.createElement("article");
        const title = document.createElement("strong");
        const question = document.createElement("div");
        const detail = document.createElement("div");

        article.className = `review-item ${item.type}`;
        title.innerText = item.type === "wrong" ? "Réponse fausse" : "Question passée";
        question.innerText = item.question;
        detail.innerText = item.type === "wrong"
            ? `Votre réponse : ${item.selected} | Bonne réponse : ${item.correct}`
            : `Bonne réponse : ${item.correct}`;
        article.append(title, question, detail);
        list.appendChild(article);
    });
}

// =========================================================
// NOUVELLE MISSION
// =========================================================

if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initializeApp);
    } else {
        initializeApp();
    }
}

// =========================================================
// EXPORT DES FONCTIONS POUR LE SONAR
// =========================================================

export { startQuiz };
