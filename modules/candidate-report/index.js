export const REPORT_THEMES = [
    ["all", "Campagne globale"],
    ["1", "Organisation et Commandement"],
    ["2", "Matériels, Armements et Technologies"],
    ["3", "Lois de Programmation Militaire"],
    ["4", "Opérations Extérieures"],
    ["5", "Histoire & Traditions"],
    ["6", "Implantation des unités"]
];

export const READY_THRESHOLD = 13;
export const WATCH_THRESHOLD = 10;

export const STATUSES = {
    struggling: { label: "En difficulté", color: "#b3261e", rank: 0 },
    watch: { label: "À surveiller", color: "#d98e04", rank: 1 },
    none: { label: "Sans résultat", color: "#6b7280", rank: 2 },
    ready: { label: "Prêt", color: "#2e7d4f", rank: 3 }
};

const mean = values => values.reduce((total, value) => total + value, 0) / values.length;

export function getCandidateStatus(average) {
    if (!Number.isFinite(average)) return "none";
    if (average >= READY_THRESHOLD) return "ready";
    return average >= WATCH_THRESHOLD ? "watch" : "struggling";
}

export function formatScore(value) {
    return Number.isFinite(value) ? value.toFixed(1).replace(".", ",") : "—";
}

export function formatDate(timestamp) {
    return Number.isFinite(timestamp)
        ? new Date(timestamp).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" })
        : "—";
}

export function buildCandidateSummaries({ results = [], accounts = [] } = {}) {
    const entries = new Map();
    const keysByEmail = new Map();
    const cleanEmail = value => String(value || "").trim().toLowerCase();
    const cleanId = value => {
        const id = String(value || "").trim();
        return id && id !== "candidat-inconnu" ? id : "";
    };
    const register = (key, base) => {
        const entry = { id: "", name: "", email: "", specialty: "", scores: [], ...base };
        entries.set(key, entry);
        if (cleanEmail(entry.email)) keysByEmail.set(cleanEmail(entry.email), key);
        return entry;
    };

    accounts.forEach(account => {
        const id = cleanId(account.id);
        const email = String(account.email || "").trim();
        const key = id ? `id:${id}` : cleanEmail(email) ? `mail:${cleanEmail(email)}` : "";
        if (!key || entries.has(key)) return;
        register(key, {
            id,
            email,
            name: String(account.name || "").trim(),
            specialty: String(account.specialty || "").trim()
        });
    });

    results.forEach(result => {
        const id = cleanId(result.candidateId);
        const email = cleanEmail(result.email);
        let key = id && entries.has(`id:${id}`) ? `id:${id}` : (email && keysByEmail.get(email)) || "";
        if (!key) {
            key = id ? `id:${id}` : email ? `mail:${email}` : `anon:${result.name || result.label || result.id}`;
        }
        const entry = entries.get(key) || register(key, {
            id,
            email: String(result.email || "").trim(),
            name: String(result.name || result.label || "").trim()
        });
        if (!entry.email && result.email) entry.email = String(result.email).trim();
        const score = Number(result.score);
        if (!Number.isFinite(score)) return;
        entry.scores.push({
            theme: String(result.theme || "all"),
            score,
            time: Date.parse(result.createdAt || "")
        });
    });

    return [...entries.values()].map(entry => {
        const scores = entry.scores
            .slice()
            .sort((first, second) => (first.time || 0) - (second.time || 0));
        const average = scores.length ? mean(scores.map(item => item.score)) : NaN;
        const times = scores.map(item => item.time).filter(Number.isFinite);
        const values = scores.map(item => item.score);
        return {
            id: entry.id,
            name: entry.name || entry.email || "Candidat",
            email: entry.email,
            specialty: entry.specialty,
            seriesCount: scores.length,
            average,
            status: getCandidateStatus(average),
            lastActivity: times.length ? Math.max(...times) : NaN,
            trend: values.length >= 6 ? mean(values.slice(-3)) - mean(values.slice(-6, -3)) : null,
            recent: scores.slice(-12),
            themes: REPORT_THEMES.map(([id, label]) => {
                const themeScores = scores.filter(item => item.theme === id).map(item => item.score);
                return {
                    id,
                    label,
                    count: themeScores.length,
                    average: themeScores.length ? mean(themeScores) : NaN
                };
            })
        };
    });
}

export function sortByPriority(summaries) {
    return summaries.slice().sort((first, second) => {
        const rankDifference = STATUSES[first.status].rank - STATUSES[second.status].rank;
        if (rankDifference) return rankDifference;
        const averageDifference = (Number.isFinite(first.average) ? first.average : 99)
            - (Number.isFinite(second.average) ? second.average : 99);
        return averageDifference || first.name.localeCompare(second.name, "fr");
    });
}

export function countByStatus(summaries) {
    const counts = { struggling: 0, watch: 0, none: 0, ready: 0 };
    summaries.forEach(summary => { counts[summary.status] += 1; });
    return counts;
}

function element(doc, tag, className, text) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function meter(doc, value, className = "") {
    const track = element(doc, "span", `candidate-meter ${className}`.trim());
    const fill = element(doc, "span", "candidate-meter-fill");
    const width = Number.isFinite(value) ? Math.max(0, Math.min(20, value)) / 20 * 100 : 0;
    fill.style.width = `${width}%`;
    fill.style.background = STATUSES[getCandidateStatus(value)].color;
    track.appendChild(fill);
    return track;
}

export function renderCandidateDashboard(container, summaries, doc = document, { selected = "", onSelect } = {}) {
    container.replaceChildren();
    const selectedKey = String(selected || "").trim().toLowerCase();
    summaries.forEach(summary => {
        const status = STATUSES[summary.status];
        const card = element(doc, "article", `candidate-card${summary.inactivityReminderSent ? " has-inactivity-reminder" : ""}`);
        const isSelected = Boolean(selectedKey)
            && [summary.email, summary.id].some(value => String(value || "").trim().toLowerCase() === selectedKey);
        card.dataset.status = summary.status;
        card.setAttribute("role", "button");
        card.tabIndex = 0;
        card.setAttribute("aria-pressed", String(isSelected));
        card.setAttribute("aria-label", `Détails de ${summary.name}${summary.inactivityReminderSent ? " — relance d’inactivité acceptée par Resend" : ""}`);
        if (onSelect) {
            card.addEventListener("click", () => onSelect(summary, isSelected));
            card.addEventListener("keydown", event => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                onSelect(summary, isSelected);
            });
        }
        card.style.setProperty("--status-color", status.color);

        const head = element(doc, "header", "candidate-card-head");
        const identity = element(doc, "div", "candidate-card-identity");
        identity.append(
            element(doc, "strong", "candidate-card-name", summary.name),
            element(doc, "small", "", [summary.specialty, summary.email].filter(Boolean).join(" · ") || "Spécialité non renseignée")
        );
        head.append(identity, element(doc, "span", "candidate-pill", status.label));

        const score = element(doc, "div", "candidate-card-score");
        score.append(
            element(doc, "strong", "", Number.isFinite(summary.average) ? `${formatScore(summary.average)} / 20` : "—"),
            meter(doc, summary.average, "candidate-meter-large")
        );

        const facts = element(doc, "p", "candidate-card-facts");
        const trend = summary.trend === null
            ? "tendance : 6 séries requises"
            : `tendance ${summary.trend >= 0 ? "+" : ""}${formatScore(summary.trend)} pt`;
        facts.textContent = `${summary.seriesCount} série(s) · dernière activité ${formatDate(summary.lastActivity)} · ${trend}`;

        card.append(head, score, facts);
        if (summary.inactivityReminderSent) {
            card.appendChild(element(doc, "p", "candidate-card-reminder", "Relance d’inactivité acceptée par Resend"));
        }
        container.appendChild(card);
    });
}

export function buildCandidateReportPdf(summaries, { generatedAt = new Date(), scopeLabel = "" } = {}) {
    const W = 595;
    const H = 842;
    const M = 36;
    const pages = [];
    let ops = null;
    let cursor = 0;
    const GOLD = "#e0b446";
    const DARK = "#1d2a24";

    const rgb = hex => [1, 3, 5].map(i => (parseInt(hex.slice(i, i + 2), 16) / 255).toFixed(3)).join(" ");
    const toWinAnsi = value => String(value)
        .replace(/[’‘]/g, "'")
        .replace(/[–—]/g, "-")
        .replace(/\u00a0|\u202f/g, " ")
        .replace(/œ/g, "oe")
        .replace(/[^\x20-\xff]/g, "?");
    const escapePdf = value => toWinAnsi(value).replace(/[\\()]/g, "\\$&");
    const width = (value, size, bold) => toWinAnsi(value).length * size * (bold ? 0.56 : 0.52);
    const fit = (value, maxWidth, size, bold) => {
        let result = String(value);
        while (result.length > 1 && width(result, size, bold) > maxWidth) result = result.slice(0, -1);
        return result === String(value) ? result : `${result.slice(0, -1)}...`;
    };
    const text = (value, x, top, { size = 10, bold = false, color = "#111111", align = "left", max } = {}) => {
        const content = max ? fit(value, max, size, bold) : String(value);
        let left = x;
        if (align === "right") left = x - width(content, size, bold);
        if (align === "center") left = x - width(content, size, bold) / 2;
        ops.push(`BT ${rgb(color)} rg /${bold ? "F2" : "F1"} ${size} Tf ${left.toFixed(1)} ${(H - top - size * 0.8).toFixed(1)} Td (${escapePdf(content)}) Tj ET`);
    };
    const rect = (x, top, w, h, color) => {
        ops.push(`${rgb(color)} rg ${x.toFixed(1)} ${(H - top - h).toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)} re f`);
    };
    const line = (x1, top1, x2, top2, color = "#b8b2a0", lineWidth = 0.5) => {
        ops.push(`${rgb(color)} RG ${lineWidth} w ${x1.toFixed(1)} ${(H - top1).toFixed(1)} m ${x2.toFixed(1)} ${(H - top2).toFixed(1)} l S`);
    };
    const addPage = (title, subtitle) => {
        ops = [];
        pages.push(ops);
        rect(0, 0, W, 64, DARK);
        text(subtitle, M, 16, { size: 9, bold: true, color: GOLD });
        text(title, M, 32, { size: 18, bold: true, color: "#ffffff", max: W - 2 * M - 130 });
        cursor = 80;
    };
    const section = (title, top) => {
        text(title, M, top, { size: 11, bold: true, color: DARK });
        line(M, top + 16, W - M, top + 16, GOLD, 1);
        return top + 26;
    };
    const kpi = (label, value, index, count) => {
        const gap = 10;
        const w = (W - 2 * M - gap * (count - 1)) / count;
        const x = M + index * (w + gap);
        rect(x, cursor, w, 52, "#f4f1e6");
        text(label, x + 10, cursor + 9, { size: 8, color: "#5b5a50", max: w - 20 });
        text(value, x + 10, cursor + 24, { size: 17, bold: true, color: DARK, max: w - 20 });
    };
    const bar = (x, top, w, h, value) => {
        rect(x, top, w, h, "#e6e1cf");
        if (Number.isFinite(value)) {
            rect(x, top, w * Math.max(0, Math.min(20, value)) / 20, h, STATUSES[getCandidateStatus(value)].color);
        }
        [WATCH_THRESHOLD, READY_THRESHOLD].forEach(threshold => {
            const tick = x + w * threshold / 20;
            line(tick, top - 2, tick, top + h + 2, "#6b6a5f", 0.6);
        });
    };

    const ordered = sortByPriority(summaries);
    const counts = countByStatus(ordered);
    const scored = ordered.filter(summary => Number.isFinite(summary.average));
    const promotionAverage = scored.length ? mean(scored.map(summary => summary.average)) : NaN;
    const dateLabel = generatedAt.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });

    addPage("Synthèse de la promotion", "SUIVI DES CANDIDATS BM4 · OFFICIERS GUIDES");
    text(`${dateLabel}${scopeLabel ? ` · ${scopeLabel}` : ""}`, W - M, 40, { size: 9, color: "#ffffff", align: "right" });
    kpi("Candidats suivis", String(ordered.length), 0, 3);
    kpi("Moyenne générale", Number.isFinite(promotionAverage) ? `${formatScore(promotionAverage)} / 20` : "—", 1, 3);
    kpi("À accompagner", String(counts.struggling + counts.watch), 2, 3);
    cursor += 70;

    cursor = section("Répartition par statut", cursor);
    const total = Math.max(1, ordered.length);
    let barX = M;
    ["ready", "watch", "struggling", "none"].forEach(key => {
        const w = (W - 2 * M) * counts[key] / total;
        if (w > 0) rect(barX, cursor, w, 16, STATUSES[key].color);
        barX += w;
    });
    cursor += 26;
    ["ready", "watch", "struggling", "none"].forEach((key, index) => {
        const x = M + index * 130;
        rect(x, cursor + 1, 9, 9, STATUSES[key].color);
        text(`${STATUSES[key].label} : ${counts[key]}`, x + 14, cursor, { size: 9 });
    });
    cursor += 16;
    text(`Seuils : Prêt >= ${READY_THRESHOLD} · À surveiller ${WATCH_THRESHOLD} à ${READY_THRESHOLD} · En difficulté < ${WATCH_THRESHOLD} (moyenne /20)`, M, cursor, { size: 8, color: "#5b5a50" });
    cursor += 26;

    cursor = section("Niveau de la promotion par thème (moyenne /20)", cursor);
    REPORT_THEMES.forEach(([id, label]) => {
        const values = scored.flatMap(summary => summary.themes.filter(theme => theme.id === id && theme.count)
            .map(theme => theme.average));
        const average = values.length ? mean(values) : NaN;
        text(label, M, cursor, { size: 9, max: 190 });
        bar(M + 200, cursor, 240, 11, average);
        text(formatScore(average), W - M, cursor, { size: 9, bold: true, align: "right" });
        cursor += 22;
    });
    cursor += 10;

    const rosterHeader = () => {
        cursor = section("Candidats classés par priorité d'accompagnement", cursor);
        rect(M, cursor - 4, W - 2 * M, 16, "#ece7d3");
        text("Candidat", M + 16, cursor, { size: 8, bold: true });
        text("Spécialité", M + 230, cursor, { size: 8, bold: true });
        text("Moy.", M + 370, cursor, { size: 8, bold: true });
        text("Séries", M + 410, cursor, { size: 8, bold: true });
        text("Dernière activité", W - M - 2, cursor, { size: 8, bold: true, align: "right" });
        cursor += 18;
    };
    rosterHeader();
    ordered.forEach(summary => {
        if (cursor > H - 60) {
            addPage("Synthèse de la promotion (suite)", "SUIVI DES CANDIDATS BM4 · OFFICIERS GUIDES");
            rosterHeader();
        }
        rect(M, cursor + 1, 8, 8, STATUSES[summary.status].color);
        text(summary.name, M + 16, cursor, { size: 9, max: 205 });
        text(summary.specialty || "—", M + 230, cursor, { size: 9, max: 130 });
        text(formatScore(summary.average), M + 370, cursor, { size: 9, bold: true });
        text(String(summary.seriesCount), M + 410, cursor, { size: 9 });
        text(formatDate(summary.lastActivity), W - M - 2, cursor, { size: 9, align: "right" });
        cursor += 15;
    });

    ordered.forEach(summary => {
        const status = STATUSES[summary.status];
        addPage(summary.name, "FICHE CANDIDAT · SUIVI BM4");
        rect(W - M - 110, 20, 110, 24, status.color);
        text(status.label, W - M - 55, 27, { size: 10, bold: true, color: "#ffffff", align: "center" });
        text([summary.specialty, summary.email].filter(Boolean).join(" · ") || "Spécialité non renseignée", M, cursor, { size: 9, color: "#5b5a50", max: W - 2 * M });
        cursor += 22;
        kpi("Moyenne générale", Number.isFinite(summary.average) ? `${formatScore(summary.average)} / 20` : "—", 0, 4);
        kpi("Séries jouées", String(summary.seriesCount), 1, 4);
        kpi("Tendance (3 dernières)", summary.trend === null ? "—" : `${summary.trend >= 0 ? "+" : ""}${formatScore(summary.trend)} pt`, 2, 4);
        kpi("Dernière activité", formatDate(summary.lastActivity), 3, 4);
        cursor += 72;

        cursor = section("Résultats par thème (note /20)", cursor);
        summary.themes.forEach(theme => {
            text(theme.label, M, cursor, { size: 9, max: 190 });
            bar(M + 200, cursor, 220, 12, theme.average);
            text(theme.count ? `${formatScore(theme.average)} (${theme.count} série${theme.count > 1 ? "s" : ""})` : "—", W - M, cursor, { size: 9, bold: true, align: "right" });
            cursor += 24;
        });
        text("Repères sur les barres : 10 et 13 sur 20.", M, cursor, { size: 8, color: "#5b5a50" });
        cursor += 28;

        cursor = section("Progression sur les dernières séries", cursor);
        const chartHeight = 130;
        const chartWidth = W - 2 * M;
        [WATCH_THRESHOLD, READY_THRESHOLD].forEach(threshold => {
            const y = cursor + chartHeight * (1 - threshold / 20);
            line(M, y, W - M, y, "#c9c3ad", 0.5);
            text(String(threshold), M - 2, y - 4, { size: 7, color: "#6b6a5f", align: "right" });
        });
        if (!summary.recent.length) {
            text("Aucune série enregistrée.", M, cursor + 10, { size: 9, color: "#5b5a50" });
        } else {
            const slot = chartWidth / Math.max(summary.recent.length, 6);
            summary.recent.forEach((item, index) => {
                const h = chartHeight * Math.max(0, Math.min(20, item.score)) / 20;
                const x = M + index * slot + slot * 0.15;
                rect(x, cursor + chartHeight - h, slot * 0.7, h, STATUSES[getCandidateStatus(item.score)].color);
                text(formatScore(item.score), x + slot * 0.35, cursor + chartHeight - h - 10, { size: 7, align: "center" });
                text(Number.isFinite(item.time) ? new Date(item.time).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }) : "", x + slot * 0.35, cursor + chartHeight + 4, { size: 7, color: "#5b5a50", align: "center" });
            });
        }
    });

    pages.forEach((page, index) => {
        ops = page;
        line(M, H - 34, W - M, H - 34, "#d8d2bb", 0.5);
        text(`Document confidentiel - usage officiers guides - généré le ${dateLabel}`, M, H - 26, { size: 7, color: "#6b6a5f" });
        text(`Page ${index + 1} / ${pages.length}`, W - M, H - 26, { size: 7, color: "#6b6a5f", align: "right" });
    });

    const objects = [];
    const add = body => objects.push(body);
    add("<< /Type /Catalog /Pages 2 0 R >>");
    add(`<< /Type /Pages /Kids [${pages.map((_, i) => `${5 + i * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`);
    add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
    pages.forEach((page, i) => {
        const stream = page.join("\n");
        add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6 + i * 2} 0 R >>`);
        add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    });
    let pdf = "%PDF-1.4\n";
    const offsets = objects.map((body, i) => {
        const offset = pdf.length;
        pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
        return offset;
    });
    const xref = pdf.length;
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
        + offsets.map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")
        + `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return new Blob([Uint8Array.from(pdf, char => char.charCodeAt(0) & 0xff)], { type: "application/pdf" });
}
