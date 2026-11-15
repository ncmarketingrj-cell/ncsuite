import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SIZE_MAP: Record<string, string> = {
  "1:1": "1024x1024",
  "4:5": "1024x1792",
  "9:16": "1024x1792",
  "16:9": "1792x1024",
  "4:3": "1024x1024",
  "1024x1024": "1024x1024",
  "1024x1792": "1024x1792",
  "1792x1024": "1792x1024",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const {
      prompt,
      aspectRatio = "1:1",
      imageBase64: inputImageBase64,
      imageMimeType,
      vehicleType,
      background,
      cameraAngle,
      lighting,
      overlayText,
      noTextInImage = true,
      mode = "ai_generated_art",
      brandPalette,
    } = await req.json();

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY não configurada");

    const size = SIZE_MAP[aspectRatio] || "1024x1024";
    let baseDescription = "";

    if (inputImageBase64 && imageMimeType) {
      console.log("[GENERATE-ART] Analisando referência com GPT-4o...");
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
                    url: `data:${imageMimeType};base64,${inputImageBase64}`,
                    detail: "high",
                  },
                },
                {
                  type: "text",
                  text:
                    mode === "ai_scenario"
                      ? "Analyze this automotive photo to design a matching commercial studio environment background only. Describe perspective, ground plane reflection, camera elevation, lighting temperature, and color harmony. Reply concisely in English."
                      : "Describe this automotive reference image for illustrative visual creation: vehicle category, angle, lighting, color palette, environment, composition. Reply concisely in English.",
                },
              ],
            },
          ],
          max_tokens: 450,
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

    const parts: string[] = [
      mode === "ai_scenario"
        ? "Clean automotive commercial studio backdrop and showroom environment, photographic realism, uncluttered composition."
        : "Professional Brazilian automotive advertising visual, commercial photography look, crisp details.",
    ];

    if (baseDescription) {
      parts.push(
        mode === "ai_scenario"
          ? `Match perspective, ground plane, and lighting from this scene: ${baseDescription}.`
          : `Based on this reference composition: ${baseDescription}.`
      );
    }

    if (vehicleType && mode !== "ai_scenario") parts.push(`Subject/vehicle context: ${vehicleType}.`);
    if (prompt?.trim()) parts.push(prompt.trim());
    if (background) parts.push(`Setting/background: ${background}.`);
    if (cameraAngle) parts.push(`Camera framing: ${cameraAngle}.`);
    if (lighting) parts.push(`Lighting atmosphere: ${lighting}.`);
    if (brandPalette) parts.push(`Harmonize ambient lighting subtly with brand palette: ${brandPalette}.`);

    if (noTextInImage !== false) {
      parts.push(
        "CRITICAL: Do NOT include any text, letters, numbers, prices, badges, watermarks, UI overlays, or logos anywhere in the image. Leave clean negative space for typography layers."
      );
    } else if (overlayText?.trim()) {
      parts.push(`Include this text cleanly: "${overlayText}".`);
    }

    const finalPrompt = parts.join(" ");
    console.log("[GENERATE-ART] DALL-E 3 | mode:", mode, "| size:", size);

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
      } catch {
        // ignore JSON parse failure
      }
      throw new Error(msg);
    }

    const data = await res.json();
    const image = data.data?.[0];
    if (!image?.url) throw new Error("Nenhuma imagem foi gerada");

    const imgRes = await fetch(image.url);
    const buffer = await imgRes.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const imageBase64 = btoa(binary);
    const mimeType = "image/png";

    return new Response(
      JSON.stringify({
        imageUrl: `data:${mimeType};base64,${imageBase64}`,
        imageBase64,
        mimeType,
        size,
        mode,
        noTextInImage: noTextInImage !== false,
        revisedPrompt: image.revised_prompt || null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    console.error("[GENERATE-ART] Erro:", e?.message || e);
    return new Response(
      JSON.stringify({ error: e?.message || "Falha ao gerar visual com IA" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
