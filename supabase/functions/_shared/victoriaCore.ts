export const VICTORIA_CONTRACT_VERSION = "2026.11.4";
export const VICTORIA_PROMPT_VERSION = "2026.11.4-senior-10part";
export const VICTORIA_DEFAULT_OPERATIONAL_MODE = "READ_ONLY_ANALYSIS" as const;

export const MANDATORY_10_SECTION_TITLES = [
  "Escopo analisado",
  "Objetivo e evento oficial",
  "Leitura factual",
  "Indicadores primários e secundários",
  "Limitações e dados ausentes",
  "Hipóteses",
  "Recomendações seguras",
  "Plano de validação",
  "Nível de confiança",
  "Fontes e documentos utilizados",
] as const;

export interface ServerRagCitation {
  id: string;
  title: string;
  version: string;
  evidence_level: string;
  approval_status: string;
  source?: string;
}

export function hasAllMandatory10SectionsServer(text: string): boolean {
  const lower = String(text || "").toLowerCase();
  return MANDATORY_10_SECTION_TITLES.every((s) => lower.includes(s.toLowerCase()));
}

export function sanitizeVictoriaServerOutput(
  rawText: string,
  analysisContext?: any,
  operationalMode: string = VICTORIA_DEFAULT_OPERATIONAL_MODE
): string {
  let cleaned = String(rawText || "");
  if (!cleaned) return "";

  const daysCount = Number(
    analysisContext?.period?.days_count ?? analysisContext?.period?.days ?? 1
  );

  // Em READ_ONLY_ANALYSIS ou janela < 3 dias, remover terminantemente blocos json:action
  if (operationalMode !== "ACTION_PROPOSAL" || daysCount < 3) {
    cleaned = cleaned.replace(/```json:action[\s\S]*?```/gi, "").trim();
  }

  // Remover apelidos proibidos e linguagem teatral/ofensiva
  cleaned = cleaned
    .replace(/\bComandante\b/gi, "Parceiro")
    .replace(/falhando\s+miseravelmente/gi, "apresentando desempenho abaixo do esperado")
    .replace(/\bp[íi]fi[oa]s?\b/gi, "abaixo da referência")
    .replace(/\binaceit[áa]vel\b/gi, "acima do limite operacional")
    .replace(/desastre\s+total/gi, "ponto de atenção operacional");

  // Remover alegações sem fonte auditável
  cleaned = cleaned
    .replace(/54%\s+mais\s+(conversas|cliques|leads)[^.\n]*/gi, "maior aderência visual em testes criativos (hipótese sujeita a validação)")
    .replace(/reduz\s+o\s+CPL\s+efetivo\s+pela\s+metade/gi, "contribui para preservar a intenção de contato")
    .replace(/80%\s*(de\s*)?(convers[aã]o|dos?\s+leads?\s+[eé]\s+perdido)/gi, "queda acentuada de aproveitamento comercial")
    .replace(/financiamento\s+sem\s+consulta\s+(ao\s+)?(spc|serasa)/gi, "análise de financiamento sujeita a aprovação de crédito");

  const activeCat = String(
    analysisContext?.optimization?.category ||
      analysisContext?.result_indicator?.category ||
      ""
  );
  const activeCostLabel = String(
    analysisContext?.result_indicator?.cost_label || "custo por resultado"
  );

  if (activeCat === "REACH") {
    cleaned = cleaned
      .replace(/\bCPL\s+Atual\b/gi, "Custo por 1.000 pessoas alcançadas")
      .replace(/\bCPL\s+de\s+R\$/gi, "Custo por 1.000 pessoas alcançadas de R$")
      .replace(/\bCPL\s*:\s*R\$/gi, "Custo por 1.000 pessoas alcançadas: R$")
      .replace(/\bCPL\s+R\$/gi, "Custo por 1.000 pessoas alcançadas R$")
      .replace(/\bcusto\s+por\s+lead\s*\(\s*CPL\s*\)/gi, "custo por 1.000 pessoas alcançadas")
      .replace(/\bcusto\s+por\s+lead\b/gi, "custo por 1.000 pessoas alcançadas")
      .replace(/\bbaixar\s+o\s+CPL\b/gi, "otimizar o custo por 1.000 pessoas alcançadas")
      .replace(/\bCPL\b/g, "custo por 1.000 pessoas alcançadas");

    cleaned = cleaned.replace(
      /[^.\n]*R\$\s*7[.,]93[^.\n]*\.?/gi,
      " (Nota de governança: Não há benchmark homogêneo disponível para comparação; métricas de alcance e CPM não são comparadas com o custo por conversa de campanhas de mensagens.)"
    );
  } else if (
    activeCat === "INSTAGRAM_PROFILE" ||
    activeCat === "LANDING_PAGE_VIEWS" ||
    activeCat === "LINK_CLICKS" ||
    activeCat === "VIDEO_VIEWS" ||
    activeCat === "ENGAGEMENT"
  ) {
    cleaned = cleaned
      .replace(/\bCPL\s+Atual\b/gi, activeCostLabel)
      .replace(/\bCPL\s+de\s+R\$/gi, `${activeCostLabel} de R$`)
      .replace(/\bCPL\s*:\s*R\$/gi, `${activeCostLabel}: R$`)
      .replace(/\bCPL\s+R\$/gi, `${activeCostLabel} R$`)
      .replace(/\bcusto\s+por\s+lead\b/gi, activeCostLabel)
      .replace(/\bCPL\b/g, activeCostLabel);
  }

  return cleaned.trim();
}

export function detectCrossEntityLeakageServer(
  text: string,
  analysisContext?: any
): { leaked: boolean; matches: string[] } {
  const blocklist = analysisContext?.isolated_sibling_blocklist;
  if (!text || !blocklist) return { leaked: false, matches: [] };
  const lower = String(text).toLowerCase();
  const matches: string[] = [];

  const ownTokens = new Set<string>();
  const m = analysisContext?.raw_metrics || {};
  const f = analysisContext?.financial || {};
  const fmtBrl = (v?: number | null) =>
    typeof v === "number" && Number.isFinite(v)
      ? `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : "";
  [f.spend, m.cost_per_result, m.cpm].forEach((n) => {
    const t = fmtBrl(n);
    if (t) ownTokens.add(t.toLowerCase());
  });
  [m.reach, m.impressions, m.result_value].forEach((n) => {
    if (typeof n === "number" && n > 0) ownTokens.add(Math.round(n).toLocaleString("pt-BR").toLowerCase());
  });

  for (const name of blocklist.names || []) {
    if (name && lower.includes(String(name).toLowerCase())) matches.push(name);
  }
  for (const tok of blocklist.distinctive_tokens || []) {
    const lt = String(tok || "").toLowerCase();
    if (!lt || ownTokens.has(lt)) continue;
    if (lower.includes(lt)) matches.push(tok);
  }
  return { leaked: matches.length > 0, matches };
}

export function generateDeterministic10SectionAnalysis(
  ctx: any,
  ragCitations: ServerRagCitation[] = []
): string {
  const fmtBRL = (n: number) =>
    `R$ ${Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtNum = (n: number) => Number(n || 0).toLocaleString("pt-BR");
  const fmtPct = (n: number) =>
    `${Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

  const m = ctx?.raw_metrics || {};
  const f = ctx?.financial || {};
  const p = ctx?.period || {};
  const opt = ctx?.optimization || {};
  const ind = ctx?.result_indicator || {};
  const cat = String(opt.category || "UNKNOWN");
  const daysCount = Number(p.days_count ?? p.days ?? 1);
  const isShortSample = daysCount < 3;
  const dateFrom = p.date_from || p.start_date || "";
  const dateTo = p.date_to || p.end_date || dateFrom;
  const periodText =
    dateFrom === dateTo
      ? `${dateFrom} (1 dia — intervalo inclusivo)`
      : `${dateFrom} a ${dateTo} (${daysCount} dias — intervalo inclusivo)`;

  const costPerResult = m.cost_per_result ?? null;
  const costFormatted =
    costPerResult !== null && Number.isFinite(Number(costPerResult))
      ? fmtBRL(Number(costPerResult))
      : m.cost_per_result_formatted || "—";

  const compAvg = ctx?.governance_and_benchmarks?.comparable_same_objective_avg ?? null;
  const peerCount = ctx?.governance_and_benchmarks?.comparable_peer_count;
  const compCriteria = ctx?.governance_and_benchmarks?.comparable_benchmark_criteria;
  const maxTarget = ctx?.governance_and_benchmarks?.account_max_cpl_target ?? null;

  const benchParts: string[] = [];
  if (compAvg !== null) {
    benchParts.push(
      `Benchmark homogêneo na mesma unidade (${ind.cost_label || "custo por resultado"}${
        typeof peerCount === "number" && peerCount > 0 ? ` · ${peerCount} outra(s) entidade(s) comparável(is)` : ""
      }): **${fmtBRL(Number(compAvg))}**${compCriteria ? ` (${compCriteria})` : ""}.`
    );
  } else {
    benchParts.push(
      `Benchmark homogêneo indisponível: não existem outras campanhas comparáveis suficientes no período${
        compCriteria ? ` (${compCriteria})` : ""
      }.`
    );
  }
  if (maxTarget !== null) {
    benchParts.push(`Meta operacional configurada na conta (mesma unidade): **${fmtBRL(Number(maxTarget))}**.`);
  }
  const homogeneousRef = benchParts.join(" ");

  const linkClicks = Number(m.link_clicks || 0);
  const allClicks = Number(m.all_clicks || 0);
  const cpcLinkStr = linkClicks > 0 ? fmtBRL(Number(m.cpc_link || 0)) : "—";
  const cpcAllStr = allClicks > 0 ? fmtBRL(Number(m.cpc_all || (Number(f.spend || 0) / allClicks))) : "Não disponível";
  const clicksParityLine = `**CTR Link:** ${fmtPct(m.ctr_link)} (**${fmtNum(linkClicks)} cliques no link** · **CPC Link:** ${cpcLinkStr}) vs. **CTR Todos:** ${fmtPct(m.ctr_all)} (**${fmtNum(allClicks)} cliques totais** · **CPC Todos:** ${cpcAllStr})`;
  const freqStr = Number(m.frequency || 0).toFixed(2).replace(".", ",");
  const resultVal = Number(m.result_value || 0);
  const spendVal = Number(f.spend || 0);
  const spendZeroConv = spendVal > 0 && resultVal === 0;
  const clickConvRatio = linkClicks > 0 ? (resultVal / linkClicks) * 100 : 0;

  const indicatorsLines =
    cat === "REACH"
      ? [
          `- **Indicador primário (fórmula explícita):** **${ind.cost_label || "Custo por 1.000 pessoas alcançadas"}** = **${costFormatted}** (\`(spend / reach) × 1.000\`).`,
          `- **Indicadores de entrega e cobertura:** **${fmtNum(m.reach)} pessoas alcançadas**, **${fmtNum(m.impressions)} impressões**, **CPM** **${fmtBRL(m.cpm)}** e **frequência** **${freqStr}x**.`,
          `- **Indicadores secundários (cliques distintos):** ${clicksParityLine}. Em Alcance, CTR de link é sinal estritamente secundário.`,
          `- **Benchmark comparativo:** ${homogeneousRef}`,
        ]
      : [
          `- **Indicador primário (fórmula explícita):** **${ind.cost_label || "Custo por resultado"}** = **${costFormatted}** (\`${ind.unit || "BRL/resultado"}\`).`,
          `- **Indicadores secundários:** ${clicksParityLine}, **CPM** **${fmtBRL(m.cpm)}**, **frequência** **${freqStr}x**.`,
          `- **Benchmark comparativo:** ${homogeneousRef}`,
        ];

  let hypothesesSection = "";
  let recommendationsSection = "";
  let validationSection = "";

  if (cat === "REACH") {
    hypothesesSection = [
      `- **[HIPÓTESE 1 — Cobertura ampla e pressão de frequência]** **${costFormatted}** por 1.000 pessoas alcançadas com **CPM ${fmtBRL(m.cpm)}** e frequência **${freqStr}x** reflete distribuição ampla de leilão para \`${opt.optimization_goal || "REACH"}\`.`,
      `- **[HIPÓTESE 2 — Separação entre atenção social e clique direcional]** **CTR Todos ${fmtPct(m.ctr_all)}** (\`CPC Todos: ${cpcAllStr}\`) vs **CTR Link ${fmtPct(m.ctr_link)}** (\`CPC Link: ${cpcLinkStr}\`) é esperado em entrega de Alcance e não deve ser julgado por CPL.`,
    ].join("\n");
    recommendationsSection = [
      `- **[RECOMENDAÇÃO 1 — Controle de Frequência e Cobertura (Somente Leitura / Reversível)]** ${isShortSample ? "Manter orçamento/configuração intactos na janela curta (< 3 dias)." : "Acompanhar teto de frequência (<= 2,5x–3,0x) antes de expandir praça ou renovar peça."}`,
    ].join("\n");
    validationSection = `- Consolidar **3 a 7 dias** monitorando **Custo por 1.000 pessoas alcançadas**, **CPM** e **frequência** na mesma unidade oficial.`;
  } else if (cat === "INSTAGRAM_PROFILE") {
    hypothesesSection = [
      `- **[HIPÓTESE 1 — Fluxo para o perfil do Instagram]** **${fmtNum(resultVal)} visitas ao perfil** (${costFormatted}) com **CTR Todos ${fmtPct(m.ctr_all)}** (\`CPC Todos: ${cpcAllStr}\`) vs **CTR Link ${fmtPct(m.ctr_link)}** (\`CPC Link: ${cpcLinkStr}\`) aponta para cliques/toques diretos no perfil dentro da rede.`,
      `- **[HIPÓTESE 2 — Conversão orgânica dependente da bio/Direct]** Sem telemetria de novos seguidores ou DMs originadas na bio, não é possível inferir vendas finais apenas pelo anúncio.`,
    ].join("\n");
    recommendationsSection = [
      `- **[RECOMENDAÇÃO 1 — Auditoria de Bio/Destaques sem Julgar por CPL (Somente Leitura)]** ${isShortSample ? "Preservar estrutura por 72h e alinhar CTA da bio/Direct com o anúncio." : "Cruzar ganho de seguidores e mensagens recebidas no Instagram antes de ajustar verba."}`,
    ].join("\n");
    validationSection = `- Validar em **3 a 7 dias** **Custo por visita ao perfil**, **CPC Todos/Link** e geração orgânica de DMs/seguidores no perfil.`;
  } else if (cat === "LANDING_PAGE_VIEWS" || cat === "LINK_CLICKS") {
    hypothesesSection = [
      `- **[HIPÓTESE 1 — Desempenho de clique e carregamento pós-clique]** **${fmtNum(linkClicks)} cliques no link** (\`CPC Link: ${cpcLinkStr}\`) versus **${fmtNum(resultVal)} ${ind.label_plural || "resultados"}** e **${fmtNum(allClicks)} cliques totais** (\`CPC Todos: ${cpcAllStr}\`) indica atrito ou retenção entre o clique e a página.`,
      `- **[HIPÓTESE 2 — Tráfego de saída em janela curta (${daysCount}d)]** Sem métricas de PageSpeed/analytics, a qualidade da sessão permanece lacuna observacional.`,
    ].join("\n");
    recommendationsSection = [
      `- **[RECOMENDAÇÃO 1 — Auditoria de Velocidade/Pixel da URL (Somente Leitura)]** Validar carregamento mobile < 3s e disparo de \`PageView\` antes de escalar verba de tráfego.`,
    ].join("\n");
    validationSection = `- Acompanhar **3 a 7 dias** comparando **CPC Link**, razão \`${ind.code || "lpv"} / link_clicks\` e conversões no site.`;
  } else {
    hypothesesSection = [
      `- **[HIPÓTESE 1 — Conversão pós-clique / WhatsApp]** ${
        spendZeroConv
          ? `Investimento de **${fmtBRL(spendVal)}** sem resultado oficial (${ind.label_plural || "resultados"}) apesar de **${fmtNum(linkClicks)} cliques no link** (\`CPC Link: ${cpcLinkStr}\`) sugere fricção pós-clique ou janela de atribuição insuficiente.`
          : `Relação de **${fmtNum(resultVal)} ${ind.label_plural || "resultados"}** sobre **${fmtNum(linkClicks)} cliques no link** (**${clickConvRatio.toFixed(1).replace(".", ",")}%**) reflete o filtro entre interesse inicial (\`CPC Link: ${cpcLinkStr}\` vs \`CPC Todos: ${cpcAllStr}\`) e execução de \`${ind.code || "evento"}\`.`
      }`,
      `- **[HIPÓTESE 2 — Amostra curta (${daysCount} dia(s))]** Oscilações diárias de leilão impedem decisões definitivas em janela curta.`,
    ].join("\n");
    recommendationsSection = [
      `- **[RECOMENDAÇÃO 1 — Preservação de Aprendizado e SLA Comercial (Somente Leitura)]** ${isShortSample ? "Manter orçamento e status inalterados por 72h; auditar velocidade de resposta no WhatsApp/CRM (< 5 min)." : "Validar conversão comercial no CRM antes de propor ajuste reversível (<= ±20%) em ACTION_PROPOSAL."}`,
    ].join("\n");
    validationSection = `- Acumular **3 a 7 dias** na mesma campanha e unidade (**${ind.cost_label || "custo por resultado"}**), validando funil **CPC Link → ${ind.label_plural || "resultado"}**.`;
  }

  const ragDocs: ServerRagCitation[] =
    ragCitations.length > 0
      ? ragCitations
      : Array.isArray(ctx?.governance_and_benchmarks?.rag_documents)
      ? ctx.governance_and_benchmarks.rag_documents
      : [];

  const sourcesLine =
    ragDocs.length > 0
      ? `- **Documentos RAG aprovados recuperados (${ragDocs.length}):** ${ragDocs
          .map((d) => `\`[${d.id}]\` **${d.title}** (\`${d.evidence_level}\` · v\`${d.version}\` · status \`${d.approval_status}\`)`)
          .join("; ")}.`
      : `- **Base de conhecimento RAG:** Nenhum documento pertinente foi recuperado na base para este diagnóstico isolado; aplicado contrato canônico \`${VICTORIA_CONTRACT_VERSION}\`.`;

  const confidenceLevel =
    daysCount < 3 || Number(m.impressions || 0) < 500
      ? "BAIXA"
      : String(ctx?.confidence_level || "baixa").toUpperCase();

  return [
    `### 🧭 O que esta campanha foi configurada para otimizar?`,
    `Esta entidade (**${ctx?.entity_name || "Campanha"}** · ID \`${ctx?.entity_id || ""}\`) otimiza oficialmente para **${ind.label_plural || "resultados"}** (\`objective: ${opt.odax_objective || "UNSPECIFIED"}\` · \`optimization_goal: ${opt.optimization_goal || "UNSPECIFIED"}\` · unidade **${ind.cost_label || "Custo por resultado"}**).`,
    "",
    `#### 1. Escopo analisado`,
    `- **Conta:** ${ctx?.ad_account_name || "Conta Meta Ads"} (\`${ctx?.ad_account_id || "all"}\`) | **Entidade:** ${ctx?.entity_name || ""} (\`${ctx?.entity_level || "campaign"}\` · ID \`${ctx?.entity_id || ""}\`)`,
    `- **Período:** ${periodText} | **Frescor do Snapshot:** ${p.last_sync_at ? `${p.last_sync_at} (\`${p.data_freshness || "unknown"}\`)` : `\`${p.data_freshness || "unknown"}\``}`,
    `- **Contrato:** \`${VICTORIA_CONTRACT_VERSION}\` | **Prompt:** \`${VICTORIA_PROMPT_VERSION}\` | **Hash:** \`${ctx?.analysis_context_hash || ""}\``,
    "",
    `#### 2. Objetivo e evento oficial`,
    `- **O que esta campanha foi configurada para otimizar?** ${ind.label_plural || "resultados"} (evento \`${ind.code || "unknown"}\`, unidade oficial **${ind.cost_label || "Custo por resultado"}**).`,
    "",
    `#### 3. Leitura factual`,
    `- **[FATO OBSERVADO]** Investimento: **${fmtBRL(spendVal)}** | Resultado oficial (**${ind.label_plural || "resultados"}**): **${fmtNum(resultVal)}** | **${ind.cost_label || "Custo por resultado"}**: **${costFormatted}**`,
    `- **[FATO OBSERVADO]** Impressões: **${fmtNum(m.impressions)}** | Alcance: **${fmtNum(m.reach)}** | Frequência: **${freqStr}x** | CPM: **${fmtBRL(m.cpm)}**`,
    `- **[FATO OBSERVADO]** Cliques no link: **${fmtNum(linkClicks)}** (\`CTR Link: ${fmtPct(m.ctr_link)}\` · \`CPC Link: ${cpcLinkStr}\`) | Cliques totais: **${fmtNum(allClicks)}** (\`CTR Todos: ${fmtPct(m.ctr_all)}\` · \`CPC Todos: ${cpcAllStr}\`)`,
    "",
    `#### 4. Indicadores primários e secundários`,
    ...indicatorsLines,
    "",
    `#### 5. Limitações e dados ausentes`,
    ...((Array.isArray(ctx?.limitations) && ctx.limitations.length > 0
      ? ctx.limitations
      : [`Amostra de ${daysCount} dia(s); criativo, copy, segmentação completa e retorno CRM não fornecidos.`]
    ).map((l: string) => `- ${l}`)),
    "",
    `#### 6. Hipóteses`,
    hypothesesSection,
    "",
    `#### 7. Recomendações seguras`,
    recommendationsSection,
    "",
    `#### 8. Plano de validação`,
    validationSection,
    "",
    `#### 9. Nível de confiança`,
    `- **${confidenceLevel}** — ${ctx?.confidence_justification || `Janela de ${daysCount} dia(s) com observabilidade parcial.`}`,
    "",
    `#### 10. Fontes e documentos utilizados`,
    `- **Dados oficiais:** \`${ind.source || "meta_insights_snapshot / metrics"}\` · \`${VICTORIA_CONTRACT_VERSION}\``,
    sourcesLine,
  ].join("\n");
}

export function enforceServerPostLlmGuardrails(
  rawText: string,
  analysisContext?: any,
  ragCitations: ServerRagCitation[] = [],
  operationalMode: string = VICTORIA_DEFAULT_OPERATIONAL_MODE,
  requireFull10Sections: boolean = true
): {
  text: string;
  replacedByDeterministic: boolean;
  reasons: string[];
} {
  const sanitized = sanitizeVictoriaServerOutput(rawText, analysisContext, operationalMode);
  if (!analysisContext || !analysisContext.entity_id) {
    return { text: sanitized, replacedByDeterministic: false, reasons: [] };
  }

  const reasons: string[] = [];
  const leak = detectCrossEntityLeakageServer(sanitized, analysisContext);
  if (leak.leaked) reasons.push(`cross_entity_leak:${leak.matches.join(",")}`);
  if (sanitized.length < (requireFull10Sections ? 120 : 20) || /^\[ERRO\s+\d+\]/i.test(sanitized)) {
    reasons.push("empty_or_provider_error");
  }
  const isScopedEntity = ["campaign", "adset", "ad"].includes(String(analysisContext.entity_level || ""));
  if (isScopedEntity && requireFull10Sections) {
    if (!sanitized.includes("O que esta campanha foi configurada para otimizar?")) {
      reasons.push("missing_opening_question");
    }
    if (!hasAllMandatory10SectionsServer(sanitized)) {
      reasons.push("missing_mandatory_10_sections");
    }
  }

  if (reasons.length > 0) {
    return {
      text: generateDeterministic10SectionAnalysis(analysisContext, ragCitations),
      replacedByDeterministic: true,
      reasons,
    };
  }

  let finalOut = sanitized;
  if (ragCitations.length > 0) {
    const missingAnyDoc = ragCitations.some(
      (d) => !finalOut.includes(d.id) && !finalOut.toLowerCase().includes(String(d.title || "").toLowerCase().slice(0, 28))
    );
    const falselyStatesNone = /nenhum\s+documento\s+(espec[íi]fico|pertinente|recuperado|utilizado)/i.test(finalOut);
    if (missingAnyDoc || falselyStatesNone) {
      const cleanBody = finalOut
        .replace(/-?\s*\*?\*?Base de conhecimento RAG:\*?\*?[^\n]*nenhum documento[^\n]*/gi, "")
        .trim();
      const citationBullets = ragCitations
        .map(
          (d) =>
            `- \`[${d.id}]\` **${d.title}** (\`${d.evidence_level}\` · v\`${d.version}\` · status \`${d.approval_status}\`)`
        )
        .join("\n");
      finalOut = `${cleanBody}\n\n- **Fontes RAG curadas aplicadas (${ragCitations.length}):**\n${citationBullets}`;
    }
  }

  return { text: finalOut, replacedByDeterministic: false, reasons: [] };
}
