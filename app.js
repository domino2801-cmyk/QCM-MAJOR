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
const adminSessionStorageKey = "bm4-admin-session";
const pendingSignupStorageKey = "bm4-pending-signup";
const questionStorageKey = "bm4-question-overrides-v2";
const resultsStorageKey = "bm4-results";
const questionHistoryStorageKey = "bm4-question-history";
const adminEmail = "admin@admin.fr";
const adminPassword = "delemotte";
const googleSheetEndpoint = "https://script.google.com/macros/s/AKfycbwljrsgofGfgUPpSvsBAKC3VL14VHrrquupvc6V2r9KwfBXDP-Gfh19LT9-w5s7paYJrQ/exec";
const supabaseUrl = typeof document !== "undefined"
    ? document.querySelector('meta[name="supabase-url"]')?.content?.trim() || ""
    : "";
const supabaseAnonKey = typeof document !== "undefined"
    ? document.querySelector('meta[name="supabase-anon-key"]')?.content?.trim() || ""
    : "";
const supabaseProfilesRlsVerified = typeof document !== "undefined"
    ? document.querySelector('meta[name="supabase-profiles-rls"]')?.content?.trim() === "verified"
    : false;
const supabaseAuthListeners = new Set();
const supabase = supabaseUrl && supabaseAnonKey
    ? { auth: {} }
    : null;
let editingQuestionIndex = null;
let authAudioRetry = null;
let currentAuthenticatedAccount = null;
let currentSupabaseSession = null;
let cachedAccounts = {};
let successAction = () => {
    uiController.switchScreen("auth-screen");
    showAuthView("login");
};
const waitingConnectionAudio = new Audio("public/audio/ATTENTE%20CONNECTION.mp3");
waitingConnectionAudio.loop = true;
waitingConnectionAudio.preload = "auto";
const correctAnswerAudio = new Audio("public/audio/BONNE%20REPONSE.mp3");
correctAnswerAudio.preload = "auto";
const incorrectAnswerAudio = new Audio("public/audio/MAUVAISE%20REPONSE.mp3");
incorrectAnswerAudio.preload = "auto";

function getStoredJson(storage, key, fallback) {
    try {
        return JSON.parse(storage.getItem(key) || JSON.stringify(fallback));
    } catch {
        return fallback;
    }
}

function getStoredSupabaseSession() {
    return currentSupabaseSession;
}

function setStoredSupabaseSession(session) {
    currentSupabaseSession = session;
}

function clearStoredSupabaseSession() {
    currentSupabaseSession = null;
}

function buildSupabaseHeaders({ accessToken, withJson = false, extraHeaders = {} } = {}) {
    const headers = {
        apikey: supabaseAnonKey,
        ...extraHeaders
    };

    if (withJson) headers["Content-Type"] = "application/json";
    if (accessToken) headers.Authorization = "Bearer " + accessToken;

    return headers;
}

async function supabaseAuthRequest(path, { method = "GET", body, accessToken, redirect_to } = {}) {
    const response = await fetch(`${supabaseUrl}/auth/v1${path}`, {
        method,
        headers: buildSupabaseHeaders({
            accessToken,
            withJson: Boolean(body),
            extraHeaders: redirect_to ? { redirect_to } : {}
        }),
        body: body ? JSON.stringify(body) : undefined
    });
    const data = response.status === 204 ? null : await response.json().catch(() => null);

    if (!response.ok) {
        throw new Error(data?.msg || data?.error_description || data?.error || `Supabase Auth HTTP ${response.status}`);
    }

    return data;
}

async function supabaseRestRequest(path, { method = "GET", body, accessToken, prefer } = {}) {
    const response = await fetch(`${supabaseUrl}/rest/v1${path}`, {
        method,
        headers: buildSupabaseHeaders({
            accessToken,
            withJson: Boolean(body),
            extraHeaders: {
                Accept: "application/json",
                ...(prefer ? { Prefer: prefer } : {})
            }
        }),
        body: body ? JSON.stringify(body) : undefined
    });
    const data = response.status === 204 ? null : await response.json().catch(() => null);

    if (!response.ok) {
        throw new Error(
            data?.details
            || data?.hint
            || data?.message
            || data?.error
            || `Supabase REST HTTP ${response.status}`
        );
    }

    return data;
}

async function fetchSupabaseUser(accessToken) {
    return supabaseAuthRequest("/user", { accessToken });
}

function storeSupabaseSessionFromAuthResponse(data, typeOverride, { persist = true } = {}) {
    if (!data?.access_token) {
        return {
            user: data?.user || null,
            session: null
        };
    }

    const session = {
        access_token: data.access_token,
        refresh_token: data.refresh_token || null,
        expires_in: data.expires_in || null,
        expires_at: data.expires_at || (data.expires_in ? Math.floor(Date.now() / 1000) + data.expires_in : null),
        token_type: data.token_type || "bearer",
        type: typeOverride || data.type || null,
        user: data.user || null
    };

    if (persist) {
        setStoredSupabaseSession(session);
    }

    return {
        user: session.user,
        session
    };
}

function emitSupabaseAuthStateChange(event, session) {
    supabaseAuthListeners.forEach(listener => listener(event, session));
}

async function syncSupabaseSessionFromUrl() {
    if (!hasSupabaseAuth()) return;

    const hash = window.location.hash.startsWith("#")
        ? window.location.hash.slice(1)
        : window.location.hash;
    const hashParams = new URLSearchParams(hash);
    const accessToken = hashParams.get("access_token");

    if (!accessToken) return;

    const type = hashParams.get("type");
    const user = await fetchSupabaseUser(accessToken).catch(() => null);
    const session = {
        access_token: accessToken,
        refresh_token: hashParams.get("refresh_token"),
        expires_in: Number(hashParams.get("expires_in") || 0) || null,
        expires_at: Number(hashParams.get("expires_at") || 0) || null,
        token_type: hashParams.get("token_type") || "bearer",
        type,
        user
    };

    setStoredSupabaseSession(session);
    emitSupabaseAuthStateChange(type === "recovery" ? "PASSWORD_RECOVERY" : "SIGNED_IN", session);
}

if (supabase) {
    supabase.auth.signUp = async ({ email, password, options = {} }) => {
        const data = await supabaseAuthRequest("/signup", {
            method: "POST",
            body: {
                email,
                password,
                data: options.data || {}
            }
        });
        const user = data?.user || (data?.access_token ? await fetchSupabaseUser(data.access_token).catch(() => null) : null);
        const stored = storeSupabaseSessionFromAuthResponse({ ...data, user }, undefined, { persist: false });
        return { data: stored, error: null };
    };

    supabase.auth.signInWithPassword = async ({ email, password }) => {
        const data = await supabaseAuthRequest("/token?grant_type=password", {
            method: "POST",
            body: { email, password }
        });
        const user = data?.user || (data?.access_token ? await fetchSupabaseUser(data.access_token).catch(() => null) : null);
        const stored = storeSupabaseSessionFromAuthResponse({ ...data, user });
        emitSupabaseAuthStateChange("SIGNED_IN", stored.session);
        return { data: stored, error: null };
    };

    supabase.auth.verifyOtp = async ({ email, token, type }) => {
        const data = await supabaseAuthRequest("/verify", {
            method: "POST",
            body: { email, token, type }
        });
        const user = data?.user || (data?.access_token ? await fetchSupabaseUser(data.access_token).catch(() => null) : null);
        const stored = storeSupabaseSessionFromAuthResponse({ ...data, user }, type);
        emitSupabaseAuthStateChange("SIGNED_IN", stored.session);
        return { data: stored, error: null };
    };

    supabase.auth.refreshSession = async refreshToken => {
        const data = await supabaseAuthRequest("/token?grant_type=refresh_token", {
            method: "POST",
            body: { refresh_token: refreshToken }
        });
        const user = data?.user || (data?.access_token ? await fetchSupabaseUser(data.access_token).catch(() => null) : null);
        const stored = storeSupabaseSessionFromAuthResponse({ ...data, user });
        return { data: stored, error: null };
    };

    supabase.auth.resetPasswordForEmail = async (email, { redirect_to } = {}) => {
        await supabaseAuthRequest("/recover", {
            method: "POST",
            body: { email },
            redirect_to
        });
        return { data: {}, error: null };
    };

    supabase.auth.updateUser = async payload => {
        const session = getStoredSupabaseSession();
        const data = await supabaseAuthRequest("/user", {
            method: "PUT",
            accessToken: session?.access_token,
            body: payload
        });
        const nextSession = {
            ...session,
            user: data.user || session?.user || null
        };
        setStoredSupabaseSession(nextSession);
        return { data, error: null };
    };

    supabase.auth.signOut = async () => {
        const session = getStoredSupabaseSession();
        if (session?.access_token) {
            await supabaseAuthRequest("/logout", {
                method: "POST",
                accessToken: session.access_token
            });
        }
        clearStoredSupabaseSession();
        emitSupabaseAuthStateChange("SIGNED_OUT", null);
        return { error: null };
    };

    supabase.auth.getSession = async () => {
        const session = getStoredSupabaseSession();
        if (!session?.access_token) {
            return { data: { session: null }, error: null };
        }

        const user = await fetchSupabaseUser(session.access_token).catch(() => null);
        if (!user) {
            if (session.refresh_token) {
                try {
                    return await supabase.auth.refreshSession(session.refresh_token);
                } catch {
                    clearStoredSupabaseSession();
                    return { data: { session: null }, error: null };
                }
            }
            clearStoredSupabaseSession();
            return { data: { session: null }, error: null };
        }

        const updatedSession = { ...session, user };
        setStoredSupabaseSession(updatedSession);
        return { data: { session: updatedSession }, error: null };
    };

    supabase.auth.onAuthStateChange = callback => {
        supabaseAuthListeners.add(callback);
        return {
            data: {
                subscription: {
                    unsubscribe() {
                        supabaseAuthListeners.delete(callback);
                    }
                }
            }
        };
    };
}

function getAccounts() {
    return cachedAccounts;
}

function getPendingSignup() {
    return getStoredJson(sessionStorage, pendingSignupStorageKey, null);
}

function setPendingSignup(payload) {
    sessionStorage.setItem(pendingSignupStorageKey, JSON.stringify(payload));
}

function clearPendingSignup() {
    sessionStorage.removeItem(pendingSignupStorageKey);
}

function getQuestionOverrides() {
    return getStoredJson(localStorage, questionStorageKey, {});
}

function getResults() {
    return getStoredJson(localStorage, resultsStorageKey, []);
}

function getQuestionHistory() {
    return getStoredJson(localStorage, questionHistoryStorageKey, {});
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

function hasSupabaseAuth() {
    return Boolean(supabase);
}

function normalizeEmail(email) {
    return email.trim().toLowerCase();
}

function getCandidateLabel(account, candidateId) {
    return account?.name || `Candidat ${candidateId.slice(0, 8)}`;
}

function clearAuthMessages() {
    [
        "login-message",
        "register-message",
        "otp-message",
        "reset-request-message",
        "reset-password-message",
        "admin-message"
    ].forEach(id => setAuthMessage(id, ""));
}

function cacheAccount(account) {
    if (!account?.email) return;

    cachedAccounts[account.email] = {
        id: account.id || cachedAccounts[account.email]?.id || null,
        email: account.email,
        name: account.name || "",
        specialty: account.specialty || ""
    };
}

function getRecoveryRedirectUrl() {
    const url = new URL(window.location.href);
    url.searchParams.set("auth", "recovery");
    url.hash = "";
    return url.toString();
}

function isRecoveryModeFromUrl() {
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get("auth") === "recovery") return true;

    const hash = window.location.hash.startsWith("#")
        ? window.location.hash.slice(1)
        : window.location.hash;
    const hashParams = new URLSearchParams(hash);
    return hashParams.get("type") === "recovery";
}

function clearRecoveryUrlState() {
    const url = new URL(window.location.href);
    url.searchParams.delete("auth");
    url.hash = "";
    window.history.replaceState({}, document.title, `${url.pathname}${url.search}`);
}

function buildAccountFromUser(user, fallback = {}) {
    return {
        id: user?.id || fallback.id || null,
        email: normalizeEmail(user?.email || fallback.email || ""),
        name: user?.user_metadata?.name || fallback.name || "",
        specialty: user?.user_metadata?.specialty || fallback.specialty || ""
    };
}

async function fetchProfileForUser(user) {
    const fallback = buildAccountFromUser(user);

    if (!supabase || !user) return fallback;

    try {
        const query = new URLSearchParams({
            id: `eq.${user.id}`,
            select: "id,email,name,specialty"
        });
        const data = await supabaseRestRequest(`/profiles?${query.toString()}`, {
            accessToken: getStoredSupabaseSession()?.access_token
        });
        const profile = Array.isArray(data) ? data[0] : null;

        if (!profile) return fallback;

        return {
            ...fallback,
            id: profile.id || fallback.id,
            email: normalizeEmail(profile.email || fallback.email || ""),
            name: profile.name || fallback.name,
            specialty: profile.specialty || fallback.specialty
        };
    } catch {
        return fallback;
    }
}

async function upsertProfileForUser(user, profile = {}) {
    const account = buildAccountFromUser(user, profile);

    if (supabase && user?.id) {
        if (!supabaseProfilesRlsVerified) {
            throw new Error("Configuration Supabase incomplète : confirmez la protection RLS du profil avant l’activation.");
        }

        await supabaseRestRequest("/profiles?on_conflict=id", {
            method: "POST",
            accessToken: getStoredSupabaseSession()?.access_token,
            prefer: "resolution=merge-duplicates,return=representation",
            body: [{
                id: user.id,
                email: account.email,
                name: account.name,
                specialty: account.specialty
            }]
        });
    }

    cacheAccount(account);
    return account;
}

async function finalizeAuthenticatedUser(user, fallback = {}) {
    const account = await fetchProfileForUser(user);
    const mergedAccount = {
        ...fallback,
        ...account,
        email: normalizeEmail(fallback.email || account.email || user?.email || "")
    };

    currentAuthenticatedAccount = mergedAccount;
    cacheAccount(mergedAccount);
    showAuthenticatedApp(mergedAccount.email, mergedAccount);
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

function showAuthenticatedApp(email, account = getAccounts()[email] || {}) {
    setAuthAudioPlaying(false);
    document.getElementById("account-summary").innerText =
        `${account.name || "Candidat"} • ${email} • ${account.specialty || "Spécialité non renseignée"}`;
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
        deleteButton.innerText = "Retirer du cache";
        deleteButton.addEventListener("click", () => {
            delete accounts[email];
            if (currentAuthenticatedAccount?.email === email) {
                currentAuthenticatedAccount = null;
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

        candidateCell.innerText = result.label || result.name || result.email || "Candidat inconnu";
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
            const candidate = result.candidateId || result.label || result.email || "Candidat inconnu";
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
        item.innerText = `${rankingSymbols[index]} ${result.label || result.name || result.email || "Candidat inconnu"} — ${result.score.toFixed(2)} / 20`;
        list.appendChild(item);
    });
}

function setTerminalState(label) {
    document.getElementById("auth-terminal-state").innerText = label;
}

function showAuthView(view, options = {}) {
    const views = ["login", "register", "otp", "reset", "success", "admin"];
    views.forEach(currentView => {
        const viewElement = document.getElementById(currentView === "admin" ? "admin-form" : `${currentView}-view`);
        viewElement.classList.toggle("hidden", currentView !== view);
    });

    document.querySelectorAll(".auth-tab").forEach(tab => {
        tab.classList.toggle("active", tab.dataset.authMode === view);
    });

    if (view === "reset") {
        const isPasswordUpdate = options.resetMode === "update";
        document.getElementById("reset-request-form").classList.toggle("hidden", isPasswordUpdate);
        document.getElementById("reset-password-form").classList.toggle("hidden", !isPasswordUpdate);
        document.getElementById("reset-copy").innerText = isPasswordUpdate
            ? "Définissez un nouveau mot de passe pour finaliser la récupération du compte."
            : "Renseignez votre adresse email pour recevoir un lien de réinitialisation.";
        setTerminalState(isPasswordUpdate ? "MODE RESET RECOVERY" : "MODE RESET REQUEST");
    } else if (view === "otp") {
        document.getElementById("otp-email-display").innerText = options.email || getPendingSignup()?.email || "";
        setTerminalState("MODE OTP VERIFY");
        const codeInputs = [...document.querySelectorAll(".otp-digit")];
        if (codeInputs.length > 0) codeInputs[0].focus();
    } else if (view === "success") {
        document.getElementById("success-copy").innerText = options.message || "Opération terminée avec succès.";
        document.getElementById("success-action-btn").innerText = options.actionLabel || "Retour à la connexion";
        successAction = options.onAction || (() => {
            uiController.switchScreen("auth-screen");
            showAuthView("login");
        });
        setTerminalState("MODE SUCCESS");
    } else if (view === "register") {
        setTerminalState("MODE REGISTER");
    } else if (view === "admin") {
        setTerminalState("MODE ADMIN");
    } else {
        setTerminalState("MODE LOGIN");
    }

    if (view !== "admin") {
        setAuthAudioPlaying(true);
    }
}

function ensureSupabaseConfigured(messageId) {
    const configMessage = document.getElementById("auth-config-message");
    const configured = hasSupabaseAuth();
    configMessage.classList.toggle("hidden", configured);

    if (!configured && messageId) {
        setAuthMessage(messageId, "Configuration Supabase manquante. Renseignez les balises meta de connexion.");
    }

    return configured;
}

function getFriendlyAuthError(error, fallbackMessage) {
    const message = error?.message?.toLowerCase?.() || "";

    if (message.includes("invalid login credentials")) {
        return "Adresse mail ou mot de passe incorrect.";
    }
    if (message.includes("email not confirmed")) {
        return "Adresse mail non confirmée. Validez d’abord le code OTP reçu par email.";
    }
    if (message.includes("already registered") || message.includes("already been registered")) {
        return "Un compte existe déjà avec cette adresse mail.";
    }
    if (message.includes("password should be at least")) {
        return "Le mot de passe doit contenir au moins 6 caractères.";
    }
    if (message.includes("token has expired") || message.includes("otp expired")) {
        return "Le code ou le lien de vérification a expiré. Demandez une nouvelle procédure.";
    }
    if (message.includes("invalid token") || message.includes("token")) {
        return "Code OTP ou lien de récupération invalide.";
    }
    if (message.includes("network")) {
        return "Connexion impossible au service d’authentification.";
    }

    return fallbackMessage;
}

function clearOtpInputs() {
    document.querySelectorAll(".otp-digit").forEach(input => {
        input.value = "";
    });
}

function getOtpValue() {
    return [...document.querySelectorAll(".otp-digit")]
        .map(input => input.value.trim())
        .join("");
}

function initializeOtpInputs() {
    const codeInputs = [...document.querySelectorAll(".otp-digit")];

    codeInputs.forEach((input, index) => {
        input.addEventListener("input", event => {
            event.target.value = event.target.value.replace(/\D/g, "").slice(0, 1);
            if (event.target.value && codeInputs[index + 1]) {
                codeInputs[index + 1].focus();
            }
        });

        input.addEventListener("keydown", event => {
            if (event.key === "Backspace" && !input.value && codeInputs[index - 1]) {
                codeInputs[index - 1].focus();
            }
        });

        input.addEventListener("paste", event => {
            const pasted = event.clipboardData?.getData("text")?.replace(/\D/g, "").slice(0, codeInputs.length) || "";
            if (!pasted) return;

            event.preventDefault();
            pasted.split("").forEach((character, pastedIndex) => {
                if (codeInputs[pastedIndex]) {
                    codeInputs[pastedIndex].value = character;
                }
            });

            const focusTarget = codeInputs[Math.min(pasted.length, codeInputs.length) - 1];
            focusTarget?.focus();
        });
    });
}

async function restoreSupabaseSession() {
    if (!hasSupabaseAuth()) return;

    const { data } = await supabase.auth.getSession();
    const session = data.session;

    if (!session?.user) return;
    if (isRecoveryModeFromUrl()) {
        uiController.switchScreen("auth-screen");
        showAuthView("reset", { resetMode: "update" });
        return;
    }

    await finalizeAuthenticatedUser(session.user, {
        email: currentAuthenticatedAccount?.email || session.user?.email || ""
    });
}

function initializeAuth() {
    showAuthView("login");
    ensureSupabaseConfigured();
    initializeOtpInputs();

    document.querySelectorAll(".auth-tab").forEach(tab => {
        tab.addEventListener("click", () => {
            clearAuthMessages();
            showAuthView(tab.dataset.authMode);
        });
    });

    document.getElementById("success-action-btn").addEventListener("click", async () => {
        try {
            await successAction();
        } catch (error) {
            setAuthMessage("login-message", getFriendlyAuthError(error, "Impossible de finaliser cette étape."));
            uiController.switchScreen("auth-screen");
            showAuthView("login");
        }
    });

    document.getElementById("admin-access-btn").addEventListener("click", () => {
        clearAuthMessages();
        uiController.switchScreen("auth-screen");
        showAuthView("admin");
    });

    document.getElementById("login-forgot-password-btn").addEventListener("click", () => {
        clearAuthMessages();
        document.getElementById("reset-email").value = document.getElementById("login-email").value.trim();
        showAuthView("reset", { resetMode: "request" });
    });

    document.getElementById("register-forgot-password-btn").addEventListener("click", () => {
        clearAuthMessages();
        document.getElementById("reset-email").value = document.getElementById("register-email").value.trim();
        showAuthView("reset", { resetMode: "request" });
    });

    document.getElementById("otp-back-btn").addEventListener("click", () => {
        clearAuthMessages();
        clearOtpInputs();
        showAuthView("register");
    });

    document.getElementById("reset-back-btn").addEventListener("click", () => {
        clearAuthMessages();
        currentAuthenticatedAccount = null;
        clearRecoveryUrlState();
        showAuthView("login");
    });

    document.getElementById("login-form").addEventListener("submit", async event => {
        event.preventDefault();
        if (!ensureSupabaseConfigured("login-message")) return;

        const email = normalizeEmail(document.getElementById("login-email").value);
        const password = document.getElementById("login-password").value;
        try {
            const { data } = await supabase.auth.signInWithPassword({ email, password });

            if (!data.user) {
                setAuthMessage("login-message", "Adresse mail ou mot de passe incorrect.");
                return;
            }

            clearAuthMessages();
            await finalizeAuthenticatedUser(data.user, { email });
        } catch (error) {
            setAuthMessage("login-message", getFriendlyAuthError(error, "Adresse mail ou mot de passe incorrect."));
        }
    });

    document.getElementById("register-form").addEventListener("submit", async event => {
        event.preventDefault();
        if (!ensureSupabaseConfigured("register-message")) return;

        const name = document.getElementById("register-name").value.trim();
        const email = normalizeEmail(document.getElementById("register-email").value);
        const password = document.getElementById("register-password").value;
        const specialty = document.getElementById("register-specialty").value.trim();

        if (!name || !specialty) {
            setAuthMessage("register-message", "Tous les champs du profil candidat sont requis.");
            return;
        }

        try {
            await supabase.auth.signUp({
                email,
                password,
                options: {
                    data: { name, specialty }
                }
            });

            setPendingSignup({ name, email, specialty });
            clearAuthMessages();
            clearOtpInputs();
            showAuthView("otp", { email });
        } catch (error) {
            setAuthMessage("register-message", getFriendlyAuthError(error, "Impossible de créer le compte."));
        }
    });

    document.getElementById("otp-form").addEventListener("submit", async event => {
        event.preventDefault();
        if (!ensureSupabaseConfigured("otp-message")) return;

        const pendingSignup = getPendingSignup();
        const email = normalizeEmail(pendingSignup?.email || document.getElementById("otp-email-display").innerText || "");
        const token = getOtpValue();

        if (!email || token.length !== 6) {
            setAuthMessage("otp-message", "Saisissez le code OTP reçu par email.");
            return;
        }

        try {
            const { data } = await supabase.auth.verifyOtp({
                email,
                token,
                type: "signup"
            });

            if (!data.user) {
                setAuthMessage("otp-message", "Code OTP invalide ou expiré.");
                return;
            }

            const account = await upsertProfileForUser(data.user, pendingSignup || { email });
            clearPendingSignup();
            clearAuthMessages();
            clearOtpInputs();
            showAuthView("success", {
                message: "Compte vérifié. Votre profil Supabase est maintenant actif.",
                actionLabel: "Accéder à la préparation",
                onAction: async () => {
                    await finalizeAuthenticatedUser(data.user, account);
                }
            });
        } catch (error) {
            setAuthMessage("otp-message", getFriendlyAuthError(error, "Compte vérifié, mais le profil n’a pas pu être finalisé."));
        }
    });

    document.getElementById("reset-request-form").addEventListener("submit", async event => {
        event.preventDefault();
        if (!ensureSupabaseConfigured("reset-request-message")) return;

        const email = normalizeEmail(document.getElementById("reset-email").value);
        try {
            await supabase.auth.resetPasswordForEmail(email, {
                redirect_to: getRecoveryRedirectUrl()
            });

            clearAuthMessages();
            showAuthView("success", {
                message: "Lien de récupération envoyé. Ouvrez l’email reçu puis revenez dans l’application pour définir un nouveau mot de passe.",
                actionLabel: "Retour à la connexion",
                onAction: () => {
                    showAuthView("login");
                }
            });
        } catch (error) {
            setAuthMessage("reset-request-message", getFriendlyAuthError(error, "Impossible d’envoyer le lien de récupération."));
        }
    });

    document.getElementById("reset-password-form").addEventListener("submit", async event => {
        event.preventDefault();
        if (!ensureSupabaseConfigured("reset-password-message")) return;

        const password = document.getElementById("reset-password").value;
        const confirmation = document.getElementById("reset-password-confirmation").value;

        if (password.length < 6) {
            setAuthMessage("reset-password-message", "Le mot de passe doit contenir au moins 6 caractères.");
            return;
        }

        if (password !== confirmation) {
            setAuthMessage("reset-password-message", "Les mots de passe saisis ne correspondent pas.");
            return;
        }

        try {
            await supabase.auth.updateUser({ password });
            await supabase.auth.signOut();
            currentAuthenticatedAccount = null;
            clearPendingSignup();
            clearRecoveryUrlState();
            document.getElementById("reset-password-form").reset();
            clearAuthMessages();
            showAuthView("success", {
                message: "Mot de passe mis à jour. Reconnectez-vous avec votre nouveau mot de passe.",
                actionLabel: "Retour à la connexion",
                onAction: () => {
                    showAuthView("login");
                }
            });
        } catch (error) {
            setAuthMessage("reset-password-message", getFriendlyAuthError(error, "Impossible de mettre à jour le mot de passe."));
        }
    });

    document.getElementById("admin-form").addEventListener("submit", event => {
        event.preventDefault();
        const email = normalizeEmail(document.getElementById("admin-email").value);
        const password = document.getElementById("admin-password").value;

        if (email !== adminEmail || password !== adminPassword) {
            setAuthMessage("admin-message", "Identifiant ou mot de passe administrateur incorrect.");
            return;
        }

        localStorage.setItem(adminSessionStorageKey, "true");
        setAuthMessage("admin-message", "");
        showAdminApp();
    });

    if (hasSupabaseAuth()) {
        supabase.auth.onAuthStateChange(event => {
            if (event === "PASSWORD_RECOVERY") {
                localStorage.removeItem(adminSessionStorageKey);
                uiController.switchScreen("auth-screen");
                currentAuthenticatedAccount = null;
                clearAuthMessages();
                showAuthView("reset", { resetMode: "update" });
            }
        });
    }
}

async function initializeApp() {
    initializeAuth();
    const loadedFromDrive = await loadQuestionsFromGoogleSheet();
    if (!loadedFromDrive) applyQuestionOverrides();
    updateThemeQuestionCounts();
    renderGlobalRanking(getResults());
    initializeAppInteractions();
    await syncSupabaseSessionFromUrl();

    if (isRecoveryModeFromUrl()) {
        localStorage.removeItem(adminSessionStorageKey);
    }

    if (localStorage.getItem(adminSessionStorageKey) === "true") {
        showAdminApp();
    } else {
        await restoreSupabaseSession();
    }

    if (isRecoveryModeFromUrl()) {
        uiController.switchScreen("auth-screen");
        currentAuthenticatedAccount = null;
        showAuthView("reset", { resetMode: "update" });
    }
}

async function initializeAppInteractions() {
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

    document.getElementById("logout-btn").addEventListener("click", async () => {
        if (supabase) {
            try {
                await supabase.auth.signOut();
            } catch {
                window.alert("La révocation de session a échoué. Réessayez.");
                return;
            }
        }
        currentAuthenticatedAccount = null;
        clearPendingSignup();
        uiController.switchScreen("auth-screen");
        document.getElementById("login-form").reset();
        showAuthView("login");
    });

    document.getElementById("admin-logout-btn").addEventListener("click", () => {
        localStorage.removeItem(adminSessionStorageKey);
        uiController.switchScreen("auth-screen");
        document.getElementById("admin-form").reset();
        showAuthView("login");
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
    const email = currentAuthenticatedAccount?.email || "anonymous";
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

async function bilanFinal() {
    const total = quizEngine.questions.length;
    const note = scoring.computeFinal(quizEngine.stats, total);
    const results = getResults();
    const email = currentAuthenticatedAccount?.email || "Candidat inconnu";
    const account = currentAuthenticatedAccount || getAccounts()[email];
    const candidateId = account?.id || "candidat-inconnu";
    const label = getCandidateLabel(account, candidateId);

    results.unshift({
        candidateId,
        label,
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
