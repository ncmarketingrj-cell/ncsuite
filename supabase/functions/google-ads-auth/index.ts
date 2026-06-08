import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { code, redirectUri } = await req.json();

    if (!code || !redirectUri) {
      throw new Error("Missing 'code' or 'redirectUri' in request body.");
    }

    // Get Auth token from headers to identify user
    const authHeader = req.headers.get('Authorization')!;
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    // Get current user
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      throw new Error("Unauthorized user.");
    }

    const clientId = Deno.env.get('GOOGLE_CLIENT_ID') || "620606037088-ndk939vngs3kpsf1jeb5u70g00b1v4vj.apps.googleusercontent.com";
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');

    if (!clientSecret) {
      throw new Error("Server configuration missing GOOGLE_CLIENT_SECRET");
    }

    // Exchange code for tokens
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error("Token exchange failed:", errorText);
      throw new Error("Failed to exchange authorization code for tokens.");
    }

    const tokenData = await tokenResponse.json();
    const { refresh_token, access_token } = tokenData;

    if (!refresh_token) {
      throw new Error("No refresh_token returned. User might have already authorized the app. Try revoking permissions in Google Account.");
    }

    // Fetch user info to get the email/name
    let accountName = "Google Ads Connection";
    let email = null;
    try {
      const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: {
          Authorization: `Bearer ${access_token}`
        }
      });
      if (userInfoRes.ok) {
        const userInfo = await userInfoRes.json();
        email = userInfo.email;
        if (userInfo.name) accountName = `${userInfo.name} (Ads)`;
      }
    } catch (e) {
      console.log("Could not fetch user info", e);
    }

    // Insert into google_ads_configs
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { error: insertError } = await serviceClient
      .from('google_ads_configs')
      .insert({
        user_id: user.id,
        name: accountName,
        email: email,
        refresh_token: refresh_token,
      });

    if (insertError) {
      console.error("DB Insert Error:", insertError);
      throw new Error("Failed to save credentials to database.");
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error: any) {
    console.error("Edge function error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
