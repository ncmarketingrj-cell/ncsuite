# 02 — Dicionário de Campos Meta Graph API v21.0 → Supabase → UI

Este dicionário padroniza o mapeamento exato de campos entre Meta Graph API v21.0, banco Supabase (`supabase/migrations/20261114000000_meta_integrity_contract.sql`) e frontend/IA.

## 1. Regras Globais de Estado de Dado (`FieldState`)

Todo campo não trivial exibido no sistema pertence a um destes estados explícitos:
- **`observado`**: obtido diretamente da Meta Graph API v21.0.
- **`calculado`**: derivado deterministicamente de campos `observado`s (ex.: `CPA = spend / results`, `CTR_link = inline_link_clicks / impressions * 100`, `ROAS = purchase_value / spend`).
- **`informado_pelo_usuario`**: inserido manualmente pelo usuário (ex.: faturamento/pedidos em Relatórios, metas/benchmarks do cliente).
- **`estimado`**: exclusivo de módulos de simulação explícita (`/simulador`), nunca apresentado como dado real.
- **`indisponivel`**: omitido pela API, expirado ou bloqueado por permissão (`permission_denied`). Nunca substituído por `0`, `0,75 * impressions`, `Math.random()`, nem `conversions * 150`.

---

## 2. Entidades & Métricas de Meta Ads

| Conceito NC Suite | Fonte Meta Graph API v21.0 | Coluna(s) Supabase | Semântica & Regra de Negócio | Estado Típico |
| :--- | :--- | :--- | :--- | :--- |
| ID externo / Conta | `adaccounts.id` (`act_...`) | `ad_accounts.external_id` | Prefixo `act_` preservado na consulta Graph API | `observado` |
| Status & motivo da conta | `account_status`, `disable_reason` | `billing_snapshots.account_status`, `disable_reason` | Códigos inteiros oficiais (ex.: `1=ATIVA`, `2=DESATIVADA`) | `observado` / `indisponivel` |
| Limite de gasto (`spend_cap`) | `spend_cap` (minor units) | `billing_snapshots.spend_cap` | `spend_cap === "0"` → estado `no_cap` ("Sem limite definido"); ausente por erro de permissão → `unavailable` ("Indisponível por permissão") | `observado` / `indisponivel` |
| Objetivo bruto Meta | `campaigns.objective` | `campaigns.raw_objective`, `campaigns.objective` | Preservado sem sobrescrita por nome de campanha/vendedor/prefixo | `observado` |
| Meta de otimização | `adsets.optimization_goal` / `insights.optimization_goal` | `ad_sets.optimization_goal`, `metrics.optimization_goal`, `asset_metrics.optimization_goal` | Ex.: `PROFILE_VISIT`, `CONVERSATIONS`, `LANDING_PAGE_VIEWS`, `OFFSITE_CONVERSIONS`, `REACH` | `observado` |
| Destino & atribuição | `adsets.destination_type`, `attribution_spec` | `ad_sets.destination_type`, `ad_sets.attribution_spec`, `metrics.attribution_window` | Ex.: `WHATSAPP`, `INSTAGRAM_PROFILE`, `WEBSITE`; janela padrão unificada (`7d_click + 1d_view` quando presente) | `observado` |
| Status configurado vs efetivo | `status`, `configured_status`, `effective_status` | `campaigns/ad_sets/ads.effective_status`, `configured_status`, `delivery_status` | Separa intenção (`ACTIVE`/`PAUSED`) de entrega real (`WITH_ISSUES`, `LEARNING`, etc.) | `observado` |
| Orçamento & moeda | `daily_budget`, `lifetime_budget`, `budget_remaining` | `campaigns/ad_sets.daily_budget`, `lifetime_budget`, `budget_remaining` | Divisão exata por `100` (minor units → moeda principal); não inventar orçamento quando herdado de CBO/ABO | `observado` |
| Gasto (`spend`) | `insights.spend` | `metrics.cost`, `asset_metrics.cost`, `meta_period_stats.spend` | Valor monetário sem multiplicação/arredondamento destrutivo na ingestão; arredondamento único na apresentação (`roundCurrency`) | `observado` |
| Resultado oficial (`results`) | `insights.results[]` → `values[].value` & `indicator` | `metrics/asset_metrics/meta_period_stats.conversions`, `result_indicator`, `results_json` | Prioridade máxima: se `results[]` vier preenchido para o objetivo (ex.: Rio2 `profile_visit`), usa o total exato dele em vez de somar `actions[]` concorrentes | `observado` |
| Categoria do resultado | `detectStrictConversionCategory(...)` | `metrics/asset_metrics/meta_period_stats.result_type` | Enum canônico: `MESSAGES`, `INSTAGRAM_PROFILE`, `LANDING_PAGE_VIEWS`, `PURCHASES`, `LEADS`, `CHECKOUT`, `ADD_TO_CART`, `VIDEO_VIEWS`, `ENGAGEMENT`, `REACH`, `LINK_CLICKS`, `UNKNOWN` | `calculado` |
| Cliques no link vs Todos os cliques | `insights.inline_link_clicks` vs `insights.clicks` | `metrics/asset_metrics.inline_link_clicks`, `clicks`, `all_clicks` | Preserva ambos separados: Rio2 (`0,72%` inline link CTR vs `2,46%` CTR all) sem colidir definições | `observado` |
| Valor de compra (`ROAS`) | `insights.action_values` (`omni_purchase`, `offsite_conversion.fb_pixel_purchase`, `purchase`) | `metrics/asset_metrics.purchase_value` | `roas = spend > 0 && purchase_value > 0 ? purchase_value / spend : null`. Nunca usa constante arbitrária (`* 150` ou `* 50`) | `observado` → `calculado` |
| Alcance da conta vs soma | `/{act_id}/insights?level=account` (`reach`) | `meta_account_period_stats.reach`, `meta_account_daily_stats.reach` | **Nunca** inferido somando campanhas/conjuntos. Quando exibir soma de campanhas, rotular explicitamente `Alcance (Soma)` vs `Alcance (Conta)` deduplicado | `observado` |
| View unificada diária | View SQL `public.daily_metrics` | `ad_account_id, date, spend, impressions, reach, reach_source, leads, purchases, results, roas` | Usa `meta_account_daily_stats.reach` quando presente (`reach_source = 'account_deduplicated'`) e `purchase_value / spend` para ROAS real | `calculado` |

---

## 3. Cobertura de Sync & Social Media

| Campo / Tabela | Tipo / Origem | Descrição |
| :--- | :--- | :--- |
| `sync_history.sync_coverage` | `jsonb` | Registro de etapas executadas, páginas lidas e sinalização de truncamento por conta/token |
| `sync_history.partial_failures` | `jsonb` | Lista de falhas parciais (`permission_denied`, `rate_limit`, `transient`) que impediram coleta integral e bloquearam purga destrutiva |
| `social_posts.reach_state` / `impressions_state` | `text` (`observado` \| `indisponivel`) | Substitui estimativas (`likes * 12 + 20`) por declaração explícita de disponibilidade da Meta API |
| Crossposts Facebook + Instagram | `mergeSocialCrosspostRecords(...)` | Chaves distintas `${platform}:${postId}`; publicação `"both"` mantém ambos canais ativos no feed em vez de sobrescrever |
