function startQuiz() {
    if (!selectedTheme) {
        console.warn("Aucun thème sélectionné pour démarrer la campagne.");
        return;
    }

    const pool = getQuestionPool(selectedTheme);
    if (!Array.isArray(pool) || pool.length === 0) {
        console.warn("Le thème sélectionné ne contient aucune question disponible.");
        return;
    }

    const email = currentAuthenticatedAccount?.email || "anonymous";
    const history = getQuestionHistory();
    const themeHistory = history[email]?.[selectedTheme] || [];
    const currentHistory = themeHistory.filter(question =>
        pool.some(item => item.q === question)
    );
    const excludedQuestions = currentHistory.length >= pool.length ? [] : currentHistory;

    // Sélection du thème dans le moteur
    maxQuestions = Number.isFinite(maxQuestions) && maxQuestions > 0 ? maxQuestions : Math.min(pool.length, 20);
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

function afficherSituation() {
    const optionsGrid = document.getElementById("options-grid");
    const skip = document.getElementById("skip-btn");

    if (!optionsGrid || !skip) {
        console.warn("Éléments du quiz introuvables : écran non initialisé.");
        return;
    }

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

function renderGlobalRanking(results) {
    const section = document.getElementById("global-ranking-section");
    const list = document.getElementById("global-ranking-list");
    if (!section || !list) return;

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
