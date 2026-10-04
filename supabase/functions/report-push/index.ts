import { createClient } from "npm:@supabase/supabase-js@2.57.4";
// @deno-types="npm:@types/web-push@3.6.4"
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
    "Access-Control-Allow-Origin": "https://qcm-major.fr",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};

function response(body: Record<string, unknown>, status = 200) {
    return Response.json(body, { status, headers: corsHeaders });
}

function isAdmin(metadata: Record<string, unknown>) {
    return metadata.role === "admin"
        || metadata.bm4_admin === true
        || metadata.bm4_admin === "true"
        || metadata.bm4_admin === "1";
}

function requiredSecret(name: string) {
    const value = Deno.env.get(name);
    if (!value) throw new Error(`Missing notification configuration: ${name}`);
    return value;
}

function validEndpoint(endpoint: string) {
    const url = new URL(endpoint);
    return url.protocol === "https:" && url.hostname === "fcm.googleapis.com"
        && !url.port && !url.username && !url.password;
}

Deno.serve(async request => {
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    try {
        const publicKey = requiredSecret("QCM_VAPID_PUBLIC_KEY");
        if (request.method === "GET") return response({ publicKey });
        if (request.method !== "POST") return response({ error: "Method not allowed" }, 405);

        const database = createClient(
            requiredSecret("SUPABASE_URL"),
            requiredSecret("SUPABASE_SERVICE_ROLE_KEY"),
            { auth: { persistSession: false, autoRefreshToken: false } }
        );
        let testUserId: string | null = null;
        const webhookSecret = request.headers.get("x-qcm-webhook-secret");
        if (webhookSecret !== requiredSecret("QCM_REPORT_PUSH_WEBHOOK_SECRET")) {
            const token = request.headers.get("Authorization")?.replace(/^Bearer /i, "");
            if (!token) return response({ error: "Unauthorized" }, 401);
            const { data, error } = await database.auth.getUser(token);
            if (error || !data.user) return response({ error: "Unauthorized" }, 401);
            if (!isAdmin(data.user.app_metadata)) return response({ error: "Admin access required" }, 403);
            testUserId = data.user.id;
        }

        let payload;
        try {
            payload = await request.json();
        } catch {
            return response({ error: "Invalid JSON" }, 400);
        }
        if (testUserId) {
            if (payload?.type !== "test") return response({ error: "Invalid notification request" }, 400);
        } else {
            if (payload?.type !== "INSERT" || payload?.schema !== "public"
                || payload?.table !== "question_reports"
                || typeof payload?.record?.id !== "string"
                || !/^[0-9a-f-]{36}$/i.test(payload.record.id)) {
                return response({ error: "Invalid report event" }, 400);
            }
            const { data: report, error } = await database.from("question_reports")
                .select("id,status").eq("id", payload.record.id).maybeSingle();
            if (error) throw error;
            if (!report || report.status === "resolved") return response({ sent: 0 });
        }

        let query = database.from("admin_push_subscriptions").select("user_id,endpoint,p256dh,auth");
        if (testUserId) query = query.eq("user_id", testUserId);
        const { data: subscriptions, error } = await query;
        if (error) throw error;

        webpush.setVapidDetails(
            "https://qcm-major.fr",
            publicKey,
            requiredSecret("QCM_VAPID_PRIVATE_KEY")
        );
        let sent = 0;
        let failed = 0;
        for (const subscription of subscriptions || []) {
            const { data: account, error: accountError } = await database.auth.admin.getUserById(subscription.user_id);
            if (accountError) throw accountError;
            if (!account.user || !isAdmin(account.user.app_metadata)) continue;
            if (!validEndpoint(subscription.endpoint)) throw new Error("Unsupported push endpoint");
            try {
                await webpush.sendNotification({
                    endpoint: subscription.endpoint,
                    keys: { p256dh: subscription.p256dh, auth: subscription.auth }
                }, JSON.stringify({ type: "question-report" }), { TTL: 3600, urgency: "normal" });
                sent += 1;
            } catch (error) {
                if (error instanceof webpush.WebPushError && (error.statusCode === 404 || error.statusCode === 410)) {
                    const { error: deleteError } = await database.from("admin_push_subscriptions")
                        .delete().eq("user_id", subscription.user_id).eq("endpoint", subscription.endpoint);
                    if (deleteError) throw deleteError;
                } else {
                    failed += 1;
                    console.error("Report push delivery failed", {
                        status: error instanceof webpush.WebPushError ? error.statusCode : null
                    });
                }
            }
        }
        if (failed > 0) return response({ error: "Some notifications could not be sent", sent, failed }, 502);
        if (testUserId && sent === 0) return response({ error: "Aucun téléphone actif. Activez les notifications sur votre Android." }, 409);
        return response({ sent });
    } catch (error) {
        console.error("Report push handler failed", error instanceof Error ? error.message : "Unknown error");
        return response({ error: "Notification service unavailable. Check Supabase function logs." }, 500);
    }
});
