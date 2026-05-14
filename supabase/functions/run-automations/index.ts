// supabase/functions/run-automations/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.1"

console.log("Serviço de automação de relatórios rodando...")

const supabaseUrl = Deno.env.get("SUPABASE_URL")!
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

// Inicializa cliente com privilégios de admin para ler as tabelas de automação e contornar RLS
const supabase = createClient(supabaseUrl, supabaseServiceKey)

serve(async (req) => {
  try {
    // 1. Busca todas as automações ativas
    const { data: automations, error } = await supabase
      .from("automations")
      .select("*, clients(name)")
      .eq("is_active", true)

    if (error) throw error

    const agora = new Date()
    let disparos = 0

    // 2. Loop sobre as automações para verificar regras
    for (const auto of automations) {
      const freq = auto.frequency
      
      let shouldRun = false
      // Aqui faríamos a checagem detalhada com um parser de cron-parser ou dayjs
      // Exemplo rudimentar:
      if (freq === "daily") shouldRun = true
      else if (freq === "weekly" && agora.getDay() === 1) shouldRun = true // Toda segunda
      else if (freq === "monthly" && agora.getDate() === 1) shouldRun = true // Todo dia 1
      else if (freq.startsWith("cron:")) {
         // Lógica real de parseamento de cron...
         shouldRun = true 
      }

      if (shouldRun) {
        // 3. Monta o payload (geração de PDF via puppeteer ou compilando HTML de reports via React SSR)
        console.log(`Disparando relatório para cliente ${auto.clients?.name}`)
        
        // Simulação de envio para Resend (Email) e Z-API (WhatsApp)
        if (auto.recipient_email) {
          console.log(` -> Enviando E-mail para ${auto.recipient_email}`)
          // await fetch('https://api.resend.com/emails', ...)
        }

        if (auto.recipient_whatsapp) {
          console.log(` -> Disparando WhatsApp para ${auto.recipient_whatsapp}`)
          // await fetch('https://api.z-api.io/instances/.../messages/text', ...)
        }

        // 4. Atualiza registro na tabela
        await supabase
          .from("automations")
          .update({ last_sent_at: new Date().toISOString() })
          .eq("id", auto.id)

        disparos++
      }
    }

    return new Response(JSON.stringify({ status: "ok", executadas: disparos }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    })

  } catch (error: any) {
    console.error("Erro no processamento:", error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    })
  }
})
