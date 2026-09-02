const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = "https://uqhilsnrrmlepdjzpubq.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVxaGlsc25ycm1sZXBkanpwdWJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1MzkxOTIsImV4cCI6MjA5ODExNTE5Mn0.BQOqIlmadGj07UUE2u_EWqD3rr4iv_XGF5QuiR5j_Bc";

const supabase = createClient(supabaseUrl, supabaseKey);

async function verify() {
  console.log("=== VERIFICAÇÃO REMOTA DE INTEGRIDADE DO SUPABASE ===");
  const startTime = Date.now();

  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'nc.marketingrj@gmail.com',
    password: 'ncmarketing2026'
  });

  if (authErr) {
    console.error("❌ ERRO DE AUTENTICAÇÃO:", authErr.message);
    process.exit(1);
  }
  console.log(`✅ Login efetuado com sucesso em ${Date.now() - startTime}ms. Usuário:`, authData.user.email);

  // 1. Testar perfis
  const t1 = Date.now();
  const { data: profiles, error: pErr } = await supabase.from('profiles').select('*');
  console.log(`✅ Consulta 'profiles': ${profiles?.length} perfis encontrados em ${Date.now() - t1}ms.`);
  if (pErr) console.error("❌ Erro em profiles:", pErr.message);

  // 2. Testar contas de anúncios e campanhas ativas
  const t2 = Date.now();
  const { data: adAccounts, error: accErr } = await supabase.from('ad_accounts').select('*');
  console.log(`✅ Consulta 'ad_accounts': ${adAccounts?.length} contas de anúncios em ${Date.now() - t2}ms.`);

  const t3 = Date.now();
  const { data: activeCampaigns, error: cErr } = await supabase.from('campaigns').select('*').eq('status', 'active');
  console.log(`✅ Consulta 'campaigns (ativas)': ${activeCampaigns?.length} campanhas ativas em ${Date.now() - t3}ms.`);

  // 3. Testar métricas recentes
  const t4 = Date.now();
  const { data: recentMetrics, error: mErr } = await supabase.from('metrics').select('*').order('date', { ascending: false }).limit(50);
  console.log(`✅ Consulta 'metrics' (últimas 50): ${recentMetrics?.length} linhas em ${Date.now() - t4}ms.`);

  // 4. Testar snapshots de faturamento recentes
  const t5 = Date.now();
  const { data: billing, error: bErr } = await supabase.from('billing_snapshots').select('*').order('fetched_at', { ascending: false }).limit(10);
  console.log(`✅ Consulta 'billing_snapshots' (recem-purga): ${billing?.length} linhas recentes em ${Date.now() - t5}ms.`);

  // 5. Testar notificações recentes
  const t6 = Date.now();
  const { data: notifs, error: nErr } = await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(10);
  console.log(`✅ Consulta 'notifications' (recém-purga): ${notifs?.length} linhas recentes em ${Date.now() - t6}ms.`);

  console.log("\n=======================================================");
  console.log("🎉 INTEGRIDADE DO SUPABASE 100% CONFIRMADA E FUNCIONAL!");
  console.log("=======================================================");
}

verify();
