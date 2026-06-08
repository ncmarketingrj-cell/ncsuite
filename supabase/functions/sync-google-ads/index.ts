import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Configurações do Google Ads API
const GOOGLE_ADS_API_VERSION = "v15";
const CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') || "";
const CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') || "";
const DEVELOPER_TOKEN = Deno.env.get('GOOGLE_DEVELOPER_TOKEN') || "";

async function getAccessToken(refreshToken: string) {
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!tokenResponse.ok) {
    throw new Error(`Failed to refresh token: ${await tokenResponse.text()}`);
  }

  const data = await tokenResponse.json();
  return data.access_token;
}

// Executa uma query GAQL
async function executeGAQL(customerId: string, query: string, accessToken: string) {
  const url = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${customerId}/googleAds:search`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "developer-token": DEVELOPER_TOKEN,
      "login-customer-id": customerId, // Simple assumption: using the same customer as login. In MCC setups, this is the MCC ID.
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ query })
  });

  if (!response.ok) {
    console.error(`GAQL Error for customer ${customerId}:`, await response.text());
    return [];
  }

  const data = await response.json();
  return data.results || [];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get all Google Ads configs
    const { data: configs, error: configsError } = await supabaseClient
      .from('google_ads_configs')
      .select('*');

    if (configsError) throw configsError;

    const results = [];

    for (const config of configs || []) {
      try {
        const accessToken = await getAccessToken(config.refresh_token);
        
        // 1. Fetch accessible customers (Ad Accounts)
        // Note: For MCC, you first query customer_client. For now, we list accessible customers.
        const listCustomersRes = await fetch(`https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers:listAccessibleCustomers`, {
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "developer-token": DEVELOPER_TOKEN
          }
        });

        if (!listCustomersRes.ok) {
           console.error("List accessible customers failed", await listCustomersRes.text());
           continue;
        }

        const accessibleData = await listCustomersRes.json();
        const resourceNames = accessibleData.resourceNames || [];

        for (const resource of resourceNames) {
          const customerId = resource.split("/")[1];
          
          // Busca detalhes da conta para salvar em ad_accounts
          const accountQuery = `SELECT customer.id, customer.descriptive_name, customer.currency_code FROM customer LIMIT 1`;
          const accountResults = await executeGAQL(customerId, accountQuery, accessToken);
          
          if (accountResults.length > 0) {
            const customer = accountResults[0].customer;
            
            // Upsert Ad Account with platform = 'Google Ads'
            await supabaseClient.from('ad_accounts').upsert({
              id: customer.id.toString(),
              name: customer.descriptive_name || `Account ${customer.id}`,
              currency: customer.currency_code,
              status: 1,
              user_id: config.user_id,
              platform: 'Google Ads',
              last_sync: new Date().toISOString()
            });

            // 2. Fetch Campaigns
            const campaignQuery = `SELECT campaign.id, campaign.name, campaign.status, campaign_budget.amount_micros FROM campaign WHERE campaign.status != 'REMOVED'`;
            const campaigns = await executeGAQL(customerId, campaignQuery, accessToken);

            for (const row of campaigns) {
               const c = row.campaign;
               const budgetStr = row.campaignBudget?.amountMicros || "0";
               const budget = parseInt(budgetStr, 10) / 1000000; // Convert from micros

               await supabaseClient.from('campaigns').upsert({
                 id: c.id.toString(), // Needs to handle uuid or use string mapping if schema requires uuid. 
                 // *NOTE*: Se `id` na tabela campaigns for UUID, precisamos gerar um UUID determinístico baseado no ID do Google ou alterar o schema.
                 // Assumindo que criaremos uma logica de fallback ou a coluna external_id.
                 name: c.name,
                 ad_account_id: customer.id.toString(),
                 platform: 'Google Ads',
                 status: c.status === 'ENABLED' ? 'active' : 'paused',
                 budget: budget,
                 updated_at: new Date().toISOString()
               }, { onConflict: 'id' }); // Assuming id can be handled or we use external_id.
            }
            
            // Aqui seguiria o pipeline para buscar metrics (impressions, clicks, cost_micros, conversions)
            // e popular public.metrics e public.asset_metrics.
          }
        }

        results.push({ configId: config.id, status: 'success' });
      } catch (err: any) {
        console.error(`Error syncing config ${config.id}:`, err);
        results.push({ configId: config.id, status: 'error', message: err.message });
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
