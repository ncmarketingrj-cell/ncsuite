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
  const maxTarget = ctx?.governance_and_benchmarks?.account_max_cpl_target ?? null;
  const homogeneousRef =
    compAvg !== null
      ? `Benchmark homogêneo na mesma unidade (${ind.cost_label || "custo por resultado"}): **${fmtBRL(Number(compAvg))}**.`
      : maxTarget !== null
      ? `Meta operacional configurada na conta (mesma unidade): **${fmtBRL(Number(maxTarget))}**.`
      : "Não há benchmark homogêneo disponível para comparação.";

  const indicatorsLines =
    cat === "REACH"
      ? [
          `- **Indicador primário (fórmula explícita):** **${ind.cost_label || "Custo por 1.000 pessoas alcançadas"}** = **${costFormatted}** (\`(spend / reach) × 1.000\`).`,
          `- **Indicadores de entrega e cobertura:** **${fmtNum(m.reach)} pessoas alcançadas**, **${fmtNum(m.impressions)} impressões**, **CPM** **${fmtBRL(m.cpm)}** e **frequência** **${Number(m.frequency || 0).toFixed(2).replace(".", ",")}x**.`,
          `- **Indicadores secundários (cliques distintos):** **CTR (link)** **${fmtPct(m.ctr_link)}** (**${fmtNum(m.link_clicks)} cliques no link**) vs. **${fmtNum(m.all_clicks)} cliques totais** (\`CTR todos: ${fmtPct(m.ctr_all)}\`). Em Alcance, CTR de link é sinal estritamente secundário.`,
          `- **Benchmark comparativo:** ${homogeneousRef}`,
        ]
      : [
          `- **Indicador primário (fórmula explícita):** **${ind.cost_label || "Custo por resultado"}** = **${costFormatted}** (\`${ind.unit || "BRL/resultado"}\`).`,
          `- **Indicadores secundários:** **CTR (link)** **${fmtPct(m.ctr_link)}** (**${fmtNum(m.link_clicks)} cliques no link** · \`CPC link: ${Number(m.link_clicks || 0) > 0 ? fmtBRL(m.cpc_link) : "—"}\`) vs. **${fmtNum(m.all_clicks)} cliques totais**, **CPM** **${fmtBRL(m.cpm)}**, **frequência** **${Number(m.frequency || 0).toFixed(2).replace(".", ",")}x**.`,
          `- **Benchmark comparativo:** ${homogeneousRef}`,
        ];

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
      : `- **Base de conhecimento RAG:** Nenhum documento específico aplicável para este diagnóstico isolado; aplicado contrato canônico \`${VICTORIA_CONTRACT_VERSION}\`.`;

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
    `- **Período:** ${periodText} | **Versão do contrato:** \`${VICTORIA_CONTRACT_VERSION}\` | **Prompt:** \`${VICTORIA_PROMPT_VERSION}\` | **Hash:** \`${ctx?.analysis_context_hash || ""}\``,
    "",
    `#### 2. Objetivo e evento oficial`,
    `- **O que esta campanha foi configurada para otimizar?** ${ind.label_plural || "resultados"} (evento \`${ind.code || "unknown"}\`, unidade oficial **${ind.cost_label || "Custo por resultado"}**).`,
    "",
    `#### 3. Leitura factual`,
    `- **[FATO OBSERVADO]** Investimento: **${fmtBRL(f.spend)}** | Resultado oficial (**${ind.label_plural || "resultados"}**): **${fmtNum(m.result_value)}** | **${ind.cost_label || "Custo por resultado"}**: **${costFormatted}**`,
    `- **[FATO OBSERVADO]** Impressões: **${fmtNum(m.impressions)}** | Alcance: **${fmtNum(m.reach)}** | Frequência: **${Number(m.frequency || 0).toFixed(2).replace(".", ",")}x** | CPM: **${fmtBRL(m.cpm)}**`,
    `- **[FATO OBSERVADO]** Cliques no link: **${fmtNum(m.link_clicks)}** (\`CTR link: ${fmtPct(m.ctr_link)}\`) | Cliques totais: **${fmtNum(m.all_clicks)}** (\`CTR todos: ${fmtPct(m.ctr_all)}\`)`,
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
    cat === "REACH"
      ? `- **[HIPÓTESE 1]** Custo por 1.000 pessoas alcançadas de **${costFormatted}** e CPM de **${fmtBRL(m.cpm)}** com frequência **${Number(m.frequency || 0).toFixed(2).replace(".", ",")}x** refletem cobertura ampla de leilão sem saturação na janela observada.`
      : `- **[HIPÓTESE 1]** Relação entre **${fmtNum(m.link_clicks)}** cliques no link e **${fmtNum(m.result_value)}** ${ind.label_plural || "resultados"} depende da aderência pós-clique e latência de janela curta (**${daysCount} dia(s)**).`,
    "",
    `#### 7. Recomendações seguras`,
    `- **[RECOMENDAÇÃO 1 — Somente Leitura / Reversível]** Manter orçamento e configuração atuais sem mutações automáticas durante janela curta (< 3 dias) e acompanhar evolução na mesma unidade (**${ind.cost_label || "custo por resultado"}**).`,
    "",
    `#### 8. Plano de validação`,
    `- Acumular no mínimo **3 a 7 dias** na mesma campanha e unidade (**${ind.cost_label || "custo por resultado"}**) antes de propor ajuste reversível de orçamento ou pausa.`,
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
  return { text: sanitized, replacedByDeterministic: false, reasons: [] };
}
