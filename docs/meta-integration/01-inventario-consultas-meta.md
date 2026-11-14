# 01 — Inventário de Consultas Meta Graph API v21.0

Este documento cataloga todas as consultas realizadas na **Meta Graph API (`https://graph.facebook.com/v21.0`)** pelas Edge Functions Supabase e serviços do NC Suite após a refatoração para paginação integral (`metaFetchPaginatedWithStatus`) e retentativa exponencial (`metaFetchJsonWithRetry`).

> Nota sobre auditoria anterior: o arquivo `Auditoria_Final_Integracao_Meta_NC_Suite.md` não existia no repositório nem nos anexos fornecidos; este inventário reflete exclusivamente o código verificado no workspace.

---

## 1. Ads — Sincronização & Insights (`supabase/functions/sync-meta-ads/index.ts`)

| # | Endpoint Graph API v21.0 | Método / Escopo | Campos (`fields`) Principais | Granularidade / Janela | Paginação & Retry | Destino no Supabase |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | `/me/adaccounts` | `GET` (por token configurado) | `name,currency,account_status,disable_reason,id,timezone_name` | Conta | Paginado (`paging.next` até `maxPages`), retry 429/5xx | `ad_accounts` |
| 2 | `/{adAccountId}/campaigns` | `GET` | `id,name,status,effective_status,configured_status,buying_type,bid_strategy,daily_budget,lifetime_budget,budget_remaining,spend_cap,start_time,stop_time,special_ad_categories,objective` | Estrutura | Paginado (`limit=200`, `paging.next`), retry 429/5xx | `campaigns` |
| 3 | `/{adAccountId}/adsets` | `GET` | `id,name,status,effective_status,configured_status,campaign_id,daily_budget,lifetime_budget,budget_remaining,optimization_goal,billing_event,bid_strategy,bid_amount,destination_type,attribution_spec,promoted_object,targeting,start_time,end_time` | Estrutura | Paginado (`paging.next`), retry 429/5xx | `ad_sets` |
| 4 | `/{adAccountId}/ads` | `GET` | `id,name,status,effective_status,configured_status,adset_id,campaign_id,creative{id,name,effective_object_story_id,call_to_action_type,thumbnail_url}` | Estrutura + Criativo | Paginado (`paging.next`), retry 429/5xx | `ads` |
| 5 | `/{adAccountId}/insights` | `GET` `level=account`, `time_increment=1` | `account_id,spend,reach,impressions,frequency,clicks,inline_link_clicks,ctr,cpc,cpm,date_start,date_stop` | Conta diária (alcance deduplicado/dia) | Paginado (`paging.next`), retry 429/5xx | `meta_account_daily_stats` |
| 6 | `/{adAccountId}/insights` | `GET` `level=account` (período consolidado) | `account_id,spend,reach,impressions,frequency,clicks,inline_link_clicks,actions,action_values,results,date_start,date_stop` | Conta no período (alcance deduplicado total) | Paginado (`paging.next`), retry 429/5xx | `meta_account_period_stats` |
| 7 | `/{adAccountId}/insights` | `GET` `level=campaign`, `time_increment=1` e período | `campaign_id,campaign_name,objective,optimization_goal,results,cost_per_result,spend,actions,action_values,reach,impressions,frequency,clicks,inline_link_clicks,ctr,cpc,cpm,date_start,date_stop` | Campanha diária & período | Paginado (`paging.next`), retry 429/5xx | `metrics`, `meta_period_stats` |
| 8 | `/{adAccountId}/insights` | `GET` `level=adset`, `time_increment=1` e período | `adset_id,adset_name,campaign_id,campaign_name,objective,optimization_goal,results,cost_per_result,spend,actions,action_values,reach,impressions,frequency,clicks,inline_link_clicks,video_p25_watched_actions,video_p50_watched_actions,video_p75_watched_actions,video_p95_watched_actions,date_start,date_stop` | Conjunto diário & período | Paginado (`paging.next`), retry 429/5xx | `asset_metrics`, `meta_period_stats` |
| 9 | `/{adAccountId}/insights` | `GET` `level=ad`, `time_increment=1` e período | `ad_id,ad_name,adset_id,campaign_id,campaign_name,objective,optimization_goal,results,cost_per_result,spend,actions,action_values,reach,impressions,frequency,clicks,inline_link_clicks,video_p25_watched_actions,video_p50_watched_actions,video_p75_watched_actions,video_p95_watched_actions,date_start,date_stop` | Anúncio diário & período | Paginado (`paging.next`), retry 429/5xx | `asset_metrics`, `meta_period_stats` |
| 10 | `/{adAccountId}/insights` (Breakdowns) | `GET` `level=campaign` com `breakdowns=age,gender`, `publisher_platform,platform_position`, `hourly_stats_aggregated_by_advertiser_time_zone`, `region`, `impression_device` | `campaign_id,campaign_name,objective,optimization_goal,results,spend,actions,action_values,reach,impressions,clicks,inline_link_clicks,date_start` | Breakdown diário | Paginado (`paging.next`), retry 429/5xx | `demographic_metrics`, `placement_metrics`, `hourly_metrics`, `region_metrics`, `device_metrics` |

---

## 2. Faturamento e Billing (`supabase/functions/get-meta-billing/index.ts`)

| # | Endpoint Graph API v21.0 | Método | Campos (`fields`) Principais | Regras Críticas | Destino |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | `/me/adaccounts` | `GET` | `id,name,currency,account_status,disable_reason,balance,amount_spent,spend_cap,funding_source_details,min_billing_threshold` | Paginado para todos os tokens; trata erro de permissão sem mascarar `spend_cap=0` | `billing_snapshots` / resposta JSON |
| 2 | `/{adAccountId}/transactions` | `GET` | `id,time,amount,charge_type,status,billing_reason,payment_option,provider_amount` | Paginado; lacuna de permissão registrada em `permission_gaps` + `is_partial` | `billing_transactions` / resposta JSON |

---

## 3. Social Media Orgânico (`supabase/functions/sync-social-media/index.ts` & `src/lib/metaSocialService.ts`)

| # | Endpoint Graph API v21.0 | Método | Campos / Métricas | Regras & Limitações Oficiais Meta | Destino |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | `/me/accounts` | `GET` | `id,name,access_token,fan_count,followers_count,instagram_business_account{id,username,followers_count,profile_picture_url}` | Paginado (`paging.next`); removeu corte fixo de 10 páginas | `social_pages` / `getConnectedSocialAccounts()` |
| 2 | `/{igAccountId}/insights` | `GET` | `reach,follower_count` (`period=day`) e `views,total_interactions,accounts_engaged,profile_views,website_clicks` (`metric_type=total_value`), `follower_demographics` | `reach` diário vs totais agregados; `since`/`until` | `social_daily_metrics` / `fetchSocialDashboardInsights()` |
| 3 | `/{igAccountId}/media` | `GET` | `id,caption,media_type,media_product_type,thumbnail_url,media_url,permalink,timestamp,like_count,comments_count` | Paginado; cada item consulta `/{mediaId}/insights?metric=reach,views,saved,shares,total_interactions` | `social_posts` / feed |
| 4 | `/{igAccountId}/stories` | `GET` | `id,caption,media_type,media_url,thumbnail_url,permalink,timestamp` | Apenas stories ativos (~24h) retornados pela API | Visualização Social |
| 5 | `/{pageId}/insights` | `GET` | `page_views_total,page_post_engagements,page_daily_follows` (`period=day`) | Usa Page Access Token retornado por `/me/accounts` | `social_daily_metrics` |
| 6 | `/{pageId}/posts` | `GET` | `id,message,created_time,full_picture,permalink_url,attachments{...},likes.summary(true),comments.summary(true),shares` | Enriquece via `/{postId}/insights?metric=post_impressions_unique,post_impressions` | `social_posts` |
| 7 | `/{pageId}/scheduled_posts` & `/{pageId}/promotable_posts` | `GET` | `id,message,created_time,scheduled_publish_time,full_picture,permalink_url,is_published,attachments{...}` | **Limitação oficial**: Instagram Graph API **não** expõe agendamentos nativos nem rascunhos criados no app IG/Business Suite; apenas Facebook Page possui `scheduled_posts`. | Planejador Social |

---

## 4. Calibração Sob Demanda no Cliente (`src/lib/metaConversionCalibrator.ts`)

- Removida a exclusão destrutiva de `ad_accounts` / `campaigns` no navegador e removida a mutação forçada `campaigns.objective = "MESSAGES"`.
- Mantido apenas o utilitário paginado `calibrateMetaConversionsFromGraph` (`maxPages = 50`) usando `metaFetchPaginatedWithStatus` e `detectStrictConversionCategory` quando o usuário dispara calibração manual explícita.
