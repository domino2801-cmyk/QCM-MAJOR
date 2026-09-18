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
        candidateId: rawResult.candidate_id || rawResult.candidateId || "candidat-inconnu",
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

    try {
        const accessToken = getStoredSupabaseSession()?.access_token;

        if (payload.action === "seed") {
            const questions = (payload.questions || []).map(question => ({
                id: question.id,
                theme_id: question.themeId,
                q: question.q,
                r: question.r,
                correct: question.correct
            }));
            if (questions.length === 0) return { seeded: 0 };

            await supabaseRestRequest("/questions?on_conflict=id", {
                method: "POST",
                accessToken,
                prefer: "resolution=merge-duplicates,return=minimal",
                body: questions
            });
            return { seeded: questions.length };
        }

        if (payload.action === "create") {
            const question = payload.question;
            await supabaseRestRequest("/questions", {
                method: "POST",
                accessToken,
                prefer: "return=minimal",
                body: [{
                    id: question.id,
                    theme_id: question.themeId,
                    q: question.q,
                    r: question.r,
                    correct: question.correct
                }]
            });
            return { created: true };
        }

        if (payload.action === "update") {
            const question = payload.question;
            await supabaseRestRequest(`/questions?id=eq.${encodeURIComponent(payload.id)}`, {
                method: "PATCH",
                accessToken,
                body: {
                    theme_id: question.themeId,
                    q: question.q,
                    r: question.r,
                    correct: question.correct
                }
            });
            return { updated: true };
        }

        if (payload.action === "delete") {
            await supabaseRestRequest(`/questions?id=eq.${encodeURIComponent(payload.id)}`, {
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
                await supabaseRestRequest(`/questions?id=in.(${idsFilter})`, {
                    method: "DELETE",
                    accessToken
                });
            }

            return { removed: duplicateIds.length };
        }
    } catch {
        // La copie locale reste disponible si Supabase est temporairement indisponible.
    }

    return null;
}

async function fetchSupabaseQuestions() {
    if (!supabase) return { questions: [] };
    const accessToken = getStoredSupabaseSession()?.access_token;
    const query = "/questions?select=id,theme_id,q,r,correct";

    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const data = await supabaseRestRequest(query, { accessToken });
            return {
                questions: (Array.isArray(data) ? data : []).map(question => {
                    return {
                        id: String(question.id),
                        themeId: String(question.theme_id),
                        q: String(question.q || ""),
                        r: normalizeQuestionAnswers(question.r),
                        correct: Number(question.correct || 0)
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

        if (data.questions.length >= localQuestions.length) {
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

function toSupabaseResultPayload(result) {
    return {
        id: result.id,
        candidate_id: result.candidateId,
        label: result.label,
        email: result.email,
        name: result.name,
        theme: result.theme,
        score: result.score,
        correct: result.correct,
        wrong: result.wrong,
        skipped: result.skipped,
        total: result.total,
        date: result.date
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
    const upserts = upsertIds
        .map(resultId => getResults().find(result => result.id === resultId))
        .filter(Boolean)
        .map(toSupabaseResultPayload);
    if (upserts.length > 0) {
        await supabaseRestRequest("/quiz_results?on_conflict=id", {
            method: "POST",
            accessToken,
            prefer: "resolution=merge-duplicates,return=minimal",
            body: upserts
        });
        const syncedIds = new Set(upserts.map(result => result.id));
        setResults(getResults().map(result => (
            syncedIds.has(result.id) ? { ...result, synced: true } : result
        )));
        pendingResultSync.upserts = pendingResultSync.upserts.filter(id => !syncedIds.has(id));
    }

    persistPendingResultSync();
}

async function loadResultsFromSupabase() {
    if (!supabase) return false;

    try {
        const accessToken = getStoredSupabaseSession()?.access_token;
        const data = await supabaseRestRequest(
            "/quiz_results?select=id,candidate_id,label,email,name,theme,score,correct,wrong,skipped,total,date,created_at&order=created_at.desc",
            { accessToken }
        );
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
    } catch {
        return false;
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
                speciality: account.specialty
            }]
        });
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
        const error = new Error("Profil candidat non finalisé.");
        error.code = profileNotReadyErrorCode;
        throw error;
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
    document.getElementById(id).innerText = message;
}

function clearLegacyStartupSplashState() {
    const splashState = window.__bm4Splash;
    if (!splashState) return;

    if (splashState.timeoutId !== undefined && splashState.timeoutId !== null) {
        window.clearTimeout(splashState.timeoutId);
    }

    window.__bm4Splash = null;
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
    document.getElementById("account-summary").innerText =
        `${account.name || "Candidat"} • ${email} • ${formatSpecialtyLabel(account.specialty)}`;
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
    const list = document.getElementById("admin-accounts-table");
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
    const list = document.getElementById("admin-questions-table");
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
        const viewElement = document.getElementById(`${currentView}-view`);
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
        const storedSyncState = getStoredJson(localStorage, resultsSyncStorageKey, { upserts: [], deletes: [] });
        pendingResultSync = {
            upserts: Array.isArray(storedSyncState?.upserts) ? storedSyncState.upserts : [],
            deletes: Array.isArray(storedSyncState?.deletes) ? storedSyncState.deletes : []
        };
        setResults(Array.isArray(storedResults) ? storedResults : []);
        initializeAuth();
        authUiReady = true;
        const loadedFromSupabase = await loadQuestionsFromSupabase();
        if (!loadedFromSupabase) applyQuestionOverrides();
        await loadResultsFromSupabase();
        updateThemeQuestionCounts();
        renderGlobalRanking(getResults());
        initializeAppInteractions();
        await syncSupabaseSessionFromUrl();
        await restoreSupabaseSession();

        if (isRecoveryModeFromUrl()) {
            uiController.switchScreen("auth-screen");
            currentAuthenticatedAccount = null;
            currentCandidateEmail = "";
            showAuthView("reset", { resetMode: "update" });
        }
        clearLegacyStartupSplashState();
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
        clearLegacyStartupSplashState();
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

    document.getElementById("btn-new-mission")?.addEventListener("click", () => {
        selectedTheme = null;
        maxQuestions = 0;
        uiController.resetThemeSelection();
        uiController.switchScreen("theme-screen");
        document.getElementById("theme-all-btn")?.focus();
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
    questionTransitionLocked = false;
    currentQuizRunId += 1;

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
    questionTransitionLocked = false;
    const q = quizEngine.getCurrent();
    if (!q) {
        bilanFinal();
        return;
    }
    const answers = typeof resolveQuestionAnswers === "function"
        ? resolveQuestionAnswers(q)
        : (Array.isArray(q.r) ? q.r : []);

    document.getElementById("progress").innerText =
        `Question ${quizEngine.index + 1} / ${quizEngine.questions.length}`;

    document.getElementById("live-points").innerText =
        `Points : ${quizEngine.stats.points}`;

    document.getElementById("question").innerText = q.q;

    const optionsGrid = document.getElementById("options-grid");
    const skip = document.getElementById("skip-btn");
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
                if (encore) afficherSituation();
                else bilanFinal();
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
        if (encore) afficherSituation();
        else bilanFinal();
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

    btns[selected].classList.add(
        selected === correct ? "correct" : "incorrect"
    );

    btns[correct].classList.add("correct");
}

// =========================================================
// BILAN FINAL
// =========================================================

async function bilanFinal() {
    const quizRunId = currentQuizRunId;

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
        const maxPts = total * 4;

        uiController.switchScreen("result-screen");

        setResultText(["score-display", "final-score"], `${note.toFixed(2)} / 20`);
        setResultText(["stat-correct"], quizEngine.stats.correct);
        setResultText(["stat-wrong"], quizEngine.stats.wrong);
        setResultText(["stat-skipped"], quizEngine.stats.skipped);
        setResultText(["stat-brut"], quizEngine.stats.points);
        setResultText(["brut-max"], `/ ${maxPts}`);

        try {
            renderReview();
        } catch (error) {
            console.warn("Rendu de la revue indisponible.", error);
        }

        const storedResults = getResults();
        const fallbackEmail = currentCandidateEmail || currentAuthenticatedAccount?.email || "";
        const fallbackCandidateId = String(
            currentAuthenticatedAccount?.id || (fallbackEmail || "candidat-inconnu")
        );
        const fallbackResult = normalizeResultRecord({
            id: createRecordId("result"),
            candidateId: fallbackCandidateId,
            label: currentAuthenticatedAccount?.name || fallbackEmail || "Candidat inconnu",
            email: fallbackEmail,
            name: currentAuthenticatedAccount?.name || "",
            theme: selectedTheme,
            score: note,
            correct: quizEngine.stats.correct,
            wrong: quizEngine.stats.wrong,
            skipped: quizEngine.stats.skipped,
            total,
            date: new Date().toLocaleString("fr-FR"),
            synced: false
        });
        const fallbackResults = storedResults.some(result => result.id === fallbackResult.id)
            ? storedResults
            : [fallbackResult, ...storedResults];
        let preparedFallbackResults = fallbackResults;

        try {
            const email = currentCandidateEmail || currentAuthenticatedAccount?.email || "Candidat inconnu";
            const account = currentAuthenticatedAccount || getAccounts()[email];
            const candidateId = String(account?.id || (email !== "Candidat inconnu" ? email : "candidat-inconnu"));
            const fallbackPreparedLabel = account?.name || (email !== "Candidat inconnu" ? email : fallbackResult.label);
            const preparedFallbackResult = normalizeResultRecord({
                ...fallbackResult,
                candidateId,
                label: fallbackPreparedLabel,
                email: email === "Candidat inconnu" ? "" : email,
                name: account?.name || ""
            });
            preparedFallbackResults = storedResults.some(result => result.id === preparedFallbackResult.id)
                ? storedResults
                : [preparedFallbackResult, ...storedResults];
            const label = getCandidateLabel(account, candidateId);
            preparedFallbackResult.label = label || fallbackPreparedLabel;
            preparedFallbackResults = storedResults.some(result => result.id === preparedFallbackResult.id)
                ? storedResults
                : [preparedFallbackResult, ...storedResults];
            const resultRecord = {
                ...preparedFallbackResult,
                candidateId,
                label: preparedFallbackResult.label,
                synced: undefined
            };
            const results = storedResults.some(result => result.id === resultRecord.id)
                ? storedResults
                : [normalizeResultRecord({ ...resultRecord, synced: false }), ...storedResults];

            try {
                renderGlobalRanking(results);
            } catch (error) {
                console.warn("Rendu du classement indisponible.", error);
            }

            try {
                await saveResult(resultRecord);
                try {
                    renderGlobalRanking(getResults());
                } catch (error) {
                    console.warn("Actualisation du classement indisponible.", error);
                }
            } catch (error) {
                console.warn("Synchronisation distante du résultat indisponible.", error);
                try {
                    renderGlobalRanking(getResults());
                } catch (rankingError) {
                    console.warn("Actualisation du classement indisponible.", rankingError);
                }
            }
        } catch (error) {
            console.warn("Préparation du résultat indisponible.", error);
            try {
                renderGlobalRanking(preparedFallbackResults);
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
