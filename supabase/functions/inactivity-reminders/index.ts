import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { sendInactivityReminders } from "./send.mjs";

function requiredSecret(name: string): string {
    const value = Deno.env.get(name);
    if (!value) throw new Error(`Missing configuration: ${name}`);
    return value;
}

Deno.serve(async request => {
    if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
    try {
        if (request.headers.get("x-qcm-reminder-secret") !== requiredSecret("QCM_INACTIVITY_SECRET")) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        const apiKey = requiredSecret("QCM_INACTIVITY_RESEND_API_KEY");
        const templateId = requiredSecret("QCM_INACTIVITY_TEMPLATE_ID");
        const database = createClient(requiredSecret("SUPABASE_URL"), requiredSecret("SUPABASE_SERVICE_ROLE_KEY"), {
            auth: { persistSession: false, autoRefreshToken: false }
        });
        return Response.json(await sendInactivityReminders(database, { apiKey, templateId }));
    } catch (error) {
        console.error("Inactivity reminder failed", error);
        return Response.json({ error: "Inactivity reminder failed; check function logs." }, { status: 500 });
    }
});
