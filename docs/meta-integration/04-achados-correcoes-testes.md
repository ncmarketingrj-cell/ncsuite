# 04 — Achados Críticos, Correções Aplicadas, Limitações & Testes

## 1. Achados Críticos Corrigidos

1. **Coerções por nome/cliente/vendedor e força bruta de `"MESSAGES"`**:
   - Removidas regras hardcoded (`"TRAFEGO NC"`, `"VICTOR"`, `"YURI"`, `"TAYNA"`, `"RUTH"`, `"6720"`, `"7243"`, `"2026-11-12"`) de `sync-meta-ads`, `metaConversionCalibrator.ts`, `run-automations`, `victoria-agent`, `metricas.tsx`, `dashboard.tsx`, `relatorios.tsx`, e view SQL `daily_metrics`.
   - `OUTCOME_ENGAGEMENT` e objetivos ambíguos passaram a usar hierarquia oficial da Meta (`results[].indicator` → `optimization_goal` / `destination_type` → `result_type` → `objective`), retornando `UNKNOWN` ("Revisar") em vez de mascarar como `MESSAGES`.
2. **ROAS, Alcance e Demográficos Fabricados**:
   - `metricas.tsx`: removido `roas = (conversions * 150) / cost` e removido todo o simulador demográfico (`ageData`, `genderData`, `regionData`, `Math.random()` `heatMapData` / `"Modo Simulador Educativo Ativo"`).
   - `agent-heartbeat`: removido `roas = (totalConv * 50) / totalCost`; agora retorna `null` e não dispara regra de ROAS quando não há `purchase_value` real.
   - `auditoria.tsx`: removido fallback silencioso `generateMockStats` (`spend = 4850`, `reach = 160000`, `sales = 9`) em erro ou ausência de dados.
   - `dashboard.tsx`: removido `Math.round(totals.impressions * 0.75)` no card executivo; exibe `Alcance (Conta)` deduplicado ou `Alcance (Soma)` / `"—"`.
   - `sync-social-media` & `social.tsx`: removida geração artificial de alcance (`likes * 12 + 20`, `randomFactor`); marca explicitamente `reach_state = 'indisponivel'` → `"—"` na UI.
3. **Cortes de Paginação, Perda Silenciosa de Objetos e Bug em Crosspost**:
   - Paginação integral por `paging.next` adicionada em `sync-meta-ads`, `get-meta-billing`, `sync-social-media`, `metaSocialService.ts` e `metaConversionCalibrator.ts` (removendo cap de 10 páginas e `.slice(0, 10)` de contas).
   - `sync-meta-ads`: só limpa contas órfãs se 100% das chamadas `/me/adaccounts` concluírem sem falha nem truncamento; atualiza `last_sync` apenas após upsert bem-sucedido por conta; global `catch` não marca todos os usuários com erro de token.
   - `metricas.tsx`: adicionado botão `Sem entrega (N)` para expor campanhas/conjuntos/anúncios sem gasto, liberado acesso direto às abas Conjuntos e Anúncios sem precisar ticar campanhas antes, e preservado resultado oficial do nível campanha sem sobrescrita destrutiva por `adSum`.
   - `metaSocialService.ts`: corrigido `mergeSocialCrosspostRecords` para não apagar um canal quando um post é publicado simultaneamente no Facebook e Instagram (`platform = "both"`).
4. **Bugs de Runtime, Billing & Arredondamento**:
   - `run-automations`: corrigidos `ReferenceError` de escopo (`dailyBudget`, `alertsToInsert`, `result`, `link`) que impediam persistência de alertas `ZERO_DELIVERY`.
   - `get-meta-billing` & `cobrancas.tsx`: diferenciado `spend_cap === "0"` (`no_cap` = "Sem limite definido") de permissão ausente (`unavailable` = "Indisponível por permissão"), mais exposição de `account_status` / `disable_reason` / `is_partial`.
   - `reportTemplateEngine.ts` & `relatorios.tsx`: removido default fictício (`25.538,08` / `244`) e padronizado todo valor monetário via `roundCurrency` + `formatCurrencyBRLStrict` (evitando divergência de centavo tipo `4,76` vs `4,77`).

---

## 2. Limitações Conhecidas e Documentadas da Meta API v21.0

- **Agendamento nativo no Instagram**: a Instagram Graph API não expõe posts agendados nativamente pelo aplicativo do Instagram nem rascunhos internos do Meta Business Suite; apenas agendamentos do Facebook (`/{pageId}/scheduled_posts`) e a fila local do NC Suite são listáveis.
- **Métricas de Stories antigos / Privacidade de Breakdowns**: Stories expiram na Graph API após ~24h; breakdowns demográficos/regionais com baixo volume são omitidos pela Meta por privacidade e permanecem vazios (`hasRealData = false`).
- **Schema estendido pendente de push SQL**: a migration `supabase/migrations/20261114000000_meta_integrity_contract.sql` adiciona colunas/tabelas (`meta_account_period_stats`, `meta_account_daily_stats`, `inline_link_clicks`, `purchase_value`, etc.). O frontend e Edge Functions aplicam fallback seguro caso a migration ainda não esteja aplicada no banco remoto.

---

## 3. Cobertura de Testes Automatizados (`tests/metaIntegration.test.ts`)

Execução local e determinística (sem tocar API/produção Meta nem enviar WhatsApp real):
1. Caso **Rio2 (`243135681723027`)**: `179` visitas ao perfil preservadas entre campanha/conjunto/4 anúncios, `12` conversas entre 2 conjuntos (nunca `191` nem `48`), `0,72%` inline link CTR vs `2,46%` all CTR, alcance deduplicado da conta (`14.883`) distinto da soma das campanhas (`15.241`).
2. Caso **MOVE (`521887042208137`)**: `R$ 64,08`, `22` conversas, `CPA R$ 2,91`, arredondamento único consistente (`4,77` sem `"Em torno"`), paridade preview ↔ texto exportado.
3. **Paginação & Resiliência**: paginação >100 e >500 registros via `paging.next`; retry/backoff em HTTP `429`/`503` com preservação contra purga em falha parcial.
4. **Enum `UNKNOWN` & Zero-Spend**: preservação de objetos pausados/zerados e proibição de coerção de `UNKNOWN` em `MESSAGES`.
5. **Billing**: minor units, `spend_cap = 0` (`no_cap`) vs permissão negada (`unavailable`).
6. **Social Crosspost**: preservação dual-channel FB + IG sem fallback inventado.
7. **Paridade Frontend/Edge Core**: igualdade comportamental entre `src/lib/metaIntegrationCore.ts` e `supabase/functions/_shared/metaCore.ts`.
8. **Timezones**: execução validada sob `TZ=UTC` e `TZ=America/Sao_Paulo`.
