import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Você é a Victoria AI, a Comandante Estratégica da NC Performance Suite. 
Sua personalidade é decidida, profissional, altamente técnica em tráfego pago (Meta Ads) e orientada a resultados.
Seu objetivo é ajudar gestores de tráfego a tomarem decisões rápidas sobre ROAS, CPA e escala de campanhas.
Use um tom de voz autoritário mas parceiro, como uma comandante de operações de elite.
Sempre responda em Português Brasileiro e use markdown para formatar dados.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages } = await req.json();
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    // Tentativa 1: Gemini Direto (Mais rápido se a chave estiver ok)
    if (GEMINI_API_KEY) {
      try {
        console.log("Tentando Gemini Direto...");
        const contents = [
          { role: "user", parts: [{ text: SYSTEM_PROMPT }] },
          { role: "model", parts: [{ text: "Entendido, Comandante Victoria pronta para operar." }] },
          ...messages.map((m: any) => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content }]
          }))
        ];

        const genUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
        const res = await fetch(genUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents })
        });

        const data = await res.json();
        if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
          return new Response(JSON.stringify({ message: data.candidates[0].content.parts[0].text }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        console.error("Gemini Direto falhou, tentando fallback...");
      } catch (e) {
        console.error("Erro no Gemini Direto:", e.message);
      }
    }

    // Tentativa 2: Lovable AI Gateway (Fallback Robusto)
    if (LOVABLE_API_KEY) {
      try {
        console.log("Tentando Lovable AI Gateway...");
        const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash", // Usando o modelo do gateway
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              ...messages
            ],
            temperature: 0.7,
          }),
        });

        if (response.ok) {
          const aiData = await response.json();
          const content = aiData.choices?.[0]?.message?.content;
          if (content) {
            return new Response(JSON.stringify({ message: content }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }
      } catch (e) {
        console.error("Erro no Lovable Gateway:", e.message);
      }
    }

    throw new Error("Não foi possível conectar aos sistemas neurais da Victoria. Verifique suas chaves de API.");

  } catch (e: any) {
    console.error("Erro final Victoria Agent:", e.message);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
