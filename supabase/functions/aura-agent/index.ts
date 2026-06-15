import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = { 
  "Access-Control-Allow-Origin": "*", 
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" 
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const _authClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: { user }, error: _authErr } = await _authClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (_authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { messages, context } = await req.json();
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    const systemInstruction = `Você é o Aura, o Analista de Dados e Inteligência da NC Performance Suite. 
Sua missão é traduzir métricas complexas em insights simples e acionáveis.
Seja preciso, analítico e use os dados do contexto para personalizar sua resposta.
${context ? `\nCONTEXTO ATUAL:\n${context}` : ""}`;

    // Tentativa 1: Gemini Direto
    if (GEMINI_API_KEY) {
      try {
        const contents = [
          { role: "user", parts: [{ text: systemInstruction }] },
          { role: "model", parts: [{ text: "Entendido. Analista Aura pronto para processar os dados." }] },
          ...messages.map((m: any) => ({ 
            role: m.role === "assistant" ? "model" : "user", 
            parts: [{ text: m.content }] 
          }))
        ];
        
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
          method: "POST", 
          headers: { "Content-Type": "application/json" }, 
          body: JSON.stringify({ contents })
        });
        
        const data = await res.json();
        if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
          return new Response(JSON.stringify({ message: data.candidates[0].content.parts[0].text }), { headers: corsHeaders });
        }
      } catch (e) {
        console.error("Aura: Falha no Gemini Direto");
      }
    }

    // Tentativa 2: Fallback Lovable Gateway
    if (LOVABLE_API_KEY) {
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: systemInstruction },
            ...messages
          ],
        }),
      });

      if (response.ok) {
        const aiData = await response.json();
        return new Response(JSON.stringify({ message: aiData.choices[0].message.content }), { headers: corsHeaders });
      }
    }

    throw new Error("Sistemas de inteligência offline.");
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 200, headers: corsHeaders });
  }
});
