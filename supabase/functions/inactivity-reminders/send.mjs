export async function sendInactivityReminders(database, { apiKey, templateId, fetchImpl = fetch }) {
    let sent = 0;
    for (let count = 0; count < 25; count++) {
        const { data: reservations, error: claimError } = await database.rpc("claim_qcm_inactivity_email");
        if (claimError) throw claimError;
        const reservation = reservations?.[0];
        if (!reservation) break;
        const { data: eligible, error: confirmError } = await database.rpc("confirm_qcm_inactivity_email", {
            p_id: reservation.id
        });
        if (confirmError) throw confirmError;
        if (!eligible) continue;

        let response;
        try {
            response = await fetchImpl("https://api.resend.com/emails", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                    "Idempotency-Key": `qcm-inactivity/${reservation.id}`
                },
                body: JSON.stringify({ to: [reservation.email], template: { id: templateId } }),
                signal: AbortSignal.timeout(15000)
            });
        } catch (error) {
            const { error: saveError } = await database.rpc("finish_qcm_inactivity_email", {
                p_id: reservation.id, p_status: "unknown", p_resend_id: null,
                p_error: "Résultat d’envoi inconnu : vérifier dans Resend avant toute nouvelle tentative."
            });
            if (saveError) throw saveError;
            console.error("Inactivity email request failed", error);
            throw new Error("Resend delivery status is unknown");
        }
        const payload = await response.json().catch(() => null);
        const accepted = response.ok && typeof payload?.id === "string" && payload.id.length > 0;
        const definiteFailure = !response.ok && response.status >= 400 && response.status < 500
            && response.status !== 408 && response.status !== 409;
        const { error: saveError } = await database.rpc("finish_qcm_inactivity_email", {
            p_id: reservation.id,
            p_status: accepted ? "sent" : definiteFailure ? "failed" : "unknown",
            p_resend_id: accepted ? payload.id : null,
            p_error: accepted ? null : `Resend HTTP ${response.status}${definiteFailure ? "" : " : résultat inconnu"}.`
        });
        if (saveError) throw saveError;
        if (!accepted) throw new Error(`Resend request failed with HTTP ${response.status}`);
        sent++;
    }
    return { sent };
}
