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
    // Campos separados em dois grupos:
    // - safeFields: universais, não exigem permissão especial
    // - extendedFields: podem falhar se o token não tiver ads_management
    const safeFields = "id,name,currency,amount_spent,balance,spend_cap,is_prepay_account"
    const extendedFields = "funding_source_details,bill_amount_immature"

    // Meta retorna amount_spent e balance na menor unidade (centavos em BRL),
    // salvo quando string já traz separador decimal.
    const parseAmount = (v: any): number | null => {
      if (v === undefined || v === null || v === "") return null
      const s = String(v).trim()
      if (s === "0") return 0
      const n = parseFloat(s)
      if (isNaN(n)) return null
      return s.includes(".") ? n : n / 100
    }

    const FUNDING_CODE_LABEL: Record<string, string> = {
      "1": "Cartão de Crédito",
      "2": "PayPal",
      "3": "Débito Direto / Transferência",
      "4": "Cupom / Crédito Meta",
      "20": "Boleto / Pix / Saldo Pré-Pago",
    }

    const results = await Promise.allSettled(
      accounts.map(async (acc: any) => {
        const accountId = acc.id // já vem no formato "act_XXXXXX"

        // 1) Campos seguros — não devem falhar para nenhuma conta
        let accountBilling: any = { id: accountId, name: acc.name, currency: acc.currency }
        try {
          const res = await metaGet(`/${accountId}`, token, { fields: safeFields })
          Object.assign(accountBilling, res)
        } catch (e) {
          accountBilling._safe_error = (e as Error).message
        }

        // 2) Campos estendidos — tenta, mas ignora se o token não tiver permissão
        try {
          const res = await metaGet(`/${accountId}`, token, { fields: extendedFields })
          if (res.funding_source_details) accountBilling.funding_source_details = res.funding_source_details
          if (res.bill_amount_immature !== undefined) accountBilling.bill_amount_immature = res.bill_amount_immature
        } catch {
          // sem permissão para billing avançado — normal em tokens de leitura
        }

        // 3) Histórico de transações (últimas 50)
        let transactions: any[] = []
        try {
          const txData = await metaGet(`/${accountId}/transactions`, token, {
            fields: "id,amount,billing_reason,currency,status,time_created,payment_option",
            limit: "50",
          })
          transactions = txData.data ?? []
        } catch {
          // contas sem histórico ou sem permissão — ignora
        }

        const normalizedFunding = accountBilling.funding_source_details
          ? {
              ...accountBilling.funding_source_details,
              is_prepay_account: Boolean(accountBilling.is_prepay_account),
              type_label:
                FUNDING_CODE_LABEL[String(accountBilling.funding_source_details.type ?? "")] ||
                String(accountBilling.funding_source_details.type || "Não informado"),
            }
          : accountBilling.is_prepay_account !== undefined
          ? { is_prepay_account: Boolean(accountBilling.is_prepay_account) }
          : null

        const snapshot = {
          user_id:          user.id,
          ad_account_id:    accountId,
          ad_account_name:  accountBilling.name ?? acc.name,
          fetched_at:       new Date().toISOString(),
          balance:          parseAmount(accountBilling.balance),
          amount_spent:     parseAmount(accountBilling.amount_spent),
          spend_cap:        parseAmount(accountBilling.spend_cap),
          currency:         accountBilling.currency ?? acc.currency ?? "BRL",
          funding_source:   normalizedFunding,
          bill_immature:    parseAmount(accountBilling.bill_amount_immature),
          transactions:     transactions.map(tx => ({
            id:             tx.id,
            amount:         parseAmount(tx.amount),
            billing_reason: tx.billing_reason,
            currency:       tx.currency,
            status:         tx.status,
            created_at:     tx.time_created
                              ? new Date(Number(tx.time_created) * 1000).toISOString()
                              : null,
            payment_option: tx.payment_option ?? null,
          })),
        }

        // Salva no banco
        await supabase.from("billing_snapshots").insert(snapshot)

        return { ...snapshot, _raw: accountBilling }
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
