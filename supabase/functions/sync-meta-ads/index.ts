import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Cabeçalho de autorização ausente." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Inicializa o cliente do Supabase com a Service Role Key para poder gravar os dados
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

    // Valida o usuário através do token recebido no header
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      global: { headers: { Authorization: authHeader } },
    });
    
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Sessão inválida ou expirada." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Busca a configuração de integração do Meta Ads para este usuário
    const { data: config, error: configError } = await supabaseClient
      .from("meta_ads_configs")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (configError) {
      throw new Error(`Erro ao buscar configurações no banco: ${configError.message}`);
    }

    if (!config || !config.access_token || !config.ad_account_id) {
      return new Response(
        JSON.stringify({ error: "Integração do Meta Ads não configurada. Salve suas credenciais primeiro nas Configurações." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { access_token, ad_account_id } = config;

    // Padroniza o ID da Conta de Anúncios adicionando 'act_' caso não tenha
    const formattedAccountId = ad_account_id.startsWith("act_") ? ad_account_id : `act_${ad_account_id}`;

    console.log(`[Sync] Iniciando sincronização para a conta: ${formattedAccountId}`);

    // 3. Busca campanhas ativas e pausadas do Meta Ads
    const campaignsUrl = `https://graph.facebook.com/v19.0/${formattedAccountId}/campaigns?fields=id,name,status,daily_budget,lifetime_budget&limit=250&access_token=${access_token}`;
    const campaignsRes = await fetch(campaignsUrl);
    const campaignsData = await campaignsRes.json();

    if (campaignsData.error) {
      throw new Error(`Erro na API do Meta (Campanhas): ${campaignsData.error.message}`);
    }

    const metaCampaigns = campaignsData.data || [];
    console.log(`[Sync] Encontradas ${metaCampaigns.length} campanhas na Meta API.`);

    const syncedCampaigns = [];

    // Mapeia e insere/atualiza as campanhas no banco de dados local
    for (const mc of metaCampaigns) {
      const rawBudget = mc.daily_budget ? Number(mc.daily_budget) : (mc.lifetime_budget ? Number(mc.lifetime_budget) : 0);
      const budget = rawBudget / 100; // O Meta retorna o orçamento em centavos (ex: 5000 = R$ 50,00)
      const status = mc.status === "ACTIVE" ? "active" : "paused";

      // Verifica se a campanha existe pelo nome no projeto
      const { data: existingCampaign } = await supabaseClient
        .from("campaigns")
        .select("id, client_id")
        .eq("name", mc.name)
        .maybeSingle();

      let campaignId;
      if (existingCampaign) {
        campaignId = existingCampaign.id;
        // Atualiza a campanha existente
        const { error: updateErr } = await supabaseClient
          .from("campaigns")
          .update({
            status,
            budget,
            platform: "Meta Ads"
          })
          .eq("id", campaignId);
          
        if (updateErr) {
          console.error(`[Sync] Erro ao atualizar campanha ${mc.name}:`, updateErr.message);
        }
      } else {
        // Insere uma nova campanha
        const { data: newCampaign, error: insertErr } = await supabaseClient
          .from("campaigns")
          .insert({
            name: mc.name,
            status,
            budget,
            platform: "Meta Ads"
          })
          .select("id")
          .single();

        if (insertErr) {
          console.error(`[Sync] Erro ao inserir campanha ${mc.name}:`, insertErr.message);
          continue;
        }
        campaignId = newCampaign.id;
      }

      syncedCampaigns.push({
        id: campaignId,
        facebook_id: mc.id,
        name: mc.name,
        client_id: existingCampaign?.client_id || null
      });
    }

    // 4. Busca métricas e resultados diários (últimos 30 dias)
    const today = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate() - 30);

    const formatDate = (date: Date) => date.toISOString().split("T")[0];
    const sinceDate = formatDate(thirtyDaysAgo);
    const untilDate = formatDate(today);

    console.log(`[Sync] Buscando métricas de ${sinceDate} até ${untilDate}`);

    const insightsUrl = `https://graph.facebook.com/v19.0/${formattedAccountId}/insights?fields=campaign_id,campaign_name,impressions,clicks,spend,reach,actions&level=campaign&time_increment=1&time_range={"since":"${sinceDate}","until":"${untilDate}"}&limit=1000&access_token=${access_token}`;
    const insightsRes = await fetch(insightsUrl);
    const insightsData = await insightsRes.json();

    if (insightsData.error) {
      throw new Error(`Erro na API do Meta (Insights): ${insightsData.error.message}`);
    }

    const metaInsights = insightsData.data || [];
    console.log(`[Sync] Recebidos ${metaInsights.length} registros diários de insights.`);

    let syncedMetricsCount = 0;

    for (const row of metaInsights) {
      // Encontra a campanha correspondente que acabamos de mapear
      const matched = syncedCampaigns.find(c => c.name === row.campaign_name || c.facebook_id === row.campaign_id);
      if (!matched) continue;

      const date = row.date_start; // Formato "YYYY-MM-DD"
      const impressions = Number(row.impressions || 0);
      const clicks = Number(row.clicks || 0);
      const cost = Number(row.spend || 0);
      const reach = Number(row.reach || 0);

      // Agrega as conversões do array de ações (Leads, Mensagens, Compras, etc.)
      let conversions = 0;
      let result_type = "Outros";

      if (row.actions && Array.isArray(row.actions)) {
        for (const action of row.actions) {
          const type = action.action_type;
          const val = Number(action.value || 0);

          // Verifica tipos comuns de conversões
          if (type === "lead" || type.includes("lead") || type === "onsite_conversion.messaging_first_reply") {
            conversions += val;
            result_type = "Lead / Conversa";
          } else if (type === "purchase" || type.includes("purchase") || type.includes("checkout")) {
            conversions += val;
            result_type = "Compra";
          }
        }
      }

      // Verifica se já existe um registro para esta campanha e data
      const { data: existingMetric } = await supabaseClient
        .from("metrics")
        .select("id")
        .eq("campaign_id", matched.id)
        .eq("date", date)
        .maybeSingle();

      if (existingMetric) {
        // Atualiza a métrica diária existente
        const { error: metricUpdateErr } = await supabaseClient
          .from("metrics")
          .update({
            impressions,
            clicks,
            conversions,
            cost,
            reach,
            result_type,
            client_id: matched.client_id
          })
          .eq("id", existingMetric.id);

        if (metricUpdateErr) {
          console.error(`[Sync] Erro ao atualizar métrica do dia ${date}:`, metricUpdateErr.message);
        }
      } else {
        // Insere uma nova métrica diária
        const { error: metricInsertErr } = await supabaseClient
          .from("metrics")
          .insert({
            campaign_id: matched.id,
            client_id: matched.client_id,
            date,
            impressions,
            clicks,
            conversions,
            cost,
            reach,
            result_type
          });

        if (metricInsertErr) {
          console.error(`[Sync] Erro ao inserir métrica do dia ${date}:`, metricInsertErr.message);
          continue;
        }
      }
      syncedMetricsCount++;
    }

    console.log(`[Sync] Concluído! Sincronizadas ${syncedCampaigns.length} campanhas e ${syncedMetricsCount} métricas diárias.`);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Sincronização concluída com sucesso!",
        campaignsSynced: syncedCampaigns.length,
        metricsSynced: syncedMetricsCount
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (err: any) {
    console.error("[Sync Error] Erro fatal durante a sincronização:", err);
    return new Response(
      JSON.stringify({
        error: err.message || "Erro interno do servidor durante a sincronização."
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
