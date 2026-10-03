export function isUnitLocationQuestion(question) {
    const text = String(question || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    if (text.includes("musee") || text.includes("organigramme")) return false;
    return /implant|stationn|garnison/.test(text)
        || /(?:ctts|groupement de cyberdefense).*base/.test(text)
        || /siege.*(?:deplace|otan)|(?:ville|commune).*(?:brigade|regiment|bataillon|centre de formation)/.test(text)
        || /installe|centac.*situe|camp militaire.*superficie/.test(text)
        || /(?:etats|etat).*accueille.*(?:forces francaises|elements francais)/.test(text);
}

export function moveUnitLocationQuestions(bank) {
    const destination = bank["5"].questions;
    const seen = new Set(destination.map(question =>
        question.q.trim().replace(/\s+/g, " ").toLowerCase()
    ));
    Object.entries(bank).forEach(([themeId, theme]) => {
        if (themeId === "5") return;
        theme.questions = theme.questions.filter(question => {
            if (!isUnitLocationQuestion(question.q)) return true;
            const key = question.q.trim().replace(/\s+/g, " ").toLowerCase();
            if (!seen.has(key)) {
                destination.push(question);
                seen.add(key);
            }
            return false;
        });
    });
}
