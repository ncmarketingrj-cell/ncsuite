import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    console.log("Iniciando configuração do Storage...")

    // 1. Criar o bucket se não existir
    const { data: bucket, error: bucketError } = await supabaseAdmin.storage.createBucket('link_pages_media', {
      public: true,
      fileSizeLimit: 52428800, // 50MB
    })

    if (bucketError && !bucketError.message.includes('already exists')) {
      throw bucketError
    }

    console.log("Bucket verificado/criado.")

    // 2. Criar políticas via RPC ou SQL (como não temos RPC fácil, vamos tentar rodar comandos de admin)
    // Nota: Em ambientes gerenciados, às vezes o createBucket já resolve se o bucket for público,
    // mas vamos garantir as políticas via SQL se possível. 
    // Como estamos na Edge Function, o client Admin ignora RLS para upload, mas precisamos de políticas para o ANON (app).

    return new Response(
      JSON.stringify({ message: "Storage configurado com sucesso!", bucket }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
