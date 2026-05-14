import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { pageId, itemId, eventType, referrer } = await req.json();

    if (!pageId || !eventType) {
      return new Response(JSON.stringify({ error: "pageId and eventType required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const userAgent = req.headers.get("user-agent") || "";

    // Insere evento de analytics
    await supabase.from("link_analytics").insert({
      page_id: pageId,
      item_id: itemId || null,
      event_type: eventType,
      referrer: referrer || null,
      user_agent: userAgent,
    });

    // Incrementa contador na tabela principal
    if (eventType === "view") {
      await supabase.rpc("increment_views", { page_id_param: pageId }).catch(() => {
        // Fallback: update direto
        supabase
          .from("link_pages")
          .select("views_count")
          .eq("id", pageId)
          .single()
          .then(({ data }) => {
            if (data) {
              supabase
                .from("link_pages")
                .update({ views_count: (data.views_count || 0) + 1 })
                .eq("id", pageId);
            }
          });
      });
    } else if (eventType === "click" && itemId) {
      await supabase
        .from("link_items")
        .select("clicks_count")
        .eq("id", itemId)
        .single()
        .then(({ data }) => {
          if (data) {
            supabase
              .from("link_items")
              .update({ clicks_count: (data.clicks_count || 0) + 1 })
              .eq("id", itemId);
          }
        });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("track-link error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
