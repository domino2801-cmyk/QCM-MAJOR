async function bilanFinal() {
    const quizRunId = currentQuizRunId;

    try {
        if (finalizedQuizRunId === quizRunId) return;
        finalizedQuizRunId = quizRunId;

        const resultScreen = document.getElementById("result-screen");
        const scoreDisplay = document.getElementById("score-display");

        console.log("DEBUG bilanFinal start", {
            selectedTheme,
            quizRunId,
            questionCount: quizEngine.questions.length,
            index: quizEngine.index,
            stats: quizEngine.stats,
            resultScreenExists: !!resultScreen,
            scoreDisplayExists: !!scoreDisplay,
            finalizationLocked: finalizedQuizRunId === quizRunId
        });

        if (!resultScreen || !scoreDisplay) {
            console.warn("DEBUG: DOM du résultat non prêt avant finalisation.");
            finalizedQuizRunId = -1;
            return;
        }

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
        const results = storedResults.some(result => result.id === resultRecord.id)
            ? storedResults
            : [fallbackResult, ...storedResults];

        console.log("DEBUG before switchScreen", {
            resultScreenExists: !!document.getElementById("result-screen"),
            scoreNodeExists: !!document.getElementById("score-display"),
            reviewNodeExists: !!document.getElementById("review-list"),
            rankingNodeExists: !!document.getElementById("global-ranking-list")
        });

        uiController.switchScreen("result-screen");

        setResultText(["score-display", "final-score"], `${note.toFixed(2)} / 20`);
        setResultText(["stat-correct"], quizEngine.stats.correct);
        setResultText(["stat-wrong"], quizEngine.stats.wrong);
        setResultText(["stat-skipped"], quizEngine.stats.skipped);

        const maxPts = total * 4;
        setResultText(["stat-brut"], quizEngine.stats.points);
        setResultText(["brut-max"], `/ ${maxPts}`);

        console.log("DEBUG after result text set", {
            scoreText: document.getElementById("score-display")?.innerText,
            statCorrect: document.getElementById("stat-correct")?.innerText,
            statWrong: document.getElementById("stat-wrong")?.innerText,
            statSkipped: document.getElementById("stat-skipped")?.innerText
        });

        try {
            console.log("DEBUG renderGlobalRanking call");
            renderGlobalRanking(results);
        } catch (error) {
            console.warn("Rendu du classement indisponible.", error);
        }

        try {
            console.log("DEBUG renderReview call");
            renderReview();
        } catch (error) {
            console.warn("Rendu de la revue indisponible.", error);
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
        console.error("DEBUG bilanFinal crashed", error);
        if (finalizedQuizRunId === quizRunId) {
            finalizedQuizRunId = -1;
        }
        throw error;
    }
}
