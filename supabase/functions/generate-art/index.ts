import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SIZE_MAP: Record<string, string> = {
  "1:1": "1024x1024",
  "16:9": "1792x1024",
  "9:16": "1024x1792",
  "4:3": "1024x1024",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { prompt, aspectRatio = "1:1" } = await req.json();
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY não configurada");
    if (!prompt?.trim()) throw new Error("Prompt não pode estar vazio");

    const size = SIZE_MAP[aspectRatio] || "1024x1024";

    const enhancedPrompt = `Professional Brazilian automotive advertising image. ${prompt}. High quality commercial photography, sharp details, vibrant colors, marketing material suitable for social media ads.`;

    console.log("[GENERATE-ART] DALL-E 3 | size:", size, "| prompt:", enhancedPrompt.slice(0, 80));

    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt: enhancedPrompt,
        n: 1,
        size,
        quality: "hd",
        response_format: "b64_json",
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error("[GENERATE-ART] OpenAI error:", res.status, body.slice(0, 500));
      let msg = `DALL-E 3 erro ${res.status}`;
      try { const j = JSON.parse(body); msg = j.error?.message || msg; } catch {}
      throw new Error(msg);
    }

    const data = await res.json();
    const image = data.data?.[0];

    if (!image?.b64_json) throw new Error("Nenhuma imagem foi gerada");

    return new Response(
      JSON.stringify({
        imageBase64: image.b64_json,
        mimeType: "image/png",
        revisedPrompt: image.revised_prompt || null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    console.error("[GENERATE-ART] Erro:", e.message);
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
