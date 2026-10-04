// =========================================================
// APP.JS — POINT D’ENTRÉE TACTIQUE DE L’APPLICATION BM4
// =========================================================

// Importation des modules (à créer dans /modules/)
import { quizEngine } from "./modules/quiz-engine/index.js";
import { scoring } from "./modules/quiz-engine/scoring.js";
import { questionsBank, getAllQuestions } from "./modules/questions-bank/index.js?v=20261004";
import { getQuestionTheme, reconcileQuestionThemes } from "./modules/questions-bank/theme-concordance.js";
import { showStartupRecoveryState } from "./modules/startup-recovery/index.js";
import { uiController } from "./modules/ui-controller/index.js";
import {
    reportNotificationsEnabled,
    enableReportNotifications,
    disableReportNotifications
} from "./modules/report-notifications/index.js";

// =========================================================
// VARIABLES D’ÉTAT
// =========================================================

let selectedTheme = null;
let maxQuestions = 0;
let quizFeedbackMode = "training";
let reviewItems = [];
let questionTransitionLocked = false;
let displayedQuestion = null;
let currentQuizRunId = 0;
let finalizedQuizRunId = -1;
let questionSourceReady = false;
const pendingSignupStorageKey = "bm4-pending-signup";
const questionStorageKey = "bm4-question-overrides-v2";
const resultsStorageKey = "bm4-results";
const resultsSyncStorageKey = "bm4-results-sync-v1";
const publicRankingStorageKey = "bm4-public-ranking-v1";
const questionHistoryStorageKey = "bm4-question-history";
const supabaseSessionStorageKey = "bm4-supabase-session";
const specialtyLabels = {
    INF: "INF - Infanterie",
    BLD: "BLD - Combat des blindés",
    ART: "ART - Artillerie",
    GEN: "GEN - Génie",
    AER: "AER - Aéromobilité (ALAT)",
    EMP: "EMP - Emploi des forces",
    SIC: "SIC - Systèmes d'information et de communication",
    CYB: "CYB - Cybersécurité et cyberdéfense",
    RENS: "RENS - Renseignement",
    ADM: "ADM - Administration et gestion de soutien",
    GRH: "GRH - Gestion des ressources humaines",
    PBF: "PBF - Pilotage, budget et finances",
    MVT: "MVT - Logistique et transport",
    MAI: "MAI - Maintenance",
    COM: "COM - Communication",
    RHL: "RHL - Restauration, hôtellerie et loisirs",
    EPS: "EPS - Entraînement physique, militaire et sportif",
    SAN: "SAN - Santé",
    FSP: "FSP - Forces spéciales"
};
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
let currentCandidateEmail = "";
let currentSupabaseSession = null;
let authUiReady = false;
let cachedAccounts = {};
let resultsCache = [];
let questionReports = [];
let publicGlobalRankingCache = [];
let publicRankingRefreshPromise = null;
let publicRankingState = "loading";
const profileNotReadyErrorCode = "PROFILE_NOT_READY";
const profileLookupErrorCode = "PROFILE_LOOKUP_FAILED";
let pendingResultSync = {
    upserts: [],
    deletes: []
};
let successAction = () => {
    uiController.switchScreen("auth-screen");
    showAuthView("login");
};
let confirmOverlayResolver = null;

function showConfirmOverlay({ title, message, okLabel = "Confirmer", cancelLabel = "Annuler" }) {
    const overlay = document.getElementById("confirm-overlay");
    if (!overlay) {
        return Promise.resolve(window.confirm(message));
    }

    if (confirmOverlayResolver) {
        confirmOverlayResolver(false);
        confirmOverlayResolver = null;
    }

    document.getElementById("confirm-title").innerText = title;
    document.getElementById("confirm-message").innerText = message;
    document.getElementById("confirm-ok-btn").innerText = okLabel;
    document.getElementById("confirm-cancel-btn").innerText = cancelLabel;
    overlay.classList.remove("hidden");

    return new Promise(resolve => {
        confirmOverlayResolver = resolve;
        document.getElementById("confirm-cancel-btn").focus();
    });
}

function resolveConfirmOverlay(result) {
    const overlay = document.getElementById("confirm-overlay");
    if (overlay) {
        overlay.classList.add("hidden");
    }
    if (confirmOverlayResolver) {
        const resolve = confirmOverlayResolver;
        confirmOverlayResolver = null;
        resolve(result);
    }
}

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("confirm-ok-btn")?.addEventListener("click", () => resolveConfirmOverlay(true));
    document.getElementById("confirm-cancel-btn")?.addEventListener("click", () => resolveConfirmOverlay(false));
    document.getElementById("confirm-overlay")?.addEventListener("click", event => {
        if (event.target === event.currentTarget) {
            resolveConfirmOverlay(false);
        }
    });
    document.addEventListener("keydown", event => {
        if (event.key === "Escape" && confirmOverlayResolver) {
            resolveConfirmOverlay(false);
        }
    });
});
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
    if (currentSupabaseSession) return currentSupabaseSession;

    try {
        const storedSession = window.sessionStorage.getItem(supabaseSessionStorageKey);
        currentSupabaseSession = storedSession ? JSON.parse(storedSession) : null;
    } catch {
        currentSupabaseSession = null;
    }

    return currentSupabaseSession;
}

function setStoredSupabaseSession(session) {
    currentSupabaseSession = session;
    try {
        if (session) {
            window.sessionStorage.setItem(supabaseSessionStorageKey, JSON.stringify(session));
        } else {
            window.sessionStorage.removeItem(supabaseSessionStorageKey);
        }
    } catch {}
}

function clearStoredSupabaseSession() {
    currentSupabaseSession = null;
    try {
        window.sessionStorage.removeItem(supabaseSessionStorageKey);
    } catch {}
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
const response = await fetch(`${supabaseUrl}/auth/v1${path}${redirect_to ? (path.includes("?") ? "&" : "?") + "redirect_to=" + encodeURIComponent(redirect_to) : ""}`, {
        method,
        headers: buildSupabaseHeaders({
            accessToken,
            withJson: Boolean(body),
            extraHeaders: {}
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

async function submitQuestionReport(question, answers, themeId, details) {
    const accessToken = getStoredSupabaseSession()?.access_token;
    if (!supabase || !accessToken || !currentAuthenticatedAccount?.id) {
        throw new Error("Connectez-vous pour signaler une question.");
    }

    await supabaseRestRequest("/question_reports", {
        method: "POST",
        accessToken,
        prefer: "return=minimal",
        body: {
            question_id: question.id == null ? null : String(question.id),
            question_text: question.q,
            answers,
            correct_answer_index: question.correct,
            quiz_theme: String(themeId),
            details: details.trim() || null,
            reporter_id: currentAuthenticatedAccount.id
        }
    });
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

    window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search}`);

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
        emitSupabaseAuthStateChange("TOKEN_REFRESHED", stored.session);
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
                    const refreshed = await supabase.auth.refreshSession(session.refresh_token);
                    return {
                        data: { session: refreshed?.data?.session || null },
                        error: refreshed?.error || null
                    };
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

function createRecordId() {
    // Plusieurs tables (quiz_results, profiles, global_scores...) exigent un
    // identifiant au format UUID : même en contexte non sécurisé (HTTP), où
    // crypto.randomUUID() est indisponible, l'identifiant généré doit rester
    // un UUID valide pour que la synchronisation Supabase n'échoue pas.
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }

    if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
        const bytes = crypto.getRandomValues(new Uint8Array(16));
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;
        const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, "0"));
        return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
    }

    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, character => {
        const random = Math.random() * 16 | 0;
        const value = character === "x" ? random : (random & 0x3 | 0x8);
        return value.toString(16);
    });
}

function normalizeResultRecord(rawResult = {}) {
    if (!rawResult || typeof rawResult !== "object") return null;

    return {
        id: rawResult.id || createRecordId(),
        candidateId: rawResult.user_id || rawResult.candidate_id || rawResult.candidateId || "candidat-inconnu",
        label: rawResult.label || rawResult.name || rawResult.email || "Candidat inconnu",
        email: rawResult.email || "",
        name: rawResult.name || "",
        theme: rawResult.theme || "all",
        score: Number(rawResult.score || 0),
        correct: Number(rawResult.correct || 0),
        wrong: Number(rawResult.wrong || 0),
        skipped: Number(rawResult.skipped || 0),
        total: Number(rawResult.total || 0),
        date: rawResult.date || new Date().toLocaleString("fr-FR"),
        createdAt: rawResult.created_at || rawResult.createdAt || new Date().toISOString(),
        synced: rawResult.synced !== false
    };
}

function normalizePublicRankingRecord(rawResult = {}) {
    if (!rawResult || typeof rawResult !== "object") return null;

    const displayName = typeof rawResult.display_name === "string" && rawResult.display_name.trim()
        ? rawResult.display_name.trim()
        : rawResult.name || rawResult.label || "Candidat inconnu";
    const publicName = typeof displayName === "string" && !displayName.includes("@")
        ? displayName
        : "Pseudo non renseigné";

    return {
        id: rawResult.id || createRecordId(),
        label: publicName,
        email: "",
        name: publicName,
        theme: rawResult.theme || "all",
        score: Number(rawResult.score || 0),
        date: rawResult.date || "",
        createdAt: rawResult.created_at || rawResult.createdAt || ""
    };
}

function setResults(results) {
    resultsCache = results
        .map(normalizeResultRecord)
        .filter(Boolean)
        .sort((first, second) => String(second.createdAt).localeCompare(String(first.createdAt)));
    const localSafeResults = resultsCache.map(result => ({
        ...result,
        email: ""
    }));
    localStorage.setItem(resultsStorageKey, JSON.stringify(localSafeResults));
}

function getResults() {
    return resultsCache;
}

function setPublicGlobalRanking(results) {
    publicGlobalRankingCache = (Array.isArray(results) ? results : [])
        .map(normalizePublicRankingRecord)
        .filter(Boolean)
        .sort((first, second) => {
            const scoreDifference = second.score - first.score;
            if (scoreDifference !== 0) return scoreDifference;
            return String(first.createdAt).localeCompare(String(second.createdAt));
        })
        .slice(0, 3);
    localStorage.setItem(publicRankingStorageKey, JSON.stringify(publicGlobalRankingCache));
}

function getPublicGlobalRanking() {
    return publicGlobalRankingCache;
}

function getQuestionHistory() {
    return getStoredJson(localStorage, questionHistoryStorageKey, {});
}

function normalizeQuestionAnswers(rawAnswers) {
    const toAnswerArray = value => {
        if (Array.isArray(value)) return value;

        if (value && typeof value === "object") {
            const nestedAnswers = value.r
                ?? value.answers
                ?? value.options
                ?? value.responses
                ?? value.reponses
                ?? value["réponses"];
            const nestedAnswerArray = nestedAnswers !== undefined && nestedAnswers !== value
                ? toAnswerArray(nestedAnswers)
                : [];

            const orderedNumericValues = [0, 1, 2, 3].map(index => value[index] ?? value[String(index)]);
            const orderedOneBasedValues = [1, 2, 3, 4].map(index => value[index] ?? value[String(index)]);
            const orderedNamedValues = ["a", "b", "c", "d"].map(key =>
                value[key] ?? value[key.toUpperCase()] ?? value[`answer${key.toUpperCase()}`]
            );
            const orderedLegacyValues = [1, 2, 3, 4].map(index =>
                value[`answer${index}`]
                ?? value[`answer_${index}`]
                ?? value[`option${index}`]
                ?? value[`option_${index}`]
                ?? value[`response${index}`]
                ?? value[`response_${index}`]
                ?? value[`reponse${index}`]
                ?? value[`reponse_${index}`]
            );
            const hasAnswerValue = answer =>
                answer !== undefined && String(answer).trim() !== "";
            const pickAnswerValue = (...candidates) =>
                candidates.find(hasAnswerValue);
            const mergedHumanOrderedValues = [0, 1, 2, 3].map(index =>
                pickAnswerValue(
                    orderedOneBasedValues[index],
                    orderedNamedValues[index],
                    orderedLegacyValues[index],
                    nestedAnswerArray[index]
                )
            );
            const countDefinedAnswers = candidate =>
                candidate.filter(hasAnswerValue).length;

            const conventionCandidates = [
                orderedNumericValues,
                mergedHumanOrderedValues,
                nestedAnswerArray,
                orderedOneBasedValues,
                orderedNamedValues,
                orderedLegacyValues
            ];
            const completeCandidate = conventionCandidates.find(candidate =>
                candidate.every(hasAnswerValue)
            );
            if (completeCandidate) {
                return completeCandidate;
            }

            if (countDefinedAnswers(mergedHumanOrderedValues) >= countDefinedAnswers(orderedNumericValues)
                && mergedHumanOrderedValues.some(hasAnswerValue)) {
                return mergedHumanOrderedValues;
            }

            if (orderedNumericValues.some(hasAnswerValue)) {
                return orderedNumericValues;
            }

            if (mergedHumanOrderedValues.some(hasAnswerValue)) {
                return mergedHumanOrderedValues;
            }

            return Object.values(value);
        }

        if (typeof value === "string") {
            try {
                return toAnswerArray(JSON.parse(value));
            } catch {
                const delimitedAnswers = value
                    .split(/\s*(?:\||;|\n|•)\s*/)
                    .map(answer => answer.trim())
                    .filter(Boolean);
                if (delimitedAnswers.length > 0) {
                    return delimitedAnswers;
                }
            }
        }

        return [];
    };

    return [0, 1, 2, 3].map(index => String(toAnswerArray(rawAnswers)[index] ?? "").trim());
}

function resolveQuestionAnswers(question) {
    const candidateSources = [
        { source: question?.r, priority: 6 },
        { source: question?.answers, priority: 5 },
        { source: question?.options, priority: 4 },
        { source: question?.responses, priority: 3 },
        { source: question?.reponses, priority: 2 },
        { source: question?.["réponses"], priority: 2 },
        { source: question, priority: 1 }
    ];
    let bestAnswers = ["", "", "", ""];
    let bestScore = -1;
    let bestPriority = -1;

    for (const { source, priority } of candidateSources) {
        const answers = normalizeQuestionAnswers(source);
        const score = answers.filter(answer => answer !== "").length;

        if (score > bestScore || (score === bestScore && priority > bestPriority)) {
            bestAnswers = answers;
            bestScore = score;
            bestPriority = priority;
        }

        if (score === 4 && priority === 6) {
            return answers;
        }
    }

    return bestAnswers;
}

function getQuestionPool(themeId) {
    if (themeId === "all") return getAllQuestions();

    const themeIndex = (parseInt(themeId, 10) - 1).toString();
    return questionsBank[themeIndex]?.questions || [];
}

function normalizeQuestionHistoryKey(question) {
    return String(question || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function updateQuestionRotationStatus(themeId) {
    const status = document.getElementById("question-rotation-status");
    if (!status) return;

    const poolKeys = new Set(getQuestionPool(themeId).map(question => normalizeQuestionHistoryKey(question.q)));
    const email = currentAuthenticatedAccount?.email || currentCandidateEmail || "anonymous";
    const history = getQuestionHistory();
    const usedKeys = new Set((history[email]?.[themeId] || [])
        .map(normalizeQuestionHistoryKey)
        .filter(question => poolKeys.has(question)));
    const remaining = Math.max(poolKeys.size - usedKeys.size, 0);

    status.classList.remove("hidden");
    if (poolKeys.size === 0) {
        status.innerText = "Aucune question disponible pour ce thème. Les questions doivent être ajoutées dans l’administration.";
        return;
    }
    status.innerText = remaining === 0
        ? `Rotation complète : ${poolKeys.size} question(s) déjà utilisées. Un nouveau cycle commencera à la prochaine campagne.`
        : `${remaining} question(s) inédites disponibles sur ${poolKeys.size}.`;
}

function setConnectionStatus(message = "") {
    const status = document.getElementById("connection-status");
    if (!status) return;
    status.innerText = message;
    status.classList.toggle("hidden", !message);
}

function applyQuestionOverrides() {
    const overrides = getQuestionOverrides();
    Object.entries(overrides).forEach(([themeId, questions]) => {
        if (questionsBank[themeId] && Array.isArray(questions)) {
            questionsBank[themeId].questions = questions.map(question => ({
                ...question,
                r: normalizeQuestionAnswers(question.r)
            }));
        }
    });
    reconcileQuestionThemes(questionsBank);
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
                r: normalizeQuestionAnswers(question.r),
                correct: question.correct
            });
        }
    });
    reconcileQuestionThemes(questionsBank);
}

async function syncQuestionMutation(payload) {
    if (!supabase) return null;

    const accessToken = getStoredSupabaseSession()?.access_token;

    if (payload.action === "seed") {
            const questions = (payload.questions || []).map(question => ({
                id: question.id,
                theme_id: question.themeId,
                question: question.q,
                answer_1: question.r[0] || "",
                answer_2: question.r[1] || "",
                answer_3: question.r[2] || "",
                answer_4: question.r[3] || "",
                correct_answer: question.r[question.correct] || ""
            }));
            if (questions.length === 0) return { seeded: 0 };

            await supabaseRestRequest("/question_bank?on_conflict=id", {
                method: "POST",
                accessToken,
                prefer: "resolution=merge-duplicates,return=minimal",
                body: questions
            });
        return { seeded: questions.length };
    }

    if (payload.action === "create") {
            const question = payload.question;
            const createdRows = await supabaseRestRequest("/question_bank", {
                method: "POST",
                accessToken,
                prefer: "return=representation",
                body: [{
                    theme_id: question.themeId,
                    question: question.q,
                    answer_1: question.r[0] || "",
                    answer_2: question.r[1] || "",
                    answer_3: question.r[2] || "",
                    answer_4: question.r[3] || "",
                    correct_answer: question.r[question.correct] || ""
                }]
            });
        if (!Array.isArray(createdRows) || createdRows.length !== 1 || createdRows[0].id == null) {
            throw new Error("Supabase n’a pas confirmé la création de la question.");
        }
        return { created: true, id: String(createdRows[0].id) };
    }

    if (payload.action === "update") {
            const question = payload.question;
            if (!payload.id) throw new Error("Identifiant Supabase de la question introuvable.");
            const updatedRows = await supabaseRestRequest(`/question_bank?id=eq.${encodeURIComponent(payload.id)}`, {
                method: "PATCH",
                accessToken,
                prefer: "return=representation",
                body: {
                    theme_id: question.themeId,
                    question: question.q,
                    answer_1: question.r[0] || "",
                    answer_2: question.r[1] || "",
                    answer_3: question.r[2] || "",
                    answer_4: question.r[3] || "",
                    correct_answer: question.r[question.correct] || ""
                }
            });
        if (!Array.isArray(updatedRows) || updatedRows.length !== 1) {
            throw new Error("Supabase n’a modifié aucune question. Vérifiez son identifiant et vos droits administrateur.");
        }
        return { updated: true };
    }

    if (payload.action === "delete") {
            await supabaseRestRequest(`/question_bank?id=eq.${encodeURIComponent(payload.id)}`, {
                method: "DELETE",
                accessToken
            });
        return { deleted: true };
    }

    if (payload.action === "cleanup") {
            const data = await fetchSupabaseQuestions();
            if (!Array.isArray(data.questions)) return { removed: 0 };

            const seen = new Set();
            const duplicateIds = [];
            data.questions.forEach(question => {
                const key = String(question.q || "")
                    .trim()
                    .replace(/\s+/g, " ")
                    .toLowerCase();
                if (!key) return;
                if (seen.has(key)) {
                    duplicateIds.push(question.id);
                    return;
                }
                seen.add(key);
            });

            if (duplicateIds.length > 0) {
                const idsFilter = duplicateIds
                    .map(duplicateId => `"${String(duplicateId).replace(/"/g, "")}"`)
                    .join(",");
                await supabaseRestRequest(`/question_bank?id=in.(${idsFilter})`, {
                    method: "DELETE",
                    accessToken
                });
            }

        return { removed: duplicateIds.length };
    }

    return null;
}

async function fetchSupabaseQuestions() {
    if (!supabase) return { questions: [] };
    const accessToken = getStoredSupabaseSession()?.access_token;
    const pageSize = 1000;
    const questions = [];
    let offset = 0;

    while (true) {
        let data;
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                data = await supabaseRestRequest(
                    `/question_bank?select=id,theme_id,question,answer_1,answer_2,answer_3,answer_4,correct_answer&active=eq.true&order=id.asc&limit=${pageSize}&offset=${offset}`,
                    { accessToken }
                );
                break;
            } catch (error) {
                if (attempt === 2) throw error;
                await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
            }
        }
        if (!Array.isArray(data)) {
            throw new Error("Supabase n’a pas renvoyé une page de questions valide.");
        }

        questions.push(...data.map(question => {
            const answers = [question.answer_1, question.answer_2, question.answer_3, question.answer_4]
                .map(answer => String(answer || ""));
            const correctAnswer = String(question.correct_answer || "");
            const correctIndex = answers.findIndex(answer => answer === correctAnswer);
            const numericCorrectIndex = Number(correctAnswer);
            return {
                id: String(question.id),
                themeId: String(question.theme_id),
                q: String(question.question || ""),
                r: answers,
                correct: correctIndex >= 0
                    ? correctIndex
                    : Number.isInteger(numericCorrectIndex) && numericCorrectIndex > 0
                        ? numericCorrectIndex - 1
                        : 0
            };
        }));

        if (data.length < pageSize) break;
        offset += pageSize;
    }

    return { questions };
}

async function loadQuestionsFromSupabase() {
    if (!supabase) return false;

    try {
        const data = await fetchSupabaseQuestions();
        applyRemoteQuestions(data.questions);
        questionSourceReady = true;
        return true;
    } catch (error) {
        console.error("Chargement des questions depuis Supabase impossible", error);
        return false;
    }
}

function toSupabaseResultPayload(result, candidateColumn = "user_id") {
    return {
        id: result.id,
        [candidateColumn]: result.candidateId,
        email: result.email,
        name: result.name,
        theme: result.theme,
        score: result.score,
        correct: result.correct,
        wrong: result.wrong,
        skipped: result.skipped,
        total: result.total
    };
}

function persistPendingResultSync() {
    localStorage.setItem(resultsSyncStorageKey, JSON.stringify(pendingResultSync));
}

function queueResultUpsert(result) {
    if (!pendingResultSync.upserts.includes(result.id)) {
        pendingResultSync.upserts.push(result.id);
    }
    pendingResultSync.deletes = pendingResultSync.deletes.filter(id => id !== result.id);
    persistPendingResultSync();
}

function queueResultDelete(resultId) {
    pendingResultSync.upserts = pendingResultSync.upserts.filter(id => id !== resultId);
    if (!pendingResultSync.deletes.includes(resultId)) {
        pendingResultSync.deletes.push(resultId);
    }
    persistPendingResultSync();
}

async function flushPendingResultSync() {
    if (!supabase) return;
    const accessToken = getStoredSupabaseSession()?.access_token;
    if (!accessToken) return;

    const deleteIds = [...pendingResultSync.deletes];
    if (deleteIds.length > 0) {
        const idsFilter = deleteIds
            .map(resultId => `"${String(resultId).replace(/"/g, "")}"`)
            .join(",");
        await supabaseRestRequest(`/quiz_results?id=in.(${idsFilter})`, {
            method: "DELETE",
            accessToken
        });
        const deletedSet = new Set(deleteIds);
        pendingResultSync.deletes = pendingResultSync.deletes.filter(id => !deletedSet.has(id));
    }

    const upsertIds = [...pendingResultSync.upserts];
    const upsertResults = upsertIds
        .map(resultId => getResults().find(result => result.id === resultId))
        .filter(Boolean);
    if (upsertResults.length > 0) {
        let upserts;
        try {
            upserts = upsertResults.map(result => toSupabaseResultPayload(result, "user_id"));
            await supabaseRestRequest("/quiz_results?on_conflict=id", {
                method: "POST",
                accessToken,
                prefer: "resolution=merge-duplicates,return=minimal",
                body: upserts
            });
        } catch (primaryError) {
            try {
                upserts = upsertResults.map(result => toSupabaseResultPayload(result, "candidate_id"));
                await supabaseRestRequest("/quiz_results?on_conflict=id", {
                    method: "POST",
                    accessToken,
                    prefer: "resolution=merge-duplicates,return=minimal",
                    body: upserts
                });
            } catch {
                throw primaryError;
            }
        }
        const syncedIds = new Set(upsertResults.map(result => result.id));
        setResults(getResults().map(result => (
            syncedIds.has(result.id) ? { ...result, synced: true } : result
        )));
        pendingResultSync.upserts = pendingResultSync.upserts.filter(id => !syncedIds.has(id));
    }

    persistPendingResultSync();
}

async function loadResultsFromSupabase({ throwOnError = false } = {}) {
    if (!supabase) return false;

    try {
        const accessToken = getStoredSupabaseSession()?.access_token;
        let data;
        try {
            data = await supabaseRestRequest(
                "/quiz_results?select=id,user_id,email,name,theme,score,correct,wrong,skipped,total,created_at&order=created_at.desc",
                { accessToken }
            );
        } catch (primaryError) {
            try {
                data = await supabaseRestRequest(
                    "/quiz_results?select=id,candidate_id,email,name,theme,score,correct,wrong,skipped,total,created_at&order=created_at.desc",
                    { accessToken }
                );
            } catch {
                throw primaryError;
            }
        }
        if (!Array.isArray(data)) return false;
        const remoteResults = data
            .map(normalizeResultRecord)
            .filter(Boolean)
            .map(result => ({ ...result, synced: true }));
        const pendingDeleteIds = new Set(pendingResultSync.deletes);
        const pendingUpsertIds = new Set(pendingResultSync.upserts);
        const mergedById = new Map();
        remoteResults.forEach(result => {
            if (!pendingDeleteIds.has(result.id)) {
                mergedById.set(result.id, result);
            }
        });
        getResults()
            .filter(result => pendingUpsertIds.has(result.id))
            .forEach(result => {
                if (!pendingDeleteIds.has(result.id)) {
                    mergedById.set(result.id, { ...result, synced: false });
                }
            });
        if (getStoredSupabaseSession()?.access_token !== accessToken) {
            throw new Error("La session a changé pendant le chargement des résultats.");
        }
        setResults([...mergedById.values()]);
        await flushPendingResultSync();
        return true;
    } catch (error) {
        if (!throwOnError) return false;
        const syncError = new Error(`Lecture des résultats impossible : ${error?.message || "Supabase a refusé la lecture."}`);
        syncError.cause = error;
        throw syncError;
    }
}

async function loadPublicGlobalRanking({ throwOnError = false } = {}) {
    if (!supabase) {
        publicRankingState = "error";
        return false;
    }

    try {
        const data = await supabaseRestRequest(
            "/rpc/get_public_global_campaign_top3",
            { method: "POST" }
        );
        if (!Array.isArray(data) || data.length > 3 || data.some(row =>
            !row || typeof row.display_name !== "string"
            || typeof row.score !== "number" || !Number.isFinite(row.score)
            || (row.created_at !== null && !Number.isFinite(Date.parse(row.created_at)))
        )) throw new Error("Réponse du Top 3 public invalide.");
        setPublicGlobalRanking(data);
        publicRankingState = "ready";
        return true;
    } catch (error) {
        publicRankingState = "error";
        console.warn("Chargement du Top 3 public indisponible.", error);
        if (!throwOnError) return false;
        const rankingError = new Error(`Lecture du Top 3 public impossible : ${error?.message || "Supabase a refusé la lecture."}`);
        rankingError.cause = error;
        throw rankingError;
    }
}

async function refreshPublicGlobalRanking({ clearOnError = false } = {}) {
    try {
        const loaded = await loadPublicGlobalRanking({ throwOnError: true });
        if (!loaded && clearOnError) {
            setPublicGlobalRanking([]);
        }
        return loaded;
    } catch {
        if (clearOnError) {
            setPublicGlobalRanking([]);
        }
        return false;
    }
}

function refreshVisibleLoginGlobalRanking() {
    if (!hasSupabaseAuth() || publicRankingRefreshPromise) return publicRankingRefreshPromise;

    publicRankingRefreshPromise = refreshPublicGlobalRanking()
        .catch(() => false)
        .then(() => {
            if (!document.getElementById("login-view")?.classList.contains("hidden")) {
                renderGlobalRanking(getResults());
            }
        })
        .finally(() => {
            publicRankingRefreshPromise = null;
        });

    return publicRankingRefreshPromise;
}

async function saveResult(result) {
    const normalizedResult = normalizeResultRecord({ ...result, synced: false });
    const nextResults = [normalizedResult, ...getResults()];
    setResults(nextResults);
    queueResultUpsert(normalizedResult);

    if (!supabase) return;

    try {
        await flushPendingResultSync();
    } catch {
        // Conserver la copie locale si la synchronisation Supabase échoue.
    }
}

function updateThemeQuestionCounts() {
    const themeSelect = document.getElementById("theme-select");
    if (!themeSelect) return;

    const themeTitles = {
        1: "1. Organisation et Commandement",
        2: "2. Matériels, Armements et Technologies",
        3: "3. Lois de Programmation Militaire",
        4: "4. Opérations Extérieures",
        5: "5. Histoire & Traditions",
        6: "6. Implantation des unités"
    };

    Object.entries(themeTitles).forEach(([themeId, label]) => {
        const option = [...themeSelect.options].find(entry => entry.value === themeId);
        if (!option) return;

        option.textContent = label;
    });
}

function hasSupabaseAuth() {
    if (!supabase) return false;

    try {
        const url = new URL(supabaseUrl);
        return url.protocol === "https:" || url.protocol === "http:";
    } catch {
        return false;
    }
}

function normalizeEmail(email) {
    return email.trim().toLowerCase();
}

function decodeJwtClaims(accessToken) {
    try {
        const encodedPayload = accessToken?.split(".")?.[1];
        if (!encodedPayload) return null;

        const normalizedPayload = encodedPayload.replace(/-/g, "+").replace(/_/g, "/");
        const paddedPayload = normalizedPayload.padEnd(normalizedPayload.length + ((4 - normalizedPayload.length % 4) % 4), "=");
        return JSON.parse(atob(paddedPayload));
    } catch {
        return null;
    }
}

function isAdminSession(session) {
    const claims = decodeJwtClaims(session?.access_token);
    const appMetadata = claims?.app_metadata || {};
    return claims?.role === "admin" || appMetadata.role === "admin" || appMetadata.bm4_admin === true;
}

function isAdminUser(user, session = getStoredSupabaseSession()) {
    return isAdminSession(session) || user?.app_metadata?.role === "admin" || user?.app_metadata?.bm4_admin === true;
}

function formatSpecialtyLabel(specialty) {
    return specialtyLabels[specialty] || specialty || "Spécialité non renseignée";
}

function getCandidateLabel(account, candidateId) {
    const normalizedCandidateId = String(candidateId || "candidat-inconnu");
    return account?.name || `Candidat ${normalizedCandidateId.slice(0, 8)}`;
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

function getSupabaseConfigMessage() {
    if (!supabaseUrl || !supabaseAnonKey) {
        return "Configuration Supabase manquante. Renseignez les balises meta de connexion.";
    }

    try {
        const url = new URL(supabaseUrl);
        if (url.protocol !== "https:" && url.protocol !== "http:") {
            throw new Error("invalid protocol");
        }
    } catch {
        return "Configuration Supabase invalide. Vérifiez la balise meta `supabase-url` avant de réessayer.";
    }

    return "";
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

    if (!supabase || !user) {
        return {
            account: fallback,
            profileMissing: true
        };
    }

    try {
        const query = new URLSearchParams({
            id: `eq.${user.id}`,
            select: "id,email,name,speciality"
        });
        const data = await supabaseRestRequest(`/profiles?${query.toString()}`, {
            accessToken: getStoredSupabaseSession()?.access_token
        });
        const profile = Array.isArray(data) ? data[0] : null;

        if (!profile) {
            return {
                account: fallback,
                profileMissing: true
            };
        }

        return {
            account: {
                ...fallback,
                id: profile.id || fallback.id,
                email: normalizeEmail(profile.email || fallback.email || ""),
                name: profile.name || fallback.name,
                specialty: profile.speciality || fallback.specialty
            },
            profileMissing: false
        };
    } catch {
        return {
            account: fallback,
            profileStatus: "error"
        };
    }
}

async function upsertProfileForUser(user, profile = {}, accessToken = getStoredSupabaseSession()?.access_token) {
    const account = buildAccountFromUser(user, profile);

    if (supabase && user?.id) {
        if (!supabaseProfilesRlsVerified) {
            throw new Error("Configuration Supabase incomplète : confirmez la protection RLS du profil avant l’activation.");
        }

        const profileBase = {
            id: user.id,
            email: account.email,
            name: account.name
        };
        const profileRequest = payload => supabaseRestRequest("/profiles?on_conflict=id", {
            method: "POST",
            accessToken,
            prefer: "resolution=merge-duplicates,return=representation",
            body: [payload]
        });

        try {
            await profileRequest({ ...profileBase, speciality: account.specialty });
        } catch (primaryError) {
            try {
                await profileRequest({ ...profileBase, specialty: account.specialty });
            } catch {
                throw primaryError;
            }
        }
    }

    cacheAccount(account);
    return account;
}

async function finalizeAuthenticatedUser(user, fallback = {}, session = getStoredSupabaseSession()) {
    if (isAdminSession(session)) {
        currentAuthenticatedAccount = buildAccountFromUser(user, fallback);
        currentCandidateEmail = "";
        showAdminApp();
        return;
    }

    const { account, profileMissing, profileStatus } = await fetchProfileForUser(user);
    if (profileStatus === "error") {
        const error = new Error("Lecture du profil candidat indisponible.");
        error.code = profileLookupErrorCode;
        throw error;
    }
    if (profileMissing) {
        try {
            const repairedAccount = await upsertProfileForUser(user, fallback);
            currentCandidateEmail = repairedAccount.email;
            currentAuthenticatedAccount = repairedAccount;
            await showAuthenticatedApp(repairedAccount.email, repairedAccount);
            return;
        } catch {
            const error = new Error("Profil candidat non finalisé.");
            error.code = profileNotReadyErrorCode;
            throw error;
        }
    }
    const mergedAccount = {
        ...fallback,
        ...account,
        email: normalizeEmail(fallback.email || account.email || user?.email || "")
    };

    currentCandidateEmail = mergedAccount.email;
    currentAuthenticatedAccount = mergedAccount;
    cacheAccount(mergedAccount);
    await showAuthenticatedApp(mergedAccount.email, mergedAccount);
}

async function handleProfileNotReady(messageId, user = getStoredSupabaseSession()?.user, session = getStoredSupabaseSession()) {
    currentAuthenticatedAccount = null;
    currentCandidateEmail = "";
    if (!isAdminUser(user, session)) {
        await supabase?.auth.signOut().catch(() => {});
    }
    showAuthView("login");
    setAuthMessage(
        messageId,
        "Votre profil candidat n’est pas encore finalisé. Terminez d’abord l’inscription et la vérification OTP."
    );
}

function handleProfileLookupFailure(messageId) {
    currentAuthenticatedAccount = null;
    currentCandidateEmail = "";
    showAuthView("login");
    setAuthMessage(
        messageId,
        "Impossible de vérifier votre profil candidat pour le moment. Réessayez dans quelques instants."
    );
}

function setAuthMessage(id, message) {
    const messageNode = document.getElementById(id);
    if (!messageNode) return;
    messageNode.innerText = message;
}

let startupProgressTimer = null;
let startupLoadingHidden = false;

function startStartupProgress() {
    const startupLoading = document.getElementById("startup-loading");
    if (!startupLoading) return;

    let progress = 8;
    startupLoading.style.setProperty("--splash-progress", String(progress / 100));
    startupProgressTimer = window.setInterval(() => {
        progress = Math.min(progress + (progress < 70 ? 4 : 1), 92);
        startupLoading.style.setProperty("--splash-progress", String(progress / 100));
    }, 180);
}

function hideStartupLoading() {
    const startupLoading = document.getElementById("startup-loading");
    if (!startupLoading || startupLoadingHidden) return;

    startupLoadingHidden = true;
    if (startupProgressTimer) {
        window.clearInterval(startupProgressTimer);
        startupProgressTimer = null;
    }
    startupLoading.style.setProperty("--splash-progress", "1");
    window.setTimeout(() => {
        startupLoading.classList.add("startup-loading-hidden");
    }, 1000);
}

function getRegisterValidationMessage(field) {
    if (!field?.validity) {
        return "Vérifiez les champs du formulaire d’inscription.";
    }

    if (field.validity.valueMissing) {
        if (field.id === "register-pseudo") return "Le pseudo candidat est requis.";
        if (field.id === "register-email") return "L’adresse mail du candidat est requise.";
        if (field.id === "register-password") return "Le code de reconnaissance du candidat est requis.";
        if (field.id === "register-specialty") return "Sélectionnez une spécialité BM4 avant de créer le compte.";
        if (field.id === "register-specialty-other") return "Précisez votre spécialité avant de créer le compte.";
    }

    if (field.validity.typeMismatch && field.id === "register-email") {
        return "Renseignez une adresse mail valide.";
    }

    if (field.validity.tooShort && field.id === "register-password") {
        return `Le code de reconnaissance doit contenir au moins ${field.minLength || 6} caractères.`;
    }

    if (field.validity.badInput) {
        return "Corrigez la valeur saisie avant de créer le compte.";
    }

    return field.validationMessage || "Vérifiez les informations saisies avant de créer le compte.";
}

function getFirstInvalidRegisterField(registerForm) {
    return [...registerForm.elements]
        .filter(element => element?.validity)
        .find(element => !element.validity.valid) || null;
}

function initializeRegisterFormValidation() {
    const registerForm = document.getElementById("register-form");
    if (!registerForm) return;
    registerForm.noValidate = true;

    const specialtySelect = document.getElementById("register-specialty");
    const specialtyOtherInput = document.getElementById("register-specialty-other");
    if (specialtySelect && specialtyOtherInput) {
        const syncSpecialtyOtherVisibility = () => {
            const isOther = specialtySelect.value === "OTHER";
            specialtyOtherInput.classList.toggle("hidden", !isOther);
            specialtyOtherInput.required = isOther;
            if (!isOther) {
                specialtyOtherInput.value = "";
            }
        };
        specialtySelect.addEventListener("change", syncSpecialtyOtherVisibility);
        syncSpecialtyOtherVisibility();
    }

    const syncRegisterMessage = () => {
        if (!getFirstInvalidRegisterField(registerForm)) {
            setAuthMessage("register-message", "");
        }
    };

    registerForm.addEventListener("input", syncRegisterMessage);
    registerForm.addEventListener("change", syncRegisterMessage);
}

function getRequiredElement(id, messageId, errorMessage) {
    const element = document.getElementById(id);
    if (element) return element;

    if (messageId && errorMessage) {
        setAuthMessage(messageId, errorMessage);
    }
    return null;
}

function getRequiredFormElement(form, fieldName, messageId, errorMessage) {
    const directMatch = form?.elements?.namedItem?.(fieldName);
    const fallbackMatch = [...(form?.elements || [])]
        .find(element => element?.name === fieldName || element?.id === `register-${fieldName}`);
    const element = directMatch || fallbackMatch || null;

    if (element) return element;

    if (messageId && errorMessage) {
        setAuthMessage(messageId, errorMessage);
    }
    return null;
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

function setCandidateHistoryStatus(message) {
    ["candidate-history-status", "candidate-history-sync-status"].forEach(id => {
        const element = document.getElementById(id);
        if (element) element.innerText = message;
    });
}

async function refreshCandidateHistory(account) {
    const isCurrentCandidate = () => currentAuthenticatedAccount?.id === account.id
        && currentCandidateEmail === account.email;
    if (!isCurrentCandidate()) return;
    setCandidateHistoryStatus("Actualisation de votre historique…");
    try {
        if (!getStoredSupabaseSession()?.access_token) {
            throw new Error("Session candidat indisponible.");
        }
        const loaded = await loadResultsFromSupabase({ throwOnError: true });
        if (!loaded) throw new Error("Réponse de l’historique indisponible.");
        if (!isCurrentCandidate()) return;
        renderCandidateHistory(
            getResults(),
            String(account.id || account.email),
            account.email,
            Number(document.getElementById("candidate-history-period")?.value || 0)
        );
        setCandidateHistoryStatus("");
    } catch (error) {
        console.warn("Actualisation de l’historique candidat indisponible.", error);
        if (!isCurrentCandidate()) return;
        setCandidateHistoryStatus("Actualisation de l’historique impossible. Les résultats déjà chargés restent disponibles ; reconnectez-vous pour réessayer.");
    }
}

function showAuthenticatedApp(email, account = getAccounts()[email] || {}) {
    setAuthAudioPlaying(false);
    const accountSummary = document.getElementById("account-summary");
    if (accountSummary) {
        accountSummary.innerText =
            `${account.name || "Candidat"} • ${email} • ${formatSpecialtyLabel(account.specialty)}`;
    }
    uiController.switchScreen("theme-screen");
    renderGlobalRanking(getResults());
    return refreshCandidateHistory({ ...account, email });
}

async function loadAdminData() {
    if (!supabase || !getStoredSupabaseSession()?.access_token) return;

    const accessToken = getStoredSupabaseSession()?.access_token;
    let profiles;
    const loadProfiles = async specialtyColumn => {
        const pageSize = 1000;
        const allProfiles = [];

        for (let offset = 0; ; offset += pageSize) {
            const page = await supabaseRestRequest(
                `/profiles?select=id,email,name,${specialtyColumn}&order=id&limit=${pageSize}&offset=${offset}`,
                { accessToken }
            );
            if (!Array.isArray(page)) return allProfiles;

            allProfiles.push(...page);
            if (page.length < pageSize) return allProfiles;
        }
    };

    try {
        profiles = await loadProfiles("speciality");
    } catch (primaryError) {
        try {
            profiles = await loadProfiles("specialty");
        } catch {
            throw new Error(`Lecture des comptes impossible : ${primaryError.message}`);
        }
    }

    const resultsLoaded = await loadResultsFromSupabase({ throwOnError: true });
    const reports = await supabaseRestRequest(
        "/question_reports?select=id,question_id,question_text,answers,correct_answer_index,quiz_theme,details,reporter_id,status,created_at&order=created_at.desc",
        { accessToken }
    );
    if (!Array.isArray(reports)) {
        throw new Error("Les signalements de questions n’ont pas pu être chargés.");
    }
    const profileEmailsById = new Map(
        (Array.isArray(profiles) ? profiles : [])
            .filter(profile => profile.id && profile.email)
            .map(profile => [String(profile.id), profile.email])
    );
    questionReports = reports.map(report => ({
        ...report,
        reporter_email: profileEmailsById.get(String(report.reporter_id)) || ""
    }));

    if (Array.isArray(profiles)) {
        const synchronizedAccounts = {};
        profiles.forEach(profile => cacheAccount({
            id: profile.id,
            email: profile.email,
            name: profile.name,
            specialty: profile.speciality || profile.specialty
        }));
        profiles.forEach(profile => {
            const account = {
                id: profile.id,
                email: profile.email,
                name: profile.name,
                specialty: profile.speciality || profile.specialty
            };
            if (account.email) synchronizedAccounts[normalizeEmail(account.email)] = account;
        });
        cachedAccounts = synchronizedAccounts;
    }

    if (!resultsLoaded) {
        throw new Error("Les résultats administrateur n’ont pas pu être chargés.");
    }
}

async function showAdminApp() {
    setAuthAudioPlaying(false);
    renderAdminAccounts();
    renderAdminQuestions();
    renderAdminResults();
    renderAdminQuestionReports();
    renderGlobalRanking(getResults());
    const openReports = typeof window !== "undefined"
        && new URL(window.location.href).searchParams.get("admin-section") === "question-reports";
    switchAdminSection(openReports ? "question-reports" : "accounts");
    uiController.switchScreen("admin-screen");
    void refreshAdminPushStatus();

    try {
        await loadAdminData();
        renderAdminAccounts();
        renderAdminQuestions();
        renderAdminResults();
        renderAdminQuestionReports();
        renderGlobalRanking(getResults());
        setAuthMessage("admin-data-status", "Données administrateur synchronisées avec Supabase.");
    } catch (error) {
        console.warn("Chargement des données administrateur impossible.", error);
        setAuthMessage("admin-data-status", error?.message || "Impossible de charger les comptes depuis Supabase.");
    }
}

function getAdminPushOptions() {
    const session = getStoredSupabaseSession();
    if (!isAdminSession(session) || !session?.user?.id) {
        throw new Error("Reconnectez-vous avec votre compte administrateur pour gérer les notifications.");
    }
    return {
        url: supabaseUrl,
        key: supabaseAnonKey,
        accessToken: session.access_token,
        userId: session.user.id
    };
}

async function refreshAdminPushStatus() {
    try {
        const options = getAdminPushOptions();
        let enabled = await reportNotificationsEnabled(options);
        if (!enabled && typeof Notification !== "undefined" && Notification.permission !== "denied") {
            try {
                setAuthMessage("admin-push-status", "Activation automatique des notifications...");
                await enableReportNotifications(options);
                enabled = true;
            } catch (autoEnableError) {
                console.warn("Activation automatique des notifications impossible.", autoEnableError);
            }
        }
        document.getElementById("admin-push-enable-btn")?.classList.toggle("hidden", enabled);
        document.getElementById("admin-push-disable-btn")?.classList.toggle("hidden", !enabled);
        setAuthMessage("admin-push-status", enabled
            ? "Notifications activées sur cet appareil."
            : "Activez les notifications sur votre Android pour recevoir les nouveaux signalements.");
    } catch (error) {
        setAuthMessage("admin-push-status", error.message);
    }
}

function switchAdminSection(section) {
    document.querySelectorAll(".admin-panel").forEach(panel => {
        panel.classList.toggle("hidden", panel.id !== `admin-${section}-section`);
    });
    document.querySelectorAll(".admin-nav-btn").forEach(button => {
        button.classList.toggle("active", button.dataset.adminSection === section);
    });
}

function getNameTrigram(name) {
    const clean = String(name || "").trim();
    if (!clean) return "???";
    const words = clean.split(/\s+/).filter(Boolean);
    let letters = words.map(word => word[0]).join("");
    if (letters.length < 3) {
        letters += (words[words.length - 1] || "").slice(1);
    }
    return (letters.slice(0, 3) || "???").toUpperCase();
}

function renderAdminAccounts() {
    const accounts = getAccounts();
    const list = document.getElementById("admin-accounts-table");
    const accountCount = document.getElementById("admin-account-count");
    if (!list) return;
    const search = document.getElementById("admin-accounts-search")?.value.trim().toLowerCase() || "";
    list.innerHTML = "";

    Object.entries(accounts).forEach(([email, account]) => {
        const searchable = `${account.name || ""} ${email} ${account.specialty || ""}`.toLowerCase();
        if (search && !searchable.includes(search)) return;
        const row = document.createElement("tr");
        const nameCell = document.createElement("td");
        const emailCell = document.createElement("td");
        const specialtyCell = document.createElement("td");
        const actionCell = document.createElement("td");
        const deleteButton = document.createElement("button");

        nameCell.innerText = getNameTrigram(account.name);
        nameCell.title = account.name || "Non renseigné";
        emailCell.innerText = email;
        specialtyCell.innerText = formatSpecialtyLabel(account.specialty);
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

    if (accountCount) {
        accountCount.innerText = Object.keys(accounts).length;
    }
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
    const themeField = document.getElementById("admin-question-theme");
    const list = document.getElementById("admin-questions-table");
    if (!themeField || !list) return;
    const themeId = themeField.value;
    const questions = questionsBank[themeId].questions;
    const search = document.getElementById("admin-questions-search")?.value.trim().toLowerCase() || "";
    list.innerHTML = "";

    questions.forEach((question, index) => {
        const searchable = `${question.q} ${normalizeQuestionAnswers(question.r).join(" ")}`.toLowerCase();
        if (search && !searchable.includes(search)) return;
        const row = document.createElement("tr");
        const questionCell = document.createElement("td");
        const answersCell = document.createElement("td");
        const correctCell = document.createElement("td");
        const actionCell = document.createElement("td");
        const editButton = document.createElement("button");
        const deleteButton = document.createElement("button");
        const answers = normalizeQuestionAnswers(question.r);

        questionCell.innerText = question.q;
        answersCell.innerText = answers.join(" | ");
        correctCell.innerText = answers[question.correct];
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
    const answers = normalizeQuestionAnswers(question.r);
    editingQuestionIndex = index;
    document.getElementById("admin-question-theme").value = themeId;
    document.getElementById("admin-question-text").value = question.q;
    answers.forEach((answer, answerIndex) => {
        document.getElementById(`admin-answer-${answerIndex + 1}`).value = answer;
    });
    document.getElementById("admin-correct-answer").value = question.correct;
    document.getElementById("question-submit-btn").innerText = "Enregistrer la modification";
    document.getElementById("question-cancel-btn").classList.remove("hidden");
    setAuthMessage("question-message", "");
}

function renderAdminResults() {
    const list = document.getElementById("admin-results-table");
    const results = getResults();
    if (!list) return;
    const candidateFilter = document.getElementById("admin-results-candidate-filter");
    const search = document.getElementById("admin-results-search")?.value.trim().toLowerCase() || "";
    let selectedCandidate = candidateFilter?.value || "";

    if (candidateFilter) {
        const candidates = new Map();
        results.forEach(result => {
            const value = String(result.email || result.candidateId || result.name || result.label || "").trim();
            if (!value) return;
            const label = result.name || result.label || result.email || value;
            candidates.set(value, `${label}${result.email && result.name ? ` • ${result.email}` : ""}`);
        });
        candidateFilter.innerHTML = "";
        candidateFilter.appendChild(new Option("Tous les candidats", ""));
        [...candidates.entries()]
            .sort((first, second) => first[1].localeCompare(second[1], "fr"))
            .forEach(([value, label]) => candidateFilter.appendChild(new Option(label, value)));
        candidateFilter.value = candidates.has(selectedCandidate) ? selectedCandidate : "";
        selectedCandidate = candidateFilter.value;
    }

    const historyPanel = document.getElementById("admin-history-panel");
    const historyStatus = document.getElementById("admin-history-status");
    historyPanel?.classList.toggle("hidden", !selectedCandidate);
    if (historyStatus) {
        historyStatus.innerText = selectedCandidate
            ? ""
            : "Sélectionnez un candidat pour afficher son historique et son thème à travailler.";
    }
    renderCandidateHistory(
        selectedCandidate ? results.filter(result =>
            String(result.email || result.candidateId || result.name || result.label || "").trim() === selectedCandidate
        ) : [],
        "",
        "",
        Number(document.getElementById("admin-history-period")?.value || 0),
        { prefix: "admin-history", filterCandidate: false }
    );

    list.innerHTML = "";

    results.forEach((result, index) => {
        const candidateKey = String(result.email || result.candidateId || result.name || result.label || "").trim();
        const searchable = `${result.name || ""} ${result.label || ""} ${result.email || ""} ${result.score} ${result.date}`.toLowerCase();
        if (selectedCandidate && candidateKey !== selectedCandidate) return;
        if (search && !searchable.includes(search)) return;
        const row = document.createElement("tr");
        const candidateCell = document.createElement("td");
        const scoreCell = document.createElement("td");
        const answersCell = document.createElement("td");
        const dateCell = document.createElement("td");
        candidateCell.innerText = result.label || result.name || result.email || "Candidat inconnu";
        scoreCell.innerText = `${result.score.toFixed(2)} / 20`;
        answersCell.innerText = `${result.correct} correcte(s), ${result.wrong} fausse(s), ${result.skipped} passée(s)`;
        dateCell.innerText = result.date;
        row.append(candidateCell, scoreCell, answersCell, dateCell);
        list.appendChild(row);
    });
}

function renderAdminQuestionReports() {
    const badge = document.getElementById("admin-question-reports-badge");
    const pendingCount = questionReports.filter(report => report.status !== "resolved").length;
    if (badge) {
        badge.innerText = pendingCount > 99 ? "99+" : String(pendingCount);
        badge.classList.toggle("hidden", pendingCount === 0);
        badge.setAttribute("aria-hidden", String(pendingCount === 0));
    }
    const reportsButton = document.querySelector('[data-admin-section="question-reports"]');
    reportsButton?.setAttribute(
        "aria-label",
        pendingCount > 0 ? `Signalements, ${pendingCount} à traiter` : "Signalements"
    );

    const list = document.getElementById("admin-question-reports-table");
    if (!list) return;
    list.innerHTML = "";

    if (questionReports.length === 0) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");
        cell.colSpan = 6;
        cell.innerText = "Aucun signalement pour le moment.";
        row.appendChild(cell);
        list.appendChild(row);
        return;
    }

    questionReports.forEach(report => {
        const row = document.createElement("tr");
        const questionCell = document.createElement("td");
        const detailsCell = document.createElement("td");
        const reporterCell = document.createElement("td");
        const dateCell = document.createElement("td");
        const statusCell = document.createElement("td");
        const actionCell = document.createElement("td");
        const resolveButton = document.createElement("button");
        const deleteButton = document.createElement("button");
        const answers = Array.isArray(report.answers) ? report.answers : [];

        questionCell.className = "question-report-content";
        questionCell.innerText = [
            report.question_text || "Question indisponible",
            `Réponses : ${answers.join(" | ") || "Non renseignées"}`,
            `Bonne réponse enregistrée : ${answers[report.correct_answer_index] || "Non renseignée"}`,
            `Campagne : ${report.quiz_theme === "all" ? "Globale" : report.quiz_theme}`
        ].join("\n");
        detailsCell.innerText = report.details || "Aucun détail fourni.";
        reporterCell.innerText = report.reporter_email || "E-mail indisponible";
        dateCell.innerText = report.created_at
            ? new Date(report.created_at).toLocaleString("fr-FR")
            : "Date inconnue";
        statusCell.innerText = report.status === "resolved" ? "Traité" : "À traiter";
        if (report.status !== "resolved") {
            resolveButton.type = "button";
            resolveButton.className = "admin-edit-btn";
            resolveButton.innerText = "Marquer comme traité";
            resolveButton.addEventListener("click", async () => {
                resolveButton.disabled = true;
                try {
                    await supabaseRestRequest(`/question_reports?id=eq.${encodeURIComponent(report.id)}`, {
                        method: "PATCH",
                        accessToken: getStoredSupabaseSession()?.access_token,
                        prefer: "return=minimal",
                        body: { status: "resolved" }
                    });
                    report.status = "resolved";
                    renderAdminQuestionReports();
                } catch (error) {
                    setAuthMessage("admin-question-reports-status", `Mise à jour impossible : ${error.message}`);
                    resolveButton.disabled = false;
                }
            });
            actionCell.appendChild(resolveButton);
        }

        deleteButton.type = "button";
        deleteButton.className = "admin-delete-btn";
        deleteButton.innerText = "Effacer signalement";
        deleteButton.addEventListener("click", async () => {
            const confirmed = await showConfirmOverlay({
                title: "Effacer le signalement ?",
                message: "Cette action supprimera définitivement ce signalement.",
                okLabel: "Effacer",
                cancelLabel: "Annuler"
            });
            if (!confirmed) return;

            deleteButton.disabled = true;
            try {
                await supabaseRestRequest(`/question_reports?id=eq.${encodeURIComponent(report.id)}`, {
                    method: "DELETE",
                    accessToken: getStoredSupabaseSession()?.access_token,
                    prefer: "return=minimal"
                });
                questionReports = questionReports.filter(item => item.id !== report.id);
                renderAdminQuestionReports();
                setAuthMessage("admin-question-reports-status", "Signalement effacé.");
            } catch (error) {
                setAuthMessage("admin-question-reports-status", `Suppression impossible : ${error.message}`);
                deleteButton.disabled = false;
            }
        });
        actionCell.appendChild(deleteButton);

        row.append(questionCell, detailsCell, reporterCell, dateCell, statusCell, actionCell);
        list.appendChild(row);
    });
}

function renderGlobalRanking(results) {
    const section = document.getElementById("global-ranking-section");
    const list = document.getElementById("global-ranking-list");
    const loginSection = document.getElementById("login-global-ranking-section");
    const loginList = document.getElementById("login-global-ranking-list");
    const adminSection = document.getElementById("admin-global-ranking-section");
    const adminList = document.getElementById("admin-global-ranking-list");
    const historySection = document.getElementById("history-global-ranking-section");
    const historyList = document.getElementById("history-global-ranking-list");
    if ((!section || !list)
        && (!loginSection || !loginList)
        && (!adminSection || !adminList)
        && (!historySection || !historyList)) return;
    const rankingDateFormatter = new Intl.DateTimeFormat("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
    });

    const ranking = results
        .filter(result => result.theme === "all")
        .sort((first, second) => {
            const scoreDifference = second.score - first.score;
            if (scoreDifference !== 0) return scoreDifference;
            return String(first.createdAt).localeCompare(String(second.createdAt));
        })
        .slice(0, 3);
    const loginRanking = getPublicGlobalRanking();
    const effectiveGlobalRanking = loginRanking.length > 0 ? loginRanking : ranking;

    [list, loginList, adminList, historyList].filter(Boolean).forEach(target => {
        target.innerHTML = "";
    });
    section?.classList.toggle("hidden", effectiveGlobalRanking.length === 0);
    historySection?.classList.toggle("hidden", effectiveGlobalRanking.length === 0);
    loginSection?.classList.remove("hidden");
    const loginStatus = document.getElementById("login-global-ranking-status");
    if (loginStatus) {
        loginStatus.innerText = publicRankingState === "error"
            ? (loginRanking.length
                ? "Actualisation indisponible : dernier classement enregistré affiché."
                : "Classement momentanément indisponible. Réessayez en revenant à l’onglet Connexion.")
            : publicRankingState === "loading"
                ? "Chargement du classement…"
                : loginRanking.length ? "" : "Aucun résultat de campagne globale pour le moment.";
    }
    adminSection?.classList.toggle("hidden", effectiveGlobalRanking.length === 0);

    const rankingSymbols = ["🏆", "🥈", "🥉"];
    const podiumIcons = [
        { src: "public/icons/podium-gold.svg", alt: "Première place" },
        { src: "public/icons/podium-silver.svg", alt: "Médaille argent : deuxième résultat" },
        { src: "public/icons/podium-bronze.svg", alt: "Médaille bronze : troisième résultat" }
    ];
    const appendRanking = (target, rankingItems) => {
        if (!target) return;

        rankingItems.forEach((result, index) => {
            const previousResult = rankingItems[index - 1];
            const rank = previousResult && previousResult.score === result.score
                ? index
                : index + 1;
            const date = result.createdAt && !Number.isNaN(Date.parse(result.createdAt))
                ? rankingDateFormatter.format(new Date(result.createdAt))
                : result.date;
            const item = document.createElement("li");
            const rankElement = document.createElement("span");
            const candidateElement = document.createElement("span");
            const scoreElement = document.createElement("strong");
            const dateElement = document.createElement("small");

            item.className = "global-ranking-item";
            rankElement.className = "global-ranking-rank";
            if (target === loginList || target === historyList || target === adminList) {
                const icon = document.createElement("img");
                icon.src = podiumIcons[index].src;
                icon.alt = podiumIcons[index].alt;
                icon.className = "podium-icon";
                rankElement.appendChild(icon);
            } else {
                rankElement.innerText = rankingSymbols[rank - 1] || `${rank}.`;
            }
            candidateElement.className = "global-ranking-candidate";
            candidateElement.innerText = result.name || result.label || result.email || "Pseudo non renseigné";
            scoreElement.innerText = `${result.score.toFixed(2)} / 20`;
            dateElement.innerText = date;
            item.append(rankElement, candidateElement, scoreElement, dateElement);
            target.appendChild(item);
        });
    };

    appendRanking(list, effectiveGlobalRanking);
    appendRanking(historyList, effectiveGlobalRanking);
    appendRanking(loginList, loginRanking);
    appendRanking(adminList, effectiveGlobalRanking);
}

function renderGlobalEvolution(results, candidateId, candidateEmail = "", periodDays = 0) {
    const section = document.getElementById("global-evolution-section");
    const chart = document.getElementById("global-evolution-chart");
    const list = document.getElementById("global-evolution-list");
    const summary = document.getElementById("global-evolution-summary");
    if (!section || !chart || !list) return;

    const cutoff = periodDays > 0 ? Date.now() - periodDays * 24 * 60 * 60 * 1000 : 0;
    const normalizedCandidateEmail = String(candidateEmail || "").trim().toLowerCase();
    const evolution = results
        .filter(result => result.theme === "all")
        .filter(result => result.candidateId === candidateId
            || (normalizedCandidateEmail && String(result.email || "").trim().toLowerCase() === normalizedCandidateEmail))
        .filter(result => !cutoff || (result.createdAt && Date.parse(result.createdAt) >= cutoff))
        .sort((first, second) => String(first.createdAt).localeCompare(String(second.createdAt)));
    const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
    });

    chart.innerHTML = "";
    list.innerHTML = "";
    if (summary) summary.innerText = "";
    section.classList.remove("hidden");

    if (evolution.length === 0) {
        const emptyState = document.createElement("li");
        emptyState.className = "global-evolution-empty";
        emptyState.innerText = "Aucune note de Campagne Globale enregistrée.";
        list.appendChild(emptyState);
        return;
    }

    const scores = evolution.map(result => Number(result.score) || 0);
    const average = scores.reduce((total, score) => total + score, 0) / scores.length;
    const best = Math.max(...scores);
    if (summary) {
        summary.innerText = `Moyenne : ${average.toFixed(2)} / 20 • Meilleure note : ${best.toFixed(2)} / 20`;
    }

    evolution.forEach(result => {
        const score = Math.max(0, Math.min(20, Number(result.score) || 0));
        const date = result.createdAt && !Number.isNaN(Date.parse(result.createdAt))
            ? dateFormatter.format(new Date(result.createdAt))
            : result.date;
        const bar = document.createElement("div");
        const barValue = document.createElement("span");
        const item = document.createElement("li");

        bar.className = "global-evolution-bar";
        bar.style.height = `${Math.max(score * 5, 3)}%`;
        bar.title = `${date} — ${score.toFixed(2)} / 20`;
        bar.setAttribute("aria-label", `${date} — ${score.toFixed(2)} / 20`);
        barValue.innerText = score.toFixed(2);
        bar.appendChild(barValue);

        item.innerText = `${date} — ${score.toFixed(2)} / 20`;
        chart.appendChild(bar);
        list.appendChild(item);
    });
}

function renderCandidateHistory(results, candidateId, candidateEmail = "", periodDays = 0, options = {}) {
    const prefix = options.prefix || "candidate-history";
    const charts = document.getElementById(`${prefix}-charts`);
    const recommendation = document.getElementById(`${prefix}-recommendation`);
    const summary = document.getElementById(`${prefix}-summary`);
    if (!charts || !recommendation) return;

    const cutoff = periodDays > 0 ? Date.now() - periodDays * 24 * 60 * 60 * 1000 : 0;
    const normalizedEmail = String(candidateEmail || "").trim().toLowerCase();
    const history = results
        .filter(result => options.filterCandidate === false || result.candidateId === candidateId
            || (normalizedEmail && String(result.email || "").trim().toLowerCase() === normalizedEmail))
        .filter(result => !cutoff || (result.createdAt && Date.parse(result.createdAt) >= cutoff))
        .sort((first, second) => String(first.createdAt).localeCompare(String(second.createdAt)));

    charts.innerHTML = "";
    recommendation.innerText = "";
    if (summary) summary.innerText = "";

    const themeLabels = [
        ["all", "Campagne Globale"],
        ["1", "Thème 1 • Organisation et Commandement"],
        ["2", "Thème 2 • Matériels, Armements et Technologies"],
        ["3", "Thème 3 • Lois de Programmation Militaire"],
        ["4", "Thème 4 • Opérations Extérieures"],
        ["5", "Thème 5 • Histoire & Traditions"],
        ["6", "Thème 6 • Implantation des unités"]
    ];

    const globalHistory = history.filter(result => result.theme === "all");
    const globalScores = globalHistory.map(result => Number(result.score) || 0);
    if (summary) {
        if (globalScores.length > 0) {
            const average = globalScores.reduce((total, score) => total + score, 0) / globalScores.length;
            summary.innerText = `${globalHistory.length} résultat(s) de Campagne Globale • Moyenne Campagne Globale : ${average.toFixed(2)} / 20`;
        } else {
            summary.innerText = "Aucun résultat de Campagne Globale sur cette période.";
        }
    }

    const appendBars = (chart, themeResults) => {
        if (themeResults.length === 0) {
            chart.classList.add("candidate-history-chart-empty");
            chart.innerText = "Aucun résultat";
            return;
        }

        themeResults.forEach(result => {
            const score = Math.max(0, Math.min(20, Number(result.score) || 0));
            const bar = document.createElement("div");
            bar.className = `global-evolution-bar ${score > 10 ? "score-good" : score >= 5 ? "score-warning" : "score-critical"}`;
            bar.style.height = `${Math.max(score * 5, 3)}%`;
            bar.title = `${score.toFixed(2)} / 20`;
            bar.setAttribute("aria-label", `${score.toFixed(2)} / 20`);
            const value = document.createElement("span");
            value.innerText = score.toFixed(2);
            bar.appendChild(value);
            chart.appendChild(bar);
        });
    };

    const globalSection = document.createElement("section");
    const globalTitle = document.createElement("h3");
    const globalChart = document.createElement("div");
    globalSection.className = "candidate-history-chart-section";
    globalTitle.innerText = themeLabels[0][1];
    globalChart.className = "global-evolution-chart";
    globalChart.setAttribute("role", "img");
    globalChart.setAttribute("aria-label", "Histogramme Campagne Globale");
    appendBars(globalChart, globalHistory);
    globalSection.append(globalTitle, globalChart);
    charts.appendChild(globalSection);

    const themeAverages = themeLabels.slice(1)
        .map(([themeId, label]) => {
            const scores = history
                .filter(result => String(result.theme) === themeId)
                .map(result => Number(result.score) || 0);
            return {
                label,
                average: scores.length > 0 ? scores.reduce((total, score) => total + score, 0) / scores.length : null
            };
        })
        .filter(theme => theme.average !== null)
        .sort((first, second) => first.average - second.average);
    recommendation.innerText = themeAverages.length > 0
        ? `Thème à travailler : ${themeAverages[0].label} (${themeAverages[0].average.toFixed(2)} / 20 de moyenne)`
        : "Thème à travailler : aucun résultat par thème disponible.";

}

function setTerminalState(label) {
    const terminalState = document.getElementById("auth-terminal-state");
    if (!terminalState) return;
    terminalState.innerText = label;
}

function showAuthView(view, options = {}) {
    const views = ["login", "register", "otp", "reset", "success", "admin"];
    views.forEach(currentView => {
        const viewElement = document.getElementById(`${currentView}-view`);
        if (!viewElement) return;
        viewElement.classList.toggle("hidden", currentView !== view);
    });

    document.querySelectorAll(".auth-tab").forEach(tab => {
        tab.classList.toggle("active", tab.dataset.authMode === view);
    });

    if (view === "reset") {
        const isPasswordUpdate = options.resetMode === "update";
        document.getElementById("reset-request-form")?.classList.toggle("hidden", isPasswordUpdate);
        document.getElementById("reset-password-form")?.classList.toggle("hidden", !isPasswordUpdate);
        const resetCopy = document.getElementById("reset-copy");
        if (resetCopy) {
            resetCopy.innerText = isPasswordUpdate
                ? "Définissez un nouveau code de reconnaissance pour finaliser la récupération du compte."
                : "Renseignez votre adresse email pour recevoir un lien de réinitialisation.";
        }
        setTerminalState(isPasswordUpdate ? "MODE RESET RECOVERY" : "MODE RESET REQUEST");
    } else if (view === "otp") {
        const otpEmailDisplay = document.getElementById("otp-email-display");
        if (otpEmailDisplay) {
            otpEmailDisplay.innerText = options.email || getPendingSignup()?.email || "";
        }
        setTerminalState("MODE OTP VERIFY");
        const codeInputs = [...document.querySelectorAll(".otp-digit")];
        if (codeInputs.length > 0) codeInputs[0].focus();
    } else if (view === "success") {
        const successCopy = document.getElementById("success-copy");
        if (successCopy) {
            successCopy.innerText = options.message || "Opération terminée avec succès.";
        }
        const successActionButton = document.getElementById("success-action-btn");
        if (successActionButton) {
            successActionButton.innerText = options.actionLabel || "Retour à la connexion";
        }
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

    renderGlobalRanking(getResults());

    if (view === "login" && authUiReady) {
        void refreshVisibleLoginGlobalRanking();
    }
}

function ensureSupabaseConfigured(messageId) {
    const configMessage = document.getElementById("auth-config-message");
    const configIssue = getSupabaseConfigMessage();
    const configured = hasSupabaseAuth() && !configIssue;
    const fallbackConfigMessage = configIssue || "Configuration Supabase indisponible. Rechargez la page puis vérifiez la configuration avant de réessayer.";
    if (configMessage) {
        configMessage.innerText = configured ? "Configuration Supabase prête." : fallbackConfigMessage;
        configMessage.classList.toggle("hidden", configured);
    }

    if (!configured && messageId) {
        setAuthMessage(messageId, fallbackConfigMessage);
    }

    return configured;
}

function getFriendlyAuthError(error, fallbackMessage) {
    const message = error?.message?.toLowerCase?.() || "";

    if (message.includes("invalid login credentials")) {
        return "Canal d'extraction ou code de reconnaissance incorrect.";
    }
    if (message.includes("email not confirmed")) {
        return "Adresse mail non confirmée. Validez d’abord le code OTP reçu par email.";
    }
    if (message.includes("already registered") || message.includes("already been registered")) {
        return "Un compte existe déjà avec cette adresse mail.";
    }
    if (message.includes("password should be at least")) {
        return "Le code de reconnaissance doit contenir au moins 6 caractères.";
    }
    if (message.includes("token has expired") || message.includes("otp expired")) {
        return "Le code ou le lien de vérification a expiré. Demandez une nouvelle procédure.";
    }
    if (message.includes("invalid token") || message.includes("token")) {
        return "Code OTP ou lien de récupération invalide.";
    }
    if (
        message.includes("network")
        || message.includes("failed to fetch")
        || message.includes("fetch failed")
        || message.includes("load failed")
        || message.includes("networkerror")
    ) {
        return "Impossible de joindre Supabase. Vérifiez `supabase-url`, les Redirect URL Auth, la connectivité réseau et forcez un rechargement GitHub Pages si l’écran est en cache.";
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

async function handleRegisterSubmit(event) {
    event.preventDefault();
    if (!ensureSupabaseConfigured("register-message")) return;

    const registerForm = event.currentTarget;
    const invalidField = getFirstInvalidRegisterField(registerForm);
    if (invalidField) {
        setAuthMessage("register-message", getRegisterValidationMessage(invalidField));
        invalidField.focus?.();
        return;
    }

    const pseudoField = getRequiredFormElement(
        registerForm,
        "pseudo",
        "register-message",
        "Le champ pseudo est introuvable. Rechargez la page puis réessayez."
    );
    const emailField = getRequiredFormElement(registerForm, "email", "register-message", "Le champ email est introuvable.");
    const passwordField = getRequiredFormElement(registerForm, "password", "register-message", "Le champ code de reconnaissance est introuvable.");
    const specialtyField = getRequiredFormElement(registerForm, "specialty", "register-message", "Le champ spécialité est introuvable.");

    if (!pseudoField || !emailField || !passwordField || !specialtyField) {
        return;
    }

    const name = pseudoField.value.trim();
    const email = normalizeEmail(emailField.value);
    const password = passwordField.value;
    const selectedSpecialty = specialtyField.value.trim();
    const specialtyOtherField = registerForm.elements.namedItem("specialtyOther");
    const specialty = selectedSpecialty === "OTHER"
        ? specialtyOtherField?.value.trim() || ""
        : selectedSpecialty;

    if (!name || !specialty) {
        setAuthMessage("register-message", selectedSpecialty === "OTHER"
            ? "Précisez votre spécialité avant de créer le compte."
            : "Tous les champs du profil candidat sont requis.");
        if (selectedSpecialty === "OTHER") {
            specialtyOtherField?.focus?.();
        }
        return;
    }

    try {
        setAuthMessage("register-message", "");
        const { data } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: { name, specialty }
            }
        });

        setPendingSignup({ name, email, specialty });
        if (data?.user && data?.session?.access_token) {
            await upsertProfileForUser(data.user, { name, email, specialty }, data.session.access_token);
        }
        clearAuthMessages();
        clearOtpInputs();
        showAuthView("otp", { email });
    } catch (error) {
        setAuthMessage("register-message", getFriendlyAuthError(error, "Impossible de créer le compte."));
    }
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

    if (isAdminSession(session)) {
        currentAuthenticatedAccount = buildAccountFromUser(session.user);
        currentCandidateEmail = "";
        showAdminApp();
        return;
    }

    try {
        await finalizeAuthenticatedUser(
            session.user,
            { email: currentAuthenticatedAccount?.email || session.user?.email || "" },
            session
        );
    } catch (error) {
        if (error?.code === profileNotReadyErrorCode) {
            await handleProfileNotReady("login-message", session.user, session);
            return;
        }
        if (error?.code === profileLookupErrorCode) {
            handleProfileLookupFailure("login-message");
            return;
        }
        throw error;
    }
}

function initializeAuth() {
    showAuthView("login");
    ensureSupabaseConfigured();
    initializeOtpInputs();
    initializeRegisterFormValidation();

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

    document.getElementById("login-forgot-password-btn").addEventListener("click", () => {
        clearAuthMessages();
        document.getElementById("reset-email").value = document.getElementById("login-email").value.trim();
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
        currentCandidateEmail = "";
        clearRecoveryUrlState();
        showAuthView("login");
    });

    document.getElementById("login-form").addEventListener("submit", async event => {
        event.preventDefault();
        if (!ensureSupabaseConfigured("login-message")) return;

        const email = normalizeEmail(document.getElementById("login-email").value);
        const password = document.getElementById("login-password").value;
        let signedInUser = null;
        let signedInSession = null;
        try {
            const { data } = await supabase.auth.signInWithPassword({ email, password });
            signedInUser = data.user || null;
            signedInSession = data.session || null;

            if (!data.user) {
                setAuthMessage("login-message", "Canal d'extraction ou code de reconnaissance incorrect.");
                return;
            }

            clearAuthMessages();
            await finalizeAuthenticatedUser(data.user, { email }, signedInSession);
        } catch (error) {
            if (error?.code === profileNotReadyErrorCode) {
                await handleProfileNotReady("login-message", signedInUser, signedInSession);
                return;
            }
            if (error?.code === profileLookupErrorCode) {
                handleProfileLookupFailure("login-message");
                return;
            }
            setAuthMessage("login-message", getFriendlyAuthError(error, "Canal d'extraction ou code de reconnaissance incorrect."));
        }
    });

    document.getElementById("register-form").addEventListener("submit", handleRegisterSubmit);

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
                    await finalizeAuthenticatedUser(data.user, account, data.session);
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
                message: "Lien de récupération envoyé. Ouvrez l’email reçu puis revenez dans l’application pour définir un nouveau code de reconnaissance.",
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
            setAuthMessage("reset-password-message", "Le code de reconnaissance doit contenir au moins 6 caractères.");
            return;
        }

        if (password !== confirmation) {
            setAuthMessage("reset-password-message", "Les codes de reconnaissance saisis ne correspondent pas.");
            return;
        }

        try {
            await supabase.auth.updateUser({ password });
            await supabase.auth.signOut();
            currentAuthenticatedAccount = null;
            currentCandidateEmail = "";
            clearPendingSignup();
            clearRecoveryUrlState();
            document.getElementById("reset-password-form").reset();
            clearAuthMessages();
            showAuthView("success", {
                message: "Code de reconnaissance mis à jour. Reconnectez-vous avec votre nouveau code de reconnaissance.",
                actionLabel: "Retour à la connexion",
                onAction: () => {
                    showAuthView("login");
                }
            });
        } catch (error) {
            setAuthMessage("reset-password-message", getFriendlyAuthError(error, "Impossible de mettre à jour le code de reconnaissance."));
        }
    });

    document.getElementById("admin-form").addEventListener("submit", async event => {
        event.preventDefault();
        if (!ensureSupabaseConfigured("admin-message")) return;

        const email = normalizeEmail(document.getElementById("admin-email").value);
        const password = document.getElementById("admin-password").value;
        let adminSession = null;

        try {
            const { data } = await supabase.auth.signInWithPassword({ email, password });
            adminSession = data.session || null;

            if (!data.user) {
                setAuthMessage("admin-message", "Identifiant ou code de reconnaissance administrateur incorrect.");
                return;
            }

            if (!isAdminSession(adminSession || getStoredSupabaseSession())) {
                await supabase.auth.signOut();
                setAuthMessage("admin-message", "Compte authentifié mais non autorisé pour l’administration.");
                return;
            }

            setAuthMessage("admin-message", "");
            currentAuthenticatedAccount = buildAccountFromUser(data.user);
            currentCandidateEmail = "";
            showAdminApp();
        } catch (error) {
            setAuthMessage("admin-message", getFriendlyAuthError(error, "Identifiant ou code de reconnaissance administrateur incorrect."));
            return;
        }

    });

    if (hasSupabaseAuth()) {
        supabase.auth.onAuthStateChange(event => {
            if (event === "PASSWORD_RECOVERY") {
                uiController.switchScreen("auth-screen");
                currentAuthenticatedAccount = null;
                currentCandidateEmail = "";
                clearAuthMessages();
                showAuthView("reset", { resetMode: "update" });
                return;
            }

            if (event === "SIGNED_OUT") {
                currentAuthenticatedAccount = null;
                currentCandidateEmail = "";
                uiController.switchScreen("auth-screen");
                clearAuthMessages();
                showAuthView("login");
            }
        });
    }
}

async function initializeApp() {
    try {
        const storedResults = getStoredJson(localStorage, resultsStorageKey, []);
        const storedPublicRanking = getStoredJson(localStorage, publicRankingStorageKey, []);
        const storedSyncState = getStoredJson(localStorage, resultsSyncStorageKey, { upserts: [], deletes: [] });
        pendingResultSync = {
            upserts: Array.isArray(storedSyncState?.upserts) ? storedSyncState.upserts : [],
            deletes: Array.isArray(storedSyncState?.deletes) ? storedSyncState.deletes : []
        };
        setResults(Array.isArray(storedResults) ? storedResults : []);
        setPublicGlobalRanking(Array.isArray(storedPublicRanking) ? storedPublicRanking : []);
        initializeAuth();
        authUiReady = true;
        initializeAppInteractions();
        await syncSupabaseSessionFromUrl();
        await restoreSupabaseSession();
        const loadedFromSupabase = await loadQuestionsFromSupabase();
        if (!loadedFromSupabase) {
            applyQuestionOverrides();
            setConnectionStatus("Mode hors connexion : questions locales utilisées.");
        }
        await loadPublicGlobalRanking();
        const loadedResultsFromSupabase = await loadResultsFromSupabase();
        if (!loadedResultsFromSupabase && supabase) {
            setConnectionStatus("Mode hors connexion : résultats locaux utilisés.");
        }
        updateThemeQuestionCounts();
        renderGlobalRanking(getResults());

        if (isRecoveryModeFromUrl()) {
            uiController.switchScreen("auth-screen");
            currentAuthenticatedAccount = null;
            currentCandidateEmail = "";
            showAuthView("reset", { resetMode: "update" });
        }
        hideStartupLoading();
    } catch (error) {
        console.error("Initialisation BM4 incomplète", error);
        const startupFallbackMessage = "Initialisation incomplète. Vérifiez la connexion puis relancez l’application.";
        if (!authUiReady) {
            try {
                initializeAuth();
                authUiReady = true;
            } catch (authError) {
                console.error("Activation du mode dégradé impossible", authError);
            }
        }
        currentAuthenticatedAccount = null;
        currentCandidateEmail = "";
        hideStartupLoading();
        if (authUiReady) {
            clearAuthMessages();
        }
        showStartupRecoveryState({ message: startupFallbackMessage });
    }
}

async function initializeAppInteractions() {
    navigator.serviceWorker?.addEventListener("message", async event => {
        if (event.data?.type !== "open-question-reports" || !isAdminSession(getStoredSupabaseSession())) return;
        switchAdminSection("question-reports");
        try {
            await loadAdminData();
            renderAdminQuestionReports();
            setAuthMessage("admin-question-reports-status", "Signalements actualisés depuis Supabase.");
        } catch (error) {
            setAuthMessage("admin-question-reports-status", `Actualisation impossible : ${error.message}`);
        }
    });

    // =========================================================
    // SÉLECTION DU THÉÂTRE D’OPÉRATION
    // =========================================================

    const startButton = document.getElementById("start-btn");
    const themeSelect = document.getElementById("theme-select");
    const qtyInput = document.getElementById("qty-theme");
    const qtyButtons = [...document.querySelectorAll(".qty-choice-btn")];
    const globalButton = document.getElementById("theme-global-btn");
    const trainingButton = document.getElementById("theme-training-btn");

    const syncQtyChoiceButtons = value => {
        qtyButtons.forEach(btn => {
            const isActive = btn.dataset.qty === String(value);
            btn.classList.toggle("active", isActive);
            btn.setAttribute("aria-pressed", String(isActive));
        });
    };

    const setQuestionCount = value => {
        if (!qtyInput) return;
        qtyInput.value = String(value);
        syncQtyChoiceButtons(value);
    };

    const clampQuestionCount = (requested, maxAllowed) =>
        Math.min(Math.max(requested, 1), Math.max(maxAllowed, 1));

    const enableStartButton = (themeId) => {
        selectedTheme = themeId;
        updateQuestionRotationStatus(themeId);
        maxQuestions = parseInt(qtyInput?.value, 10) || 20;

        if (startButton) {
            startButton.disabled = getQuestionPool(themeId).length === 0;
        }
    };

    const applySelectedTheme = () => {
        const themeId = themeSelect?.value || "";

        if (!themeId) {
            selectedTheme = null;
            maxQuestions = 0;
            quizFeedbackMode = "training";
            if (globalButton) globalButton.classList.remove("active");
            if (trainingButton) trainingButton.classList.remove("active");
            if (startButton) startButton.disabled = true;
            return;
        }

        if (qtyInput) {
            const maxAllowed = getQuestionPool(themeId).length;
            const requested = parseInt(qtyInput.value, 10) || 20;
            setQuestionCount(clampQuestionCount(requested, maxAllowed));
        }

        quizFeedbackMode = "training";
        if (globalButton) globalButton.classList.remove("active");
        if (trainingButton) trainingButton.classList.remove("active");
        enableStartButton(themeId);
    };

    themeSelect?.addEventListener("change", applySelectedTheme);
    qtyButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            const requested = parseInt(btn.dataset.qty, 10) || 20;
            const poolSize = themeSelect?.value
                ? getQuestionPool(themeSelect.value).length
                : requested;
            const clamped = clampQuestionCount(requested, poolSize);
            setQuestionCount(clamped);
            maxQuestions = clamped;
            if (themeSelect?.value) {
                enableStartButton(themeSelect.value);
            }
        });
    });
    syncQtyChoiceButtons(qtyInput?.value || "20");

    const activateGlobalCampaign = (feedbackMode, clickedButton) => {
        quizFeedbackMode = feedbackMode;
        if (themeSelect) themeSelect.value = "";
        selectedTheme = "all";
        maxQuestions = 50;
        if (qtyInput) {
            setQuestionCount(clampQuestionCount(50, getAllQuestions().length));
        }
        if (globalButton) globalButton.classList.toggle("active", clickedButton === globalButton);
        if (trainingButton) trainingButton.classList.toggle("active", clickedButton === trainingButton);
        if (startButton) startButton.disabled = false;
        updateQuestionRotationStatus("all");
    };

    globalButton?.addEventListener("click", () => activateGlobalCampaign("exam", globalButton));
    trainingButton?.addEventListener("click", () => activateGlobalCampaign("training", trainingButton));

    // =========================================================
    // DÉBUT DE LA CAMPAGNE
    // =========================================================

    startButton?.addEventListener("click", () => {
        const pool = getQuestionPool(selectedTheme);
        const email = currentAuthenticatedAccount?.email || currentCandidateEmail || "anonymous";
        const history = getQuestionHistory();
        const used = new Set((history[email]?.[selectedTheme] || []).map(normalizeQuestionHistoryKey));
        const available = new Set(pool
            .map(question => normalizeQuestionHistoryKey(question.q))
            .filter(question => !used.has(question))).size;
        if (maxQuestions > available && available > 0) {
            const confirmed = window.confirm(`Il ne reste que ${available} question(s) inédite(s), mais vous en demandez ${maxQuestions}. Continuer avec les questions disponibles ?`);
            if (!confirmed) return;
        }
        if (available === 0 && pool.length > 0) {
            const confirmed = window.confirm("Toutes les questions de ce thème ont déjà été utilisées. Commencer un nouveau cycle ?");
            if (!confirmed) return;
        }
        startQuiz(); // Appel sonar + moteur
    });

    ["admin-accounts-search", "admin-questions-search", "admin-results-search"].forEach(id => {
        document.getElementById(id)?.addEventListener("input", () => {
            if (id === "admin-accounts-search") renderAdminAccounts();
            if (id === "admin-questions-search") renderAdminQuestions();
            if (id === "admin-results-search") renderAdminResults();
        });
    });

    document.getElementById("admin-results-candidate-filter")?.addEventListener("change", renderAdminResults);
    document.getElementById("admin-history-period")?.addEventListener("change", renderAdminResults);

    document.getElementById("reset-question-history-btn")?.addEventListener("click", () => {
        const email = currentAuthenticatedAccount?.email || currentCandidateEmail || "anonymous";
        const confirmed = window.confirm("Réinitialiser votre historique de questions pour tous les thèmes ?");
        if (!confirmed) return;

        const history = getQuestionHistory();
        delete history[email];
        localStorage.setItem(questionHistoryStorageKey, JSON.stringify(history));

        const status = document.getElementById("question-rotation-status");
        if (selectedTheme) {
            updateQuestionRotationStatus(selectedTheme);
            if (status) status.innerText = `Historique réinitialisé. ${status.innerText}`;
        } else if (status) {
            status.classList.remove("hidden");
            status.innerText = "Historique réinitialisé. Sélectionnez un thème pour voir les questions disponibles.";
        }
    });

    document.getElementById("btn-new-mission")?.addEventListener("click", () => {
        selectedTheme = null;
        maxQuestions = 0;
        uiController.resetThemeSelection();
        uiController.switchScreen("theme-screen");
        document.getElementById("theme-select")?.focus();
    });

    document.getElementById("btn-evolution-result")?.addEventListener("click", event => {
        const section = document.getElementById("global-evolution-section");
        if (!section) return;
        const account = currentAuthenticatedAccount || getAccounts()[currentCandidateEmail];
        const candidateId = String(account?.id || currentCandidateEmail || "candidat-inconnu");
        const isOpening = section.classList.contains("hidden");

        if (isOpening) {
            const periodDays = Number(document.getElementById("global-evolution-period")?.value || 0);
            renderGlobalEvolution(getResults(), candidateId, currentCandidateEmail || account?.email || "", periodDays);
        }
        section.classList.toggle("hidden", !isOpening);
        event.currentTarget.setAttribute("aria-expanded", String(isOpening));
    });

    document.getElementById("btn-history-theme")?.addEventListener("click", event => {
        const panel = document.getElementById("candidate-history-panel");
        if (!panel) return;
        const account = currentAuthenticatedAccount || getAccounts()[currentCandidateEmail];
        const candidateId = String(account?.id || currentCandidateEmail || "candidat-inconnu");
        renderCandidateHistory(
            getResults(),
            candidateId,
            currentCandidateEmail || account?.email || "",
            Number(document.getElementById("candidate-history-period")?.value || 0)
        );
        uiController.switchScreen("history-screen");
        event.currentTarget.setAttribute("aria-expanded", "true");
    });

    document.getElementById("btn-back-to-campaign")?.addEventListener("click", () => {
        uiController.switchScreen("theme-screen");
        document.getElementById("btn-history-theme")?.setAttribute("aria-expanded", "false");
    });

    document.getElementById("candidate-history-period")?.addEventListener("change", event => {
        const account = currentAuthenticatedAccount || getAccounts()[currentCandidateEmail];
        renderCandidateHistory(
            getResults(),
            String(account?.id || currentCandidateEmail || "candidat-inconnu"),
            currentCandidateEmail || account?.email || "",
            Number(event.currentTarget.value || 0)
        );
    });

    document.getElementById("global-evolution-period")?.addEventListener("change", event => {
        const account = currentAuthenticatedAccount || getAccounts()[currentCandidateEmail];
        const candidateId = String(account?.id || currentCandidateEmail || "candidat-inconnu");
        renderGlobalEvolution(getResults(), candidateId, currentCandidateEmail || account?.email || "", Number(event.currentTarget.value || 0));
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
        currentCandidateEmail = "";
        clearPendingSignup();
        uiController.switchScreen("auth-screen");
        document.getElementById("login-form").reset();
        showAuthView("login");
    });

    document.getElementById("admin-logout-btn").addEventListener("click", async () => {
        if (supabase) {
            try {
                if ("serviceWorker" in navigator && "PushManager" in window) {
                    await disableReportNotifications(getAdminPushOptions());
                }
                await supabase.auth.signOut();
            } catch (error) {
                window.alert(`Déconnexion administrateur impossible : ${error.message}`);
                return;
            }
        }
        currentAuthenticatedAccount = null;
        currentCandidateEmail = "";
        uiController.switchScreen("auth-screen");
        document.getElementById("admin-form").reset();
        showAuthView("login");
    });

    [
        ["admin-push-enable-btn", enableReportNotifications],
        ["admin-push-disable-btn", disableReportNotifications]
    ].forEach(([id, action]) => {
        document.getElementById(id)?.addEventListener("click", async event => {
            const button = event.currentTarget;
            button.disabled = true;
            setAuthMessage("admin-push-status", "Configuration des notifications...");
            try {
                await action(getAdminPushOptions());
                await refreshAdminPushStatus();
            } catch (error) {
                setAuthMessage("admin-push-status", `Notifications impossibles : ${error.message}`);
            } finally {
                button.disabled = false;
            }
        });
    });

    document.getElementById("admin-question-theme").addEventListener("change", () => {
        resetQuestionForm();
        renderAdminQuestions();
    });

    document.getElementById("question-cancel-btn").addEventListener("click", resetQuestionForm);

    document.getElementById("cleanup-questions-btn").addEventListener("click", async () => {
        if (!questionSourceReady) return;

        const cleanupSummary = await syncQuestionMutation({ action: "cleanup" });
        const removed = cleanupSummary?.removed || 0;
        setAuthMessage("question-message", `${removed} doublon(s) supprimé(s).`);
        const loaded = await loadQuestionsFromSupabase();
        if (loaded) renderAdminQuestions();
    });

    document.querySelectorAll(".admin-nav-btn").forEach(button => {
        button.addEventListener("click", () => switchAdminSection(button.dataset.adminSection));
    });

    const reportToggle = document.getElementById("question-report-toggle");
    const reportForm = document.getElementById("question-report-form");
    const reportDetails = document.getElementById("question-report-details");
    const reportSubmit = document.getElementById("question-report-submit");
    const resetQuestionReportForm = () => {
        reportForm?.classList.add("hidden");
        reportToggle?.setAttribute("aria-expanded", "false");
        reportToggle?.removeAttribute("disabled");
        if (reportToggle) reportToggle.innerText = "Signaler une erreur dans cette question";
        reportForm?.reset();
        if (reportSubmit) reportSubmit.disabled = false;
        setAuthMessage("question-report-status", "");
    };

    reportToggle?.addEventListener("click", () => {
        const isOpening = reportForm?.classList.contains("hidden") || false;
        reportForm?.classList.toggle("hidden", !isOpening);
        reportToggle.setAttribute("aria-expanded", String(isOpening));
        if (isOpening) reportDetails?.focus();
    });
    document.getElementById("question-report-cancel")?.addEventListener("click", resetQuestionReportForm);
    reportForm?.addEventListener("submit", async event => {
        event.preventDefault();
        const question = displayedQuestion;
        if (!question) {
            setAuthMessage("question-report-status", "Cette question n’est plus disponible.");
            return;
        }

        reportSubmit.disabled = true;
        setAuthMessage("question-report-status", "Envoi du signalement...");
        try {
            await submitQuestionReport(
                question,
                resolveQuestionAnswers(question),
                selectedTheme,
                reportDetails?.value || ""
            );
            setAuthMessage("question-report-status", "Merci, votre signalement a été envoyé à l’administrateur.");
            reportToggle.innerText = "Question signalée";
            reportToggle.disabled = true;
            reportForm.classList.add("hidden");
            reportToggle.setAttribute("aria-expanded", "false");
        } catch (error) {
            setAuthMessage("question-report-status", `Envoi impossible : ${error.message}`);
            reportSubmit.disabled = false;
        }
    });

    document.getElementById("refresh-admin-accounts-btn")?.addEventListener("click", async event => {
        const button = event.currentTarget;
        button.disabled = true;
        setAuthMessage("admin-data-status", "Synchronisation des comptes avec Supabase...");
        try {
            await loadAdminData();
            renderAdminAccounts();
            renderAdminResults();
            renderAdminQuestionReports();
            setAuthMessage("admin-data-status", "Comptes synchronisés depuis Supabase.");
        } catch (error) {
            setAuthMessage("admin-data-status", error?.message || "Impossible de synchroniser les comptes.");
        } finally {
            button.disabled = false;
        }
    });

    document.getElementById("question-form").addEventListener("submit", async event => {
        event.preventDefault();
        const themeId = document.getElementById("admin-question-theme").value;
        const question = {
            id: editingQuestionIndex === null
                ? createRecordId()
                : questionsBank[themeId].questions[editingQuestionIndex].id,
            q: document.getElementById("admin-question-text").value.trim(),
            r: [1, 2, 3, 4].map(answerIndex =>
                document.getElementById(`admin-answer-${answerIndex}`).value.trim()
            ),
            correct: parseInt(document.getElementById("admin-correct-answer").value, 10)
        };
        const questions = questionsBank[themeId].questions;
        const destinationThemeId = getQuestionTheme(question, themeId);
        const destinationQuestions = questionsBank[destinationThemeId].questions;

        try {
            if (supabase) {
                if (!questionSourceReady) {
                    throw new Error("La banque Supabase n’est pas synchronisée. Réessayez après le chargement des questions.");
                }
                const syncResult = await syncQuestionMutation({
                    action: editingQuestionIndex === null ? "create" : "update",
                    id: question.id,
                    question: { ...question, themeId: destinationThemeId }
                });

                if (!syncResult?.created && !syncResult?.updated) {
                    throw new Error("Supabase n’a pas confirmé l’enregistrement de la question.");
                }
                if (syncResult.id) question.id = syncResult.id;
            }

            if (editingQuestionIndex === null) {
                destinationQuestions.push(question);
            } else if (destinationThemeId !== themeId) {
                questions.splice(editingQuestionIndex, 1);
                destinationQuestions.push(question);
            } else {
                questions[editingQuestionIndex] = question;
            }

            saveCurrentThemeQuestions(themeId);
            if (destinationThemeId !== themeId) saveCurrentThemeQuestions(destinationThemeId);
            resetQuestionForm();
            const themeField = document.getElementById("admin-question-theme");
            themeField.value = destinationThemeId;
            const storageMessage = supabase
                ? "Question enregistrée dans Supabase."
                : "Question enregistrée localement.";
            setAuthMessage("question-message", destinationThemeId === themeId
                ? storageMessage
                : `${storageMessage} Question reclassée : ${themeField.selectedOptions[0].textContent}.`);
            renderAdminQuestions();
        } catch (error) {
            setAuthMessage(
                "question-message",
                `Enregistrement impossible : ${error?.message || "Supabase n’a pas accepté la modification."}`
            );
        }
    });

    document.getElementById("close-app").addEventListener("click", async () => {
        if (document.getElementById("quiz-screen")?.classList.contains("active")) {
            const confirmed = await showConfirmOverlay({
                title: "Abandonner le combat ?",
                message: "Abandonner le combat en cours et effectuer un repli stratégique ?",
                okLabel: "Repli",
                cancelLabel: "Poursuivre le combat"
            });
            if (!confirmed) return;
            currentQuizRunId += 1;
            questionTransitionLocked = false;
            selectedTheme = null;
            maxQuestions = 0;
            uiController.resetThemeSelection();
            uiController.switchScreen("theme-screen");
            return;
        }
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
    const poolKeys = new Set(pool.map(question => normalizeQuestionHistoryKey(question.q)));
    const currentHistory = [...new Set(themeHistory)].filter(question =>
        poolKeys.has(normalizeQuestionHistoryKey(question))
    );
    const excludedQuestions = currentHistory.length >= pool.length ? [] : currentHistory;

    // Sélection du thème dans le moteur
    quizEngine.selectTheme(selectedTheme, maxQuestions, excludedQuestions);
    reviewItems = [];
    questionTransitionLocked = false;
    displayedQuestion = null;
    currentQuizRunId += 1;
    finalizedQuizRunId = -1;

    if (!history[email]) history[email] = {};
    history[email][selectedTheme] = [
        ...new Set([...excludedQuestions, ...quizEngine.questions.map(question => question.q)])
    ];
    localStorage.setItem(questionHistoryStorageKey, JSON.stringify(history));

    // Passage à l’écran quiz
    uiController.switchScreen("quiz-screen");

    // Affichage de la première question
    afficherSituation(currentQuizRunId);
}

// =========================================================
// AFFICHAGE D’UNE SITUATION TACTIQUE
// =========================================================

function afficherSituation(quizRunId = typeof currentQuizRunId === "number" ? currentQuizRunId : 0) {
    const activeQuizRunId = typeof currentQuizRunId === "number" ? currentQuizRunId : quizRunId;
    if (quizRunId !== activeQuizRunId) return;
    questionTransitionLocked = false;
    const q = quizEngine.getCurrent();
    if (!q) {
        void Promise.resolve(bilanFinal(activeQuizRunId)).catch(error => {
            console.error("Finalisation du quiz impossible.", error);
        });
        return;
    }
    const answers = typeof resolveQuestionAnswers === "function"
        ? resolveQuestionAnswers(q)
        : (Array.isArray(q.r) ? q.r : []);
    const progressNode = document.getElementById("progress");
    const livePointsNode = document.getElementById("live-points");
    const questionNode = document.getElementById("question");
    const optionsGrid = document.getElementById("options-grid");
    const skip = document.getElementById("skip-btn");
    const nextQuestion = document.getElementById("next-question-btn");
    if (!progressNode || !livePointsNode || !questionNode || !optionsGrid || !skip || !nextQuestion) {
        console.warn("Éléments du quiz introuvables : écran non initialisé.");
        return;
    }
    displayedQuestion = q;
    nextQuestion.disabled = true;
    nextQuestion.innerText = "Question suivante";
    nextQuestion.onclick = null;

    progressNode.innerText =
        `Question ${quizEngine.index + 1} / ${quizEngine.questions.length}`;

    livePointsNode.innerText =
        `Points : ${quizEngine.stats.points}`;

    const reportToggle = document.getElementById("question-report-toggle");
    reportToggle?.removeAttribute("disabled");
    if (reportToggle) reportToggle.innerText = "Signaler une erreur dans cette question";
    const reportForm = document.getElementById("question-report-form");
    reportForm?.classList.add("hidden");
    reportForm?.reset();
    const reportSubmit = document.getElementById("question-report-submit");
    reportSubmit?.removeAttribute("disabled");
    reportToggle?.setAttribute("aria-expanded", "false");
    const reportStatus = document.getElementById("question-report-status");
    if (reportStatus) reportStatus.innerText = "";

    questionNode.innerText = q.q;
    optionsGrid.innerHTML = "";

    // Génération des options
    answers.forEach((optionText, index) => {
        const btn = document.createElement("button");
        btn.className = "btn";
        btn.innerText = optionText;

        btn.onclick = () => {
            if (questionTransitionLocked) return;
            questionTransitionLocked = true;
            verrouillerOptions();
            if (typeof quizFeedbackMode === "undefined" || quizFeedbackMode !== "exam") {
                playAnswerSound(index === q.correct);
            }
            if (index !== q.correct) {
                reviewItems.push({
                    type: "wrong",
                    question: q.q,
                    selected: optionText,
                    correct: answers[q.correct]
                });
            }
            const encore = quizEngine.answer(index);
            livePointsNode.innerText = `Points : ${quizEngine.stats.points}`;
            try {
                marquerBoutons(index, q.correct);
            } catch (error) {
                console.warn("Marquage des réponses indisponible.", error);
            }
            nextQuestion.innerText = encore ? "Question suivante" : "Voir le bilan";
            nextQuestion.disabled = false;
        };

        optionsGrid.appendChild(btn);
    });

    // Bouton skip
    skip.disabled = false;
    skip.onclick = () => {
        if (questionTransitionLocked) return;
        questionTransitionLocked = true;
        verrouillerOptions();
        reviewItems.push({
            type: "skipped",
            question: q.q,
            correct: answers[q.correct]
        });
        const encore = quizEngine.answer(null);
        livePointsNode.innerText = `Points : ${quizEngine.stats.points}`;
        try {
            marquerBoutons(null, q.correct);
        } catch (error) {
            console.warn("Marquage des réponses indisponible.", error);
        }
        nextQuestion.innerText = encore ? "Question suivante" : "Voir le bilan";
        nextQuestion.disabled = false;
    };
    nextQuestion.onclick = () => {
        if (!questionTransitionLocked || nextQuestion.disabled) return;
        nextQuestion.disabled = true;
        const encore = quizEngine.index < quizEngine.questions.length;
        if (encore) {
            afficherSituation(activeQuizRunId);
            return;
        }
        void Promise.resolve(bilanFinal(activeQuizRunId)).catch(error => {
            console.error("Finalisation du quiz impossible.", error);
        });
    };
}

// =========================================================
// VERROUILLAGE DES OPTIONS
// =========================================================

function verrouillerOptions() {
    document.querySelectorAll("#options-grid .btn, #skip-btn")
        .forEach(btn => btn.disabled = true);
}

// =========================================================
// MARQUAGE VISUEL DES RÉPONSES
// =========================================================

function marquerBoutons(selected, correct) {
    const btns = document.querySelectorAll("#options-grid .btn");

    if (typeof quizFeedbackMode !== "undefined" && quizFeedbackMode === "exam") {
        if (btns[selected]) {
            btns[selected].classList.add("selected");
        }
        return;
    }

    if (btns[selected]) {
        btns[selected].classList.add(
            selected === correct ? "correct" : "incorrect"
        );
    }

    if (btns[correct]) {
        btns[correct].classList.add("correct");
    }
}

// =========================================================
// BILAN FINAL
// =========================================================

async function bilanFinal(quizRunId = typeof currentQuizRunId === "number" ? currentQuizRunId : 0) {
    const activeQuizRunId = typeof currentQuizRunId === "number" ? currentQuizRunId : quizRunId;
    if (quizRunId !== activeQuizRunId) return;
    const isCurrentQuizRun = () =>
        (typeof currentQuizRunId === "number" ? currentQuizRunId : activeQuizRunId) === quizRunId;

    try {
        if (finalizedQuizRunId === quizRunId) return;
        finalizedQuizRunId = quizRunId;

        const setResultText = (ids, value) => {
            const target = ids
                .map(id => document.getElementById(id))
                .find(Boolean);
            if (target) target.innerText = value;
        };

        const total = scoring.getQuestionCount(quizEngine.stats, quizEngine.questions.length);
        const note = scoring.computeFinal(quizEngine.stats, total);
        const email = currentCandidateEmail || currentAuthenticatedAccount?.email || "Candidat inconnu";
        const account = currentAuthenticatedAccount || getAccounts()[email];
        const candidateId = String(account?.id || (email !== "Candidat inconnu" ? email : "candidat-inconnu"));
        const label = getCandidateLabel(account, candidateId);
        const resultRecord = {
            id: createRecordId(),
            candidateId,
            label,
            email: email === "Candidat inconnu" ? "" : email,
            name: account?.name || "",
            theme: selectedTheme,
            score: note,
            correct: quizEngine.stats.correct,
            wrong: quizEngine.stats.wrong,
            skipped: quizEngine.stats.skipped,
            total,
            date: new Date().toLocaleString("fr-FR")
        };
        const storedResults = getResults();
        const fallbackResult = normalizeResultRecord({ ...resultRecord, synced: false });
        const rankingResults = storedResults.some(result => result.id === resultRecord.id)
            ? storedResults
            : [fallbackResult, ...storedResults];

        uiController.switchScreen("result-screen");

        setResultText(["score-display", "final-score"], `${note.toFixed(2)} / 20`);
        setResultText(["stat-correct"], quizEngine.stats.correct);
        setResultText(["stat-wrong"], quizEngine.stats.wrong);
        setResultText(["stat-skipped"], quizEngine.stats.skipped);

        const maxPts = total * 4;
        setResultText(["stat-brut"], quizEngine.stats.points);
        setResultText(["brut-max"], `/ ${maxPts}`);

        const evolutionButton = document.getElementById("btn-evolution-result");
        const isGlobalCampaign = selectedTheme === "all";
        evolutionButton?.classList.toggle("hidden", !isGlobalCampaign);
        evolutionButton?.setAttribute("aria-hidden", String(!isGlobalCampaign));
        if (!isGlobalCampaign) {
            document.getElementById("global-evolution-section")?.classList.add("hidden");
        }

        try {
            renderGlobalRanking(rankingResults);
        } catch (error) {
            console.warn("Rendu du classement indisponible.", error);
        }

        try {
            renderReview();
        } catch (error) {
            console.warn("Rendu de la revue indisponible.", error);
        }

        try {
            await saveResult(resultRecord);
            if (!isCurrentQuizRun()) return;
            if (typeof loadPublicGlobalRanking === "function") {
                try {
                    await loadPublicGlobalRanking();
                } catch (error) {
                    console.warn("Actualisation du classement indisponible.", error);
                }
            }
            try {
                renderGlobalRanking(getResults());
            } catch (error) {
                console.warn("Actualisation du classement indisponible.", error);
            }
        } catch (error) {
            console.warn("Synchronisation distante du résultat indisponible.", error);
            if (!isCurrentQuizRun()) return;
            if (typeof loadPublicGlobalRanking === "function") {
                try {
                    await loadPublicGlobalRanking();
                } catch (rankingError) {
                    console.warn("Actualisation du classement indisponible.", rankingError);
                }
            }
            try {
                renderGlobalRanking(getResults());
            } catch (rankingError) {
                console.warn("Actualisation du classement indisponible.", rankingError);
            }
        }
    } catch (error) {
        if (finalizedQuizRunId === quizRunId) {
            finalizedQuizRunId = -1;
        }
        throw error;
    }
}

function renderReview() {
    const section = document.getElementById("review-section");
    const list = document.getElementById("review-list");
    if (!section || !list) return;
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
    startStartupProgress();
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
