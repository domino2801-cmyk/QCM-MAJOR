// =========================================================
// APP.JS — POINT D’ENTRÉE TACTIQUE DE L’APPLICATION BM4
// =========================================================

// Importation des modules (à créer dans /modules/)
import { quizEngine } from "./modules/quiz-engine/index.js";
import { scoring } from "./modules/quiz-engine/scoring.js";
import { questionsBank, getAllQuestions } from "./modules/questions-bank/index.js";
import { showStartupRecoveryState } from "./modules/startup-recovery/index.js";
import { uiController } from "./modules/ui-controller/index.js";

// =========================================================
// VARIABLES D’ÉTAT
// =========================================================

let selectedTheme = null;
let maxQuestions = 0;
let reviewItems = [];
let questionTransitionLocked = false;
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
let publicGlobalRankingCache = [];
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

function createRecordId(prefix = "record") {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeResultRecord(rawResult = {}) {
    if (!rawResult || typeof rawResult !== "object") return null;

    return {
        id: rawResult.id || createRecordId("result"),
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
        : rawResult.name || rawResult.label || rawResult.email || "Candidat inconnu";

    return {
        id: rawResult.id || createRecordId("public-ranking"),
        label: displayName,
        email: "",
        name: displayName,
        theme: rawResult.theme || "all",
        score: Number(rawResult.score || 0),
        date: rawResult.date || "",
        createdAt: rawResult.created_at || rawResult.createdAt || new Date().toISOString()
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
            return String(second.createdAt).localeCompare(String(first.createdAt));
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
            await supabaseRestRequest("/question_bank", {
                method: "POST",
                accessToken,
                prefer: "return=minimal",
                body: [{
                    id: question.id,
                    theme_id: question.themeId,
                    question: question.q,
                    answer_1: question.r[0] || "",
                    answer_2: question.r[1] || "",
                    answer_3: question.r[2] || "",
                    answer_4: question.r[3] || "",
                    correct_answer: question.r[question.correct] || ""
                }]
            });
        return { created: true };
    }

    if (payload.action === "update") {
            const question = payload.question;
            if (!payload.id) throw new Error("Identifiant Supabase de la question introuvable.");
            await supabaseRestRequest(`/question_bank?id=eq.${encodeURIComponent(payload.id)}`, {
                method: "PATCH",
                accessToken,
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
    const query = "/question_bank?select=id,theme_id,question,answer_1,answer_2,answer_3,answer_4,correct_answer&active=eq.true";

    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const data = await supabaseRestRequest(query, { accessToken });
            return {
                questions: (Array.isArray(data) ? data : []).map(question => {
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
                })
            };
        } catch (error) {
            if (attempt === 2) throw error;
            await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
        }
    }
}

async function loadQuestionsFromSupabase() {
    if (!supabase) return false;

    try {
        const data = await fetchSupabaseQuestions();

        if (!Array.isArray(data.questions)) return false;

        const localQuestions = Object.entries(questionsBank).flatMap(([themeId, theme]) =>
            theme.questions.map((question, index) => ({
                id: question.id || `${themeId}-${index + 1}`,
                themeId,
                q: question.q,
                r: normalizeQuestionAnswers(question.r),
                correct: question.correct
            }))
        );

        if (data.questions.length >= localQuestions.length || !getStoredSupabaseSession()?.access_token) {
            applyRemoteQuestions(data.questions);
            questionSourceReady = true;
            return true;
        }

        await syncQuestionMutation({ action: "seed", force: true, questions: localQuestions });
        const verifyData = await fetchSupabaseQuestions();
        if (!Array.isArray(verifyData.questions) || verifyData.questions.length === 0) return false;

        applyRemoteQuestions(verifyData.questions);
        questionSourceReady = true;
        return true;
    } catch {
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
    if (!supabase) return false;

    try {
        const data = await supabaseRestRequest(
            "/public_global_campaign_top3?select=display_name,score,created_at&order=score.desc,created_at.desc"
        );
        if (!Array.isArray(data)) return false;
        setPublicGlobalRanking(data);
        return true;
    } catch (error) {
        if (!throwOnError) return false;
        const rankingError = new Error(`Lecture du Top 3 public impossible : ${error?.message || "Supabase a refusé la lecture."}`);
        rankingError.cause = error;
        throw rankingError;
    }
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

async function deleteResult(resultId) {
    if (!resultId) return;
    setResults(getResults().filter(result => result.id !== resultId));
    queueResultDelete(resultId);
    if (!supabase) return;

    try {
        await flushPendingResultSync();
    } catch {
        // Conserver la copie locale si la suppression distante échoue.
    }

    if (typeof loadPublicGlobalRanking === "function") {
        await loadPublicGlobalRanking();
    }
}

async function clearResults() {
    const allIds = getResults().map(result => result.id).filter(Boolean);
    setResults([]);
    allIds.forEach(queueResultDelete);
    if (!supabase) return;

    try {
        await flushPendingResultSync();
    } catch {
        // Conserver la copie locale si le nettoyage distant échoue.
    }

    if (typeof loadPublicGlobalRanking === "function") {
        await loadPublicGlobalRanking();
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
        5: "5. Histoire & Traditions"
    };

    Object.entries(themeTitles).forEach(([themeId, label]) => {
        const option = [...themeSelect.options].find(entry => entry.value === themeId);
        if (!option) return;

        option.textContent = label;
    });

    const qtyInput = document.getElementById("qty-theme");
    if (qtyInput) {
        const currentThemeId = themeSelect.value || "1";
        const maxQuestionsCount = getQuestionPool(currentThemeId).length;
        qtyInput.max = maxQuestionsCount;
    }
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
            showAuthenticatedApp(repairedAccount.email, repairedAccount);
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
    showAuthenticatedApp(mergedAccount.email, mergedAccount);
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
        if (field.id === "register-password") return "Le mot de passe candidat est requis.";
        if (field.id === "register-specialty") return "Sélectionnez une spécialité BM4 avant de créer le compte.";
    }

    if (field.validity.typeMismatch && field.id === "register-email") {
        return "Renseignez une adresse mail valide.";
    }

    if (field.validity.tooShort && field.id === "register-password") {
        return `Le mot de passe doit contenir au moins ${field.minLength || 6} caractères.`;
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

function showAuthenticatedApp(email, account = getAccounts()[email] || {}) {
    setAuthAudioPlaying(false);
    const accountSummary = document.getElementById("account-summary");
    if (accountSummary) {
        accountSummary.innerText =
            `${account.name || "Candidat"} • ${email} • ${formatSpecialtyLabel(account.specialty)}`;
    }
    uiController.switchScreen("theme-screen");
    renderGlobalRanking(getResults());
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
    switchAdminSection("accounts");
    uiController.switchScreen("admin-screen");

    try {
        await loadAdminData();
        renderAdminAccounts();
        renderAdminResults();
        setAuthMessage("admin-data-status", "Données administrateur synchronisées avec Supabase.");
    } catch (error) {
        console.warn("Chargement des données administrateur impossible.", error);
        setAuthMessage("admin-data-status", error?.message || "Impossible de charger les comptes depuis Supabase.");
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

        nameCell.innerText = account.name || "Non renseigné";
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
    const selectedCandidate = candidateFilter?.value || "";

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
    }

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
        const actionCell = document.createElement("td");
        const deleteButton = document.createElement("button");

        candidateCell.innerText = result.label || result.name || result.email || "Candidat inconnu";
        scoreCell.innerText = `${result.score.toFixed(2)} / 20`;
        answersCell.innerText = `${result.correct} correcte(s), ${result.wrong} fausse(s), ${result.skipped} passée(s)`;
        dateCell.innerText = result.date;
        deleteButton.type = "button";
        deleteButton.className = "admin-delete-btn";
        deleteButton.innerText = "Supprimer";
        deleteButton.addEventListener("click", async () => {
            await deleteResult(result.id);
            renderAdminResults();
            renderGlobalRanking(getResults());
        });

        actionCell.appendChild(deleteButton);
        row.append(candidateCell, scoreCell, answersCell, dateCell, actionCell);
        list.appendChild(row);
    });
}

function renderGlobalRanking(results) {
    const section = document.getElementById("global-ranking-section");
    const list = document.getElementById("global-ranking-list");
    const loginSection = document.getElementById("login-global-ranking-section");
    const loginList = document.getElementById("login-global-ranking-list");
    const themeSection = document.getElementById("theme-global-ranking-section");
    const themeList = document.getElementById("theme-global-ranking-list");
    const historySection = document.getElementById("history-global-ranking-section");
    const historyList = document.getElementById("history-global-ranking-list");
    if ((!section || !list)
        && (!loginSection || !loginList)
        && (!themeSection || !themeList)
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
            return String(second.createdAt).localeCompare(String(first.createdAt));
        })
        .slice(0, 3);
    const loginRanking = getPublicGlobalRanking();

    [list, loginList, themeList, historyList].filter(Boolean).forEach(target => {
        target.innerHTML = "";
    });
    section?.classList.toggle("hidden", ranking.length === 0);
    themeSection?.classList.toggle("hidden", ranking.length === 0);
    historySection?.classList.toggle("hidden", ranking.length === 0);
    loginSection?.classList.toggle("hidden", loginRanking.length === 0);

    const rankingSymbols = ["🏆", "🥈", "🥉"];
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
            rankElement.innerText = rankingSymbols[rank - 1] || `${rank}.`;
            candidateElement.className = "global-ranking-candidate";
            candidateElement.innerText = result.name || result.label || result.email || "Pseudo non renseigné";
            scoreElement.innerText = `${result.score.toFixed(2)} / 20`;
            dateElement.innerText = date;
            item.append(rankElement, candidateElement, scoreElement, dateElement);
            target.appendChild(item);
        });
    };

    appendRanking(list, ranking);
    appendRanking(themeList, ranking);
    appendRanking(historyList, ranking);
    appendRanking(loginList, loginRanking);
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

function renderCandidateHistory(results, candidateId, candidateEmail = "", periodDays = 0) {
    const charts = document.getElementById("candidate-history-charts");
    const recommendation = document.getElementById("candidate-history-recommendation");
    const summary = document.getElementById("candidate-history-summary");
    if (!charts || !recommendation) return;

    const cutoff = periodDays > 0 ? Date.now() - periodDays * 24 * 60 * 60 * 1000 : 0;
    const normalizedEmail = String(candidateEmail || "").trim().toLowerCase();
    const history = results
        .filter(result => result.candidateId === candidateId
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
        ["5", "Thème 5 • Histoire & Traditions"]
    ];

    const totalScores = history.map(result => Number(result.score) || 0);
    if (summary && totalScores.length > 0) {
        const average = totalScores.reduce((total, score) => total + score, 0) / totalScores.length;
        summary.innerText = `${history.length} résultat(s) • Moyenne : ${average.toFixed(2)} / 20`;
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
    appendBars(globalChart, history.filter(result => result.theme === "all"));
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
                ? "Définissez un nouveau mot de passe pour finaliser la récupération du compte."
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
    const passwordField = getRequiredFormElement(registerForm, "password", "register-message", "Le champ mot de passe est introuvable.");
    const specialtyField = getRequiredFormElement(registerForm, "specialty", "register-message", "Le champ spécialité est introuvable.");

    if (!pseudoField || !emailField || !passwordField || !specialtyField) {
        return;
    }

    const name = pseudoField.value.trim();
    const email = normalizeEmail(emailField.value);
    const password = passwordField.value;
    const specialty = specialtyField.value.trim();

    if (!name || !specialty) {
        setAuthMessage("register-message", "Tous les champs du profil candidat sont requis.");
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
                setAuthMessage("login-message", "Adresse mail ou mot de passe incorrect.");
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
            setAuthMessage("login-message", getFriendlyAuthError(error, "Adresse mail ou mot de passe incorrect."));
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
            currentCandidateEmail = "";
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
                setAuthMessage("admin-message", "Identifiant ou mot de passe administrateur incorrect.");
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
            setAuthMessage("admin-message", getFriendlyAuthError(error, "Identifiant ou mot de passe administrateur incorrect."));
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
    // =========================================================
    // SÉLECTION DU THÉÂTRE D’OPÉRATION
    // =========================================================

    const startButton = document.getElementById("start-btn");
    const themeSelect = document.getElementById("theme-select");
    const qtyInput = document.getElementById("qty-theme");
    const globalButton = document.getElementById("theme-global-btn");

    const enableStartButton = (themeId) => {
        selectedTheme = themeId;
        updateQuestionRotationStatus(themeId);
        maxQuestions = parseInt(qtyInput?.value, 10) || 5;

        if (startButton) {
            startButton.disabled = false;
        }
    };

    const applySelectedTheme = () => {
        const themeId = themeSelect?.value || "";

        if (!themeId) {
            selectedTheme = null;
            maxQuestions = 0;
            if (globalButton) globalButton.classList.remove("active");
            if (startButton) startButton.disabled = true;
            return;
        }

        if (qtyInput) {
            const maxAllowed = getQuestionPool(themeId).length;
            qtyInput.max = maxAllowed;
            qtyInput.value = String(Math.min(parseInt(qtyInput.value, 10) || 5, maxAllowed));
        }

        if (globalButton) globalButton.classList.remove("active");
        enableStartButton(themeId);
    };

    themeSelect?.addEventListener("change", applySelectedTheme);
    qtyInput?.addEventListener("input", () => {
        if (!themeSelect?.value) return;

        const maxAllowed = getQuestionPool(themeSelect.value).length;
        const requested = parseInt(qtyInput.value, 10) || 1;
        maxQuestions = Math.min(Math.max(requested, 1), maxAllowed);
        qtyInput.value = String(maxQuestions);
        if (startButton) startButton.disabled = false;
    });

    globalButton?.addEventListener("click", () => {
        if (themeSelect) themeSelect.value = "";
        selectedTheme = "all";
        maxQuestions = 50;
        if (qtyInput) {
            qtyInput.max = getAllQuestions().length;
            qtyInput.value = "50";
        }
        if (globalButton) globalButton.classList.add("active");
        if (startButton) startButton.disabled = false;
        updateQuestionRotationStatus("all");
    });

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
                await supabase.auth.signOut();
            } catch {
                window.alert("La révocation de session administrateur a échoué. Réessayez.");
                return;
            }
        }
        currentAuthenticatedAccount = null;
        currentCandidateEmail = "";
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

        const cleanupSummary = await syncQuestionMutation({ action: "cleanup" });
        const removed = cleanupSummary?.removed || 0;
        setAuthMessage("question-message", `${removed} doublon(s) supprimé(s).`);
        const loaded = await loadQuestionsFromSupabase();
        if (loaded) renderAdminQuestions();
    });

    document.querySelectorAll(".admin-nav-btn").forEach(button => {
        button.addEventListener("click", () => switchAdminSection(button.dataset.adminSection));
    });

    document.getElementById("clear-results-btn").addEventListener("click", async () => {
        await clearResults();
        renderAdminResults();
        renderGlobalRanking(getResults());
    });

    document.getElementById("refresh-admin-accounts-btn")?.addEventListener("click", async event => {
        const button = event.currentTarget;
        button.disabled = true;
        setAuthMessage("admin-data-status", "Synchronisation des comptes avec Supabase...");
        try {
            await loadAdminData();
            renderAdminAccounts();
            renderAdminResults();
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
                ? createRecordId("question")
                : questionsBank[themeId].questions[editingQuestionIndex].id,
            q: document.getElementById("admin-question-text").value.trim(),
            r: [1, 2, 3, 4].map(answerIndex =>
                document.getElementById(`admin-answer-${answerIndex}`).value.trim()
            ),
            correct: parseInt(document.getElementById("admin-correct-answer").value, 10)
        };
        const questions = questionsBank[themeId].questions;

        try {
            if (questionSourceReady) {
                const syncResult = await syncQuestionMutation({
                    action: editingQuestionIndex === null ? "create" : "update",
                    id: question.id,
                    question: { ...question, themeId }
                });

                if (!syncResult?.created && !syncResult?.updated) {
                    throw new Error("Supabase n’a pas confirmé l’enregistrement de la question.");
                }
            }

            if (editingQuestionIndex === null) {
                questions.push(question);
            } else {
                questions[editingQuestionIndex] = question;
            }

            saveCurrentThemeQuestions(themeId);
            document.getElementById("admin-question-theme").value = themeId;
            setAuthMessage("question-message", "Question enregistrée dans Supabase.");
            resetQuestionForm();
            document.getElementById("admin-question-theme").value = themeId;
            renderAdminQuestions();
        } catch (error) {
            setAuthMessage(
                "question-message",
                `Enregistrement impossible : ${error?.message || "Supabase n’a pas accepté la modification."}`
            );
        }
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
    const poolKeys = new Set(pool.map(question => normalizeQuestionHistoryKey(question.q)));
    const currentHistory = [...new Set(themeHistory)].filter(question =>
        poolKeys.has(normalizeQuestionHistoryKey(question))
    );
    const excludedQuestions = currentHistory.length >= pool.length ? [] : currentHistory;

    // Sélection du thème dans le moteur
    quizEngine.selectTheme(selectedTheme, maxQuestions, excludedQuestions);
    reviewItems = [];
    questionTransitionLocked = false;
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
    if (!progressNode || !livePointsNode || !questionNode || !optionsGrid || !skip) {
        console.warn("Éléments du quiz introuvables : écran non initialisé.");
        return;
    }

    progressNode.innerText =
        `Question ${quizEngine.index + 1} / ${quizEngine.questions.length}`;

    livePointsNode.innerText =
        `Points : ${quizEngine.stats.points}`;

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
            playAnswerSound(index === q.correct);
            if (index !== q.correct) {
                reviewItems.push({
                    type: "wrong",
                    question: q.q,
                    selected: optionText,
                    correct: answers[q.correct]
                });
            }
            const encore = quizEngine.answer(index);
            try {
                marquerBoutons(index, q.correct);
            } catch (error) {
                console.warn("Marquage des réponses indisponible.", error);
            }

            setTimeout(() => {
                if (encore) afficherSituation(activeQuizRunId);
                else void Promise.resolve(bilanFinal(activeQuizRunId)).catch(error => {
                    console.error("Finalisation du quiz impossible.", error);
                });
            }, 900);
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
        try {
            marquerBoutons(null, q.correct);
        } catch (error) {
            console.warn("Marquage des réponses indisponible.", error);
        }
        setTimeout(() => {
            if (encore) afficherSituation(activeQuizRunId);
            else void Promise.resolve(bilanFinal(activeQuizRunId)).catch(error => {
                console.error("Finalisation du quiz impossible.", error);
            });
        }, 900);
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
            id: createRecordId("result"),
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
