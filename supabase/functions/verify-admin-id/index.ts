import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Admin ID stored securely as environment variable. Fail-closed if missing.
const ADMIN_ID = Deno.env.get("ADMIN_SECRET_ID");

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!ADMIN_ID) {
      console.error("ADMIN_SECRET_ID environment variable is not configured");
      return new Response(
        JSON.stringify({ valid: false, error: "Service misconfigured" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 503 }
      );
    }

    const { adminId } = await req.json();

    if (!adminId || typeof adminId !== "string") {
      return new Response(
        JSON.stringify({ valid: false, error: "Admin ID required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Constant-time comparison to avoid timing attacks
    const a = new TextEncoder().encode(adminId);
    const b = new TextEncoder().encode(ADMIN_ID);
    let isValid = a.length === b.length;
    const len = Math.max(a.length, b.length);
    let diff = a.length ^ b.length;
    for (let i = 0; i < len; i++) {
      diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
    }
    isValid = diff === 0;

    return new Response(
      JSON.stringify({ valid: isValid }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ valid: false, error: "Verification failed" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
