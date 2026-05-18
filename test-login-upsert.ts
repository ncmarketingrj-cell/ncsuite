import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://xudumzedcxuuhxokissm.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_KVptQYNLCFSjqmUYJcGmrQ_WurR5l_p'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

async function run() {
  console.log('1. Fazendo Login com nc.marketingrj@gmail.com ...')
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'nc.marketingrj@gmail.com',
    password: 'ncmarketing2026'
  })

  if (authErr) {
    console.error('ERRO DE LOGIN:', authErr.message)
    return
  }
  
  console.log('Login SUCESSO! User ID:', authData.user.id)
  console.log('Access Token obtido. Fazendo upsert na tabela meta_ads_configs...')

  const { data: upsertData, error: upsertErr } = await supabase
    .from('meta_ads_configs')
    .upsert({
      user_id: authData.user.id,
      access_token: 'TESTE_DIRETO_TERMINAL',
      ad_account_id: 'ALL_ACCOUNTS'
    }, { onConflict: 'user_id' })
    .select()

  if (upsertErr) {
    console.error('ERRO NO UPSERT DA TABELA meta_ads_configs:')
    console.error(upsertErr)
    return
  }

  console.log('SUCESSO ABSOLUTO! Dados salvos na tabela meta_ads_configs:', upsertData)
}

run()
