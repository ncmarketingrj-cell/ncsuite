// supabase/functions/get-meta-billing/index.ts
// NC Performance Suite — Dados de Cobrança das Contas Meta Ads (Paginado, Normalizado & Sem Omissões)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.1"
import {
  META_GRAPH_BASE,
  metaFetchJsonWithRetry,
  metaFetchPaginatedWithStatus,
  normalizeMetaBillingAccount,
  parseMetaMoneyMinorUnit,
} from "../_shared/metaCore.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const META_API_BASE = META_GRAPH_BASE

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
)

async function metaGetJson(path: string, token: string, params: Record<string, string> = {}) {
  const url = new URL(`${META_API_BASE}${path}`)
  url.searchParams.set("access_token", token)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res = await metaFetchJsonWithRetry(url.toString(), { maxRetries: 3, baseDelayMs: 500 })
  if (!res.ok || res.data?.error) {
    throw new Error(res.error || res.data?.error?.message || `Meta API HTTP ${res.statusCode}`)
  }
  return res.data
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
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

    const { data: configs } = await supabase
      .from("meta_ads_configs")
      .select("access_token, user_id")
      .not("access_token", "is", null)
      .order("created_at", { ascending: false })

    if (!configs || configs.length === 0) {
      return new Response(JSON.stringify({ accounts: [], error: "Token Meta Ads não configurado. Acesse Configurações → Integrações." }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // Agrega contas de todos os tokens configurados sem deduplicação indevida
    const accountEntries: { acc: any; token: string }[] = []
    const seenIds = new Set<string>()
    const globalWarnings: string[] = []

    for (const cfg of configs) {
      if (!cfg.access_token) continue
      const accountsRes = await metaFetchPaginatedWithStatus("/me/adaccounts", cfg.access_token, {
        fields: "id,name,currency,account_status,disable_reason",
        limit: "100",
      }, { maxRetries: 3, baseDelayMs: 500, maxPages: 50 })

      if (!accountsRes.ok || accountsRes.truncated) {
        globalWarnings.push(`Listagem de contas (${cfg.user_id}): ${accountsRes.error || "paginação truncada"}`)
      }

      for (const acc of accountsRes.data) {
        if (!acc?.id || seenIds.has(acc.id)) continue
        seenIds.add(acc.id)
        accountEntries.push({ acc, token: cfg.access_token })
      }
    }

    if (accountEntries.length === 0) {
      return new Response(JSON.stringify({ accounts: [], warnings: globalWarnings }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const safeFields = "id,name,currency,account_status,disable_reason,amount_spent,balance,spend_cap,is_prepay_account"
    const extendedFields = "funding_source_details,bill_amount_immature,min_billing_threshold"

    const FUNDING_CODE_LABEL: Record<string, string> = {
      "1": "Cartão de Crédito",
      "2": "PayPal",
      "3": "Débito Direto / Transferência",
      "4": "Cupom / Crédito Meta",
      "20": "Boleto / Pix / Saldo Pré-Pago",
    }

    const results = await Promise.allSettled(
      accountEntries.map(async ({ acc, token }) => {
        const accountId = acc.id
        const permissionGaps: string[] = []

        const accountBilling: any = {
          id: accountId,
          name: acc.name,
          currency: acc.currency || "BRL",
          account_status: acc.account_status,
          disable_reason: acc.disable_reason,
        }

        try {
          const res = await metaGetJson(`/${accountId}`, token, { fields: safeFields })
          Object.assign(accountBilling, res)
        } catch (e: any) {
          permissionGaps.push(`basic_billing: ${e?.message || "indisponível"}`)
        }

        try {
          const res = await metaGetJson(`/${accountId}`, token, { fields: extendedFields })
          if (res.funding_source_details) accountBilling.funding_source_details = res.funding_source_details
          if (res.bill_amount_immature !== undefined) accountBilling.bill_amount_immature = res.bill_amount_immature
          if (res.min_billing_threshold !== undefined) accountBilling.min_billing_threshold = res.min_billing_threshold
        } catch (e: any) {
          permissionGaps.push(`extended_billing: ${e?.message || "permissão ads_management/financeira ausente"}`)
        }

        const txRes = await metaFetchPaginatedWithStatus(`/${accountId}/transactions`, token, {
          fields: "id,amount,billing_reason,currency,status,time_created,payment_option",
          limit: "50",
        }, { maxRetries: 2, baseDelayMs: 500, maxPages: 5 })

        if (!txRes.ok || txRes.truncated) {
          permissionGaps.push(`transactions: ${txRes.error || "histórico truncado"}`)
        }

        const norm = normalizeMetaBillingAccount(accountBilling, permissionGaps)
        const baseFunding = accountBilling.funding_source_details
          ? {
              ...accountBilling.funding_source_details,
              is_prepay_account: Boolean(norm.isPrepayAccount),
              type_label:
                FUNDING_CODE_LABEL[String(accountBilling.funding_source_details.type ?? "")] ||
                String(accountBilling.funding_source_details.type || "Não informado"),
            }
          : norm.isPrepayAccount !== null
          ? { is_prepay_account: Boolean(norm.isPrepayAccount) }
          : {}

        const normalizedFunding = {
          ...baseFunding,
          spend_cap_state: norm.spendCapState,
        }

        const snapshot = {
          user_id: user.id,
          ad_account_id: accountId,
          ad_account_name: accountBilling.name ?? acc.name,
          fetched_at: new Date().toISOString(),
          balance: norm.balance,
          amount_spent: norm.amountSpent,
          spend_cap: norm.spendCap,
          currency: norm.currency,
          funding_source: Object.keys(normalizedFunding).length > 0 ? normalizedFunding : null,
          bill_immature: norm.billImmature,
          account_status: norm.accountStatus,
          disable_reason: norm.disableReason,
          min_billing_threshold: norm.minBillingThreshold,
          permission_gaps: permissionGaps,
          is_partial: permissionGaps.length > 0,
          transactions: (txRes.data || []).map((tx: any) => ({
            id: tx.id,
            amount: parseMetaMoneyMinorUnit(tx.amount, tx.currency || norm.currency),
            billing_reason: tx.billing_reason,
            currency: tx.currency || norm.currency,
            status: tx.status,
            created_at: tx.time_created
              ? new Date(Number(tx.time_created) * 1000).toISOString()
              : null,
            payment_option: tx.payment_option ?? null,
          })),
        }

        const { error: insertErr } = await supabase.from("billing_snapshots").insert(snapshot)
        if (insertErr) {
          // Fallback para schema sem colunas novas da migration
          const { account_status: _a, disable_reason: _d, min_billing_threshold: _m, permission_gaps: _p, is_partial: _i, ...legacySnapshot } = snapshot
          await supabase.from("billing_snapshots").insert(legacySnapshot)
        }

        return {
          ...snapshot,
          spend_cap_state: norm.spendCapState,
          _raw: accountBilling,
        }
      })
    )

    const successful = results
      .filter(r => r.status === "fulfilled")
      .map(r => (r as PromiseFulfilledResult<any>).value)

    const errors = results
      .filter(r => r.status === "rejected")
      .map(r => (r as PromiseRejectedResult).reason?.message)

    return new Response(JSON.stringify({
      accounts: successful,
      errors,
      warnings: globalWarnings,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message ?? "Erro interno." }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})
