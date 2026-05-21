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
    const {
      prompt,
      aspectRatio = "1:1",
      imageBase64,
      imageMimeType,
      vehicleType,
      background,
      cameraAngle,
      lighting,
      overlayText,
    } = await req.json();

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY não configurada");

    const size = SIZE_MAP[aspectRatio] || "1024x1024";
    let baseDescription = "";

    // Se foto foi enviada — analisa com GPT-4o Vision
    if (imageBase64 && imageMimeType) {
      console.log("[GENERATE-ART] Analisando foto com GPT-4o...");
      const visionRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image_url",
                  image_url: {
                    url: `data:${imageMimeType};base64,${imageBase64}`,
                    detail: "high",
                  },
                },
                {
                  type: "text",
                  text: "Describe this automotive image in detail for DALL-E 3 generation. Include: vehicle type, color, model if visible, setting/background, lighting, mood, composition, visible text or branding. Be specific. Reply in English.",
                },
              ],
            },
          ],
          max_tokens: 600,
        }),
      });

      if (visionRes.ok) {
        const visionData = await visionRes.json();
        baseDescription = visionData.choices?.[0]?.message?.content || "";
        console.log("[GENERATE-ART] Análise GPT-4o:", baseDescription.slice(0, 100));
      } else {
        console.error("[GENERATE-ART] GPT-4o vision falhou, continuando sem análise...");
      }
    }

    // Montar prompt final com todas as personalizações
    const parts: string[] = [
      "Professional Brazilian automotive advertising image, commercial quality, ultra-realistic.",
    ];

    if (baseDescription) {
      parts.push(`Based on this reference: ${baseDescription}.`);
      parts.push("Reimagine and enhance this as a professional advertisement.");
    }

    if (vehicleType) parts.push(`Vehicle type: ${vehicleType}.`);
    if (prompt?.trim()) parts.push(prompt.trim());
    if (background) parts.push(`Setting/background: ${background}.`);
    if (cameraAngle) parts.push(`Camera angle: ${cameraAngle}.`);
    if (lighting) parts.push(`Lighting and atmosphere: ${lighting}.`);
    if (overlayText?.trim()) {
      parts.push(`Include this text prominently and legibly in the image: "${overlayText}".`);
    }

    parts.push("High quality marketing material, vibrant colors, sharp details, suitable for social media ads.");

    const finalPrompt = parts.join(" ");
    console.log("[GENERATE-ART] DALL-E 3 | size:", size, "| prompt:", finalPrompt.slice(0, 120));

    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt: finalPrompt,
        n: 1,
        size,
        quality: "hd",
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error("[GENERATE-ART] OpenAI error:", res.status, body.slice(0, 500));
      let msg = `DALL-E 3 erro ${res.status}`;
      try {
        const j = JSON.parse(body);
        msg = j.error?.message || msg;
      } catch {}
      throw new Error(msg);
    }

    const data = await res.json();
    const image = data.data?.[0];
    if (!image?.url) throw new Error("Nenhuma imagem foi gerada");

    // Fetch image URL and convert to base64
    const imgRes = await fetch(image.url);
    const buffer = await imgRes.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const imageBase64 = btoa(binary);

    return new Response(
      JSON.stringify({
        imageBase64,
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
