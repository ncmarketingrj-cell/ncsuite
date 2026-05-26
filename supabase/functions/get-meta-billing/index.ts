// supabase/functions/get-meta-billing/index.ts
// NC Performance Suite — Dados de Cobrança das Contas Meta Ads

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.1"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const META_API_BASE = "https://graph.facebook.com/v21.0"

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
)

async function metaGet(path: string, token: string, params: Record<string, string> = {}) {
  const url = new URL(`${META_API_BASE}${path}`)
  url.searchParams.set("access_token", token)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res = await fetch(url.toString())
  const data = await res.json()
  if (data.error) throw new Error(`Meta API [${path}]: ${data.error.message}`)
  return data
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    // ── Auth ─────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization")
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Não autorizado." }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }
    const { data: { user }, error: authErr } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    )
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Não autorizado." }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // ── Token Meta ────────────────────────────────────────────────────────────
    // MESMO padrão do sync-meta-ads: busca qualquer token disponível na tabela,
    // SEM filtrar por user_id — o token pode estar salvo sob o user_id do admin/master
    // e o usuário logado ter um UUID diferente. O sync-meta-ads já usa esse padrão.
    const { data: config } = await supabase
      .from("meta_ads_configs")
      .select("access_token")
      .not("access_token", "is", null)
      .maybeSingle()

    if (!config?.access_token) {
      return new Response(JSON.stringify({ accounts: [], error: "Token Meta Ads não configurado. Acesse Configurações → Integrações." }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const token = config.access_token

    // ── Busca todas as contas vinculadas ─────────────────────────────────────
    const accountsData = await metaGet("/me/adaccounts", token, {
      fields: "id,name,currency,account_status",
      limit: "100",
    })

    const accounts: any[] = accountsData.data ?? []

    if (accounts.length === 0) {
      return new Response(JSON.stringify({ accounts: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // ── Busca billing de cada conta em paralelo ───────────────────────────────
    const billingFields = [
      "id", "name", "currency",
      "balance",           // saldo pré-pago (centavos)
      "amount_spent",      // gasto acumulado lifetime (centavos)
      "spend_cap",         // limite de gasto
      "funding_source_details",
      "bill_amount_immature",  // não faturado do ciclo atual
    ].join(",")

    const results = await Promise.allSettled(
      accounts.map(async (acc: any) => {
        const accountId = acc.id // já vem no formato "act_XXXXXX"

        // Dados da conta
        let accountBilling: any = {}
        try {
          accountBilling = await metaGet(`/${accountId}`, token, { fields: billingFields })
        } catch (e) {
          accountBilling = { id: accountId, name: acc.name, currency: acc.currency, _error: (e as Error).message }
        }

        // Histórico de transações (últimas 50)
        let transactions: any[] = []
        try {
          const txData = await metaGet(`/${accountId}/transactions`, token, {
            fields: "id,amount,billing_reason,currency,status,time_created,payment_option",
            limit: "50",
          })
          transactions = txData.data ?? []
        } catch {
          // algumas contas não têm histórico de transações — ignora silenciosamente
        }

        // Normaliza valores (Meta retorna centavos como strings)
        const parseAmount = (v: any) => v !== undefined && v !== null ? parseFloat(v) / 100 : null

        const snapshot = {
          user_id:          user.id,
          ad_account_id:    accountId,
          ad_account_name:  accountBilling.name ?? acc.name,
          fetched_at:       new Date().toISOString(),
          balance:          parseAmount(accountBilling.balance),
          amount_spent:     parseAmount(accountBilling.amount_spent),
          spend_cap:        parseAmount(accountBilling.spend_cap),
          currency:         accountBilling.currency ?? acc.currency ?? "BRL",
          funding_source:   accountBilling.funding_source_details ?? null,
          bill_immature:    parseAmount(accountBilling.bill_amount_immature),
          transactions:     transactions.map(tx => ({
            id:             tx.id,
            amount:         parseAmount(tx.amount),
            billing_reason: tx.billing_reason,
            currency:       tx.currency,
            status:         tx.status,
            created_at:     tx.time_created,
            payment_option: tx.payment_option ?? null,
          })),
        }

        // Salva/atualiza no banco (upsert pelo account_id + data de hoje)
        await supabase.from("billing_snapshots").insert(snapshot)

        return snapshot
      })
    )

    const successful = results
      .filter(r => r.status === "fulfilled")
      .map(r => (r as PromiseFulfilledResult<any>).value)

    const errors = results
      .filter(r => r.status === "rejected")
      .map(r => (r as PromiseRejectedResult).reason?.message)

    return new Response(JSON.stringify({ accounts: successful, errors }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message ?? "Erro interno." }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})
