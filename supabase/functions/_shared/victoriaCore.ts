export const VICTORIA_CONTRACT_VERSION = "2026.11.4";
export const VICTORIA_PROMPT_VERSION = "2026.11.4-senior-10part";
export const VICTORIA_DEFAULT_OPERATIONAL_MODE = "READ_ONLY_ANALYSIS" as const;
export const DEFAULT_SYNC_STALE_THRESHOLD_MINUTES = 30;
export const SYNC_DISPLAY_TIMEZONE = "America/Sao_Paulo";

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

const SERVER_DETAILED_AUDIT_PATTERN =
  /\b(auditoria\s+completa|an[aá]lise\s+(aprofundada|detalhada|completa)|relat[oó]rio\s+(detalhado|completo)|10\s+se[çc][õo]es|todas\s+as\s+se[çc][õo]es)\b/i;

export function resolveServerRequireFull10Sections(
  explicitFlag?: unknown,
  userPrompt?: string | null
): boolean {
  if (explicitFlag === true) return true;
  if (explicitFlag === false) return false;
  if (userPrompt && SERVER_DETAILED_AUDIT_PATTERN.test(userPrompt)) return true;
  return false;
}

export function extractServerUserTarget(
  prompt?: string | null
): { amount: number; rawText: string } | null {
  const txt = String(prompt || "").trim();
  if (!txt) return null;
  const patterns = [
    /(?:abaixo\s+de|menos\s+de|at[eé]|m[aá]ximo\s+de|meta\s+(?:de|em)|alvo\s+(?:de|em)|custo\s+(?:de|por\s+\w+\s+(?:de|abaixo\s+de|em))|conversas?\s+(?:a|por|abaixo\s+de))\s*(?:r\$\s*)?(\d+(?:[.,]\d{1,2})?)/i,
    /r\$\s*(\d+(?:[.,]\d{1,2})?)\s*(?:ou\s+menos|de\s+meta|por\s+(?:conversa|lead|compra|clique|visita|resultado))?/i,
  ];
  for (const rx of patterns) {
    const m = txt.match(rx);
    if (m?.[1]) {
      const parsed = Number(m[1].replace(",", "."));
      if (Number.isFinite(parsed) && parsed > 0 && parsed < 100_000) {
        return { amount: parsed, rawText: m[0].trim() };
      }
    }
  }
  return null;
}

export function stripTechnicalArtifactsServerQuick(text: string): string {
  return String(text || "")
    .replace(/\n*-?\s*\*?\*?Fontes\s+(?:RAG|e\s+documentos)[^:\n]*:[\s\S]*$/gim, "")
    .replace(/^-\s+`?\[?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\]?`?.*$/gim, "")
    .replace(/^-\s+.*?(?:OFFICIAL_DOC|INTERNAL_RULE|EMPIRICAL_AUDIT|PARECER\s+T[ÉE]CNICO|APPROVED|UNVERIFIED|REJECTED).*$/gim, "")
    .replace(/\s*\(?\s*ID\s*:?\s*`?[a-zA-Z0-9_.-]{6,}`?\s*\)?/gi, "")
    .replace(/\[[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\]/gi, "")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "")
    .replace(/\bctx_[a-zA-Z0-9_]+\b/gi, "")
    .replace(/\bvreq_[a-zA-Z0-9_]+\b/gi, "")
    .replace(/\bact_\d+\b/gi, "")
    .replace(/(?:onsite_conversion|offsite_conversion)\.[a-z0-9_]+/gi, "evento oficial da campanha")
    .replace(/\bactions:[a-z0-9_.]+\b/gi, "evento oficial")
    .replace(/Contrato(?:\s+Can[ôo]nico)?\s*:?\s*`?\d{4}\.\d+(?:\.\d+)?`?/gi, "")
    .replace(/Prompt\s*:?\s*`?2026\.[a-zA-Z0-9_.-]+`?/gi, "")
    .replace(/Hash\s*:?\s*`?[a-f0-9]{6,}`?/gi, "")
    .replace(/\b2026\.11\.\d+(?:-[a-z0-9-]+)?\b/gi, "")
    .replace(/\b(?:OFFICIAL_DOC|INTERNAL_RULE|EMPIRICAL_AUDIT|UNVERIFIED|APPROVED|REJECTED)\b/gi, "")
    .replace(/\b(meta_insights_snapshot|asset_metrics|victoria_knowledge|victoria_messages)\b/gi, "dados do Meta Ads")
    .replace(/``+/g, "")
    .replace(/\(\s*[·|•\s]*\)/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const SERVER_QUICK_SECTION_PATTERNS: Array<{ name: string; regex: RegExp }> = [
  { name: "veredito", regex: /(?:^|\n)\s*(?:#{1,4}\s*)?(?:\*\*)?(?:1[.)]\s*)?(?:\*\*)?Veredito(?:\*\*)?\s*:?/i },
  { name: "resultado_principal", regex: /(?:^|\n)\s*(?:#{1,4}\s*)?(?:\*\*)?(?:2[.)]\s*)?(?:\*\*)?Resultado\s+principal(?:\*\*)?\s*:?/i },
  { name: "leitura_do_funil", regex: /(?:^|\n)\s*(?:#{1,4}\s*)?(?:\*\*)?(?:3[.)]\s*)?(?:\*\*)?Leitura\s+do\s+funil(?:\*\*)?\s*:?/i },
  { name: "o_que_fazer_agora", regex: /(?:^|\n)\s*(?:#{1,4}\s*)?(?:\*\*)?(?:4[.)]\s*)?(?:\*\*)?O\s+que\s+fazer\s+agora(?:\*\*)?\s*:?/i },
  { name: "como_validar", regex: /(?:^|\n)\s*(?:#{1,4}\s*)?(?:\*\*)?(?:5[.)]\s*)?(?:\*\*)?Como\s+validar(?:\*\*)?\s*:?/i },
];

export function validateQuickExecutiveStructureServer(
  text: string,
  analysisContext?: any
): { valid: boolean; reasons: string[] } {
  const clean = String(text || "").trim();
  const reasons: string[] = [];
  if (clean.length < 120) {
    reasons.push("incomplete_quick_length");
    return { valid: false, reasons };
  }
  const positions: Array<{ name: string; start: number; end: number }> = [];
  let cursor = 0;
  for (const sec of SERVER_QUICK_SECTION_PATTERNS) {
    const slice = clean.slice(cursor);
    const m = slice.match(sec.regex);
    if (!m || m.index === undefined) {
      reasons.push(`missing_quick_section_${sec.name}`);
      continue;
    }
    const start = cursor + m.index;
    const end = start + m[0].length;
    positions.push({ name: sec.name, start, end });
    cursor = end;
  }
  if (reasons.length === 0 && positions.length === 5) {
    for (let i = 0; i < positions.length; i++) {
      const nextStart = i + 1 < positions.length ? positions[i + 1].start : clean.length;
      if (clean.slice(positions[i].end, nextStart).trim().length < 12) {
        reasons.push(`empty_quick_section_${positions[i].name}`);
      }
    }
  }
  if (/[,;:\-(]\s*$|R\$\s*$/i.test(clean)) {
    reasons.push("truncated_mid_sentence");
  }
  const entId = String(analysisContext?.entity_id || "");
  if (
    /\b(?:OFFICIAL_DOC|INTERNAL_RULE|EMPIRICAL_AUDIT|UNVERIFIED|APPROVED|REJECTED)\b/i.test(clean) ||
    /PARECER\s+T[ÉE]CNICO\s+META\s+ADS/i.test(clean) ||
    /Fontes\s+RAG\s+curadas/i.test(clean) ||
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(clean) ||
    /(?:onsite_conversion|offsite_conversion)\./i.test(clean) ||
    /\b(?:ctx_|vreq_)[a-z0-9_]+\b/i.test(clean) ||
    /\bact_\d+\b/i.test(clean) ||
    (entId.length >= 8 && clean.includes(entId))
  ) {
    reasons.push("technical_or_rag_leak_in_quick_mode");
  }
  return { valid: reasons.length === 0, reasons };
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
      ? `- **Documentos RAG curados aplicados (${ragDocs.length}):** ${ragDocs
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
    `- **Período:** ${periodText} | **Frescor do Snapshot:** ${formatVictoriaFreshnessLabelServer(p)}`,
    `- **Contrato:** \`${VICTORIA_CONTRACT_VERSION}\` | **Prompt:** \`${VICTORIA_PROMPT_VERSION}\` | **Hash:** \`${ctx?.analysis_context_hash || ""}\``,
    "",
    `#### 2. Objetivo e evento oficial`,
    `- **O que esta campanha foi configurada para otimizar?** ${ind.label_plural || "resultados"} (evento \`${ind.code || "unknown"}\`, unidade oficial **${ind.cost_label || "Custo por resultado"}**).`,
    "",
    `#### 3. Leitura factual`,
    `- **[FATO OBSERVADO]** Investimento: **${fmtBRL(spendVal)}** | Resultado oficial (**${ind.label_plural || "resultados"}**): **${fmtNum(resultVal)}** | **${ind.cost_label || "Custo por resultado"}**: **${costFormatted}**${m.purchase_value && Number(m.purchase_value) > 0 ? ` | Receita (Compras): **${fmtBRL(Number(m.purchase_value))}**${m.roas && Number(m.roas) > 0 ? ` (**ROAS:** **${Number(m.roas).toFixed(2).replace(".", ",")}x**)` : ""}` : ""}`,
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

export function formatVictoriaFreshnessLabelServer(period: any): string {
  const rawTs = period?.last_sync_at;
  if (!rawTs) return "Horário indisponível (`unknown`)";
  let norm = String(rawTs).trim();
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(norm)) norm = norm.replace(" ", "T");
  if (/([+-]\d{2})$/.test(norm)) norm = `${norm}:00`;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(norm)) norm = `${norm}Z`;
  const ms = Date.parse(norm);
  if (!Number.isFinite(ms)) return `${rawTs} (\`${period?.data_freshness || "unknown"}\`)`;
  const ageMin = Math.max(0, Math.round((Date.now() - ms) / 60000));
  const isStale = ageMin > DEFAULT_SYNC_STALE_THRESHOLD_MINUTES;
  const brt = new Intl.DateTimeFormat("pt-BR", {
    timeZone: SYNC_DISPLAY_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(ms));
  return isStale
    ? `Dados defasados há ${ageMin} min (${brt} BRT · \`stale\`)`
    : `Atualizado há ${ageMin} min (${brt} BRT · \`fresh\`)`;
}

export function selectUsedRagCitations(
  text: string,
  candidates: ServerRagCitation[] = []
): ServerRagCitation[] {
  if (!text || !Array.isArray(candidates) || candidates.length === 0) return [];
  const lower = String(text).toLowerCase();
  const matched: ServerRagCitation[] = [];
  const seen = new Set<string>();
  for (const doc of candidates) {
    const id = String(doc?.id || "");
    if (!id || seen.has(id)) continue;
    const titlePrefix = String(doc?.title || "")
      .toLowerCase()
      .replace(/[^a-zà-ú0-9\s]/gi, " ")
      .trim()
      .slice(0, 26)
      .trim();
    const idMatched = lower.includes(id.toLowerCase());
    const titleMatched = titlePrefix.length >= 10 && lower.includes(titlePrefix);
    if (idMatched || titleMatched) {
      seen.add(id);
      matched.push(doc);
    }
  }
  return matched;
}

export function generateQuickExecutiveAnalysisServer(
  ctx: any,
  userPrompt?: string | null
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
  const cat = String(opt.category || ind.category || "UNKNOWN");
  const daysCount = Number(p.days_count ?? p.days ?? 1);

  const parsedTarget = extractServerUserTarget(userPrompt);
  const explicitTarget =
    ctx?.user_target?.amount !== undefined && ctx?.user_target?.amount !== null
      ? Number(ctx.user_target.amount)
      : parsedTarget?.amount ?? null;
  const configTarget =
    ctx?.governance_and_benchmarks?.account_max_cpl_target !== null &&
    ctx?.governance_and_benchmarks?.account_max_cpl_target !== undefined &&
    Number(ctx.governance_and_benchmarks.account_max_cpl_target) > 0
      ? Number(ctx.governance_and_benchmarks.account_max_cpl_target)
      : null;
  const targetAmount = explicitTarget ?? configTarget;
  const targetSource =
    explicitTarget !== null ? "sua meta" : configTarget !== null ? "meta configurada na conta" : null;

  const compAvgRaw = ctx?.governance_and_benchmarks?.comparable_same_objective_avg;
  const compAvg =
    compAvgRaw !== null && compAvgRaw !== undefined && Number(compAvgRaw) > 0
      ? Number(compAvgRaw)
      : null;
  const spendVal = Number(f.spend || 0);
  const resultVal = Number(m.result_value || 0);
  const impressions = Number(m.impressions || 0);
  const reach = Number(m.reach || 0);
  const linkClicks = Number(m.link_clicks || 0);
  const allClicks = Number(m.all_clicks || linkClicks);
  const freq = Number(m.frequency || (reach > 0 ? impressions / reach : 0));
  const cpcLink = Number(m.cpc_link || (linkClicks > 0 ? spendVal / linkClicks : 0));
  const cost = m.cost_per_result !== null && m.cost_per_result !== undefined ? Number(m.cost_per_result) : null;
  const hasResults = resultVal > 0 && cost !== null;
  const costLabel = String(ind.cost_label || "Custo por resultado");
  const labelPlural = String(ind.label_plural || "resultados");
  const labelSingular = String(ind.label_singular || "resultado");

  let veredito = "";
  if (spendVal === 0) {
    veredito = `Inconclusivo: não houve investimento nos últimos ${daysCount} dia(s).`;
  } else if (spendVal > 0 && resultVal === 0) {
    veredito = `Abaixo do esperado: houve gasto de ${fmtBRL(spendVal)} em ${daysCount} dia(s) sem registrar ${labelPlural}.`;
  } else if ((daysCount < 3 || impressions < 500) && hasResults) {
    veredito = `Inconclusivo pela amostra curta (${daysCount} dia(s)): gerou ${fmtNum(resultVal)} ${labelPlural} a ${fmtBRL(cost!)}, ainda com poucos dados para cravar tendência.`;
  } else if (hasResults && targetAmount !== null) {
    if (cost! <= targetAmount) {
      veredito = `Bom desempenho: está dentro da ${targetSource} de ${fmtBRL(targetAmount)}, com ${costLabel.toLowerCase()} de ${fmtBRL(cost!)}.`;
    } else if (compAvg !== null && cost! < compAvg) {
      veredito = `Abaixo da meta desejada (${fmtBRL(targetAmount)}), mas melhor que a referência comparável da conta (${fmtBRL(compAvg)}).`;
    } else {
      veredito = `Abaixo da meta: o ${costLabel.toLowerCase()} de ${fmtBRL(cost!)} está ${fmtBRL(cost! - targetAmount)} acima da ${targetSource} (${fmtBRL(targetAmount)}).`;
    }
  } else if (hasResults && compAvg !== null) {
    veredito =
      cost! <= compAvg
        ? `Bom em relação à conta: ${costLabel.toLowerCase()} de ${fmtBRL(cost!)}, abaixo da referência comparável de ${fmtBRL(compAvg)}.`
        : `Acima da referência da conta: ${costLabel.toLowerCase()} de ${fmtBRL(cost!)} vs ${fmtBRL(compAvg)} no grupo comparável.`;
  } else if (hasResults) {
    veredito = `Entrega ativa: gerou ${fmtNum(resultVal)} ${labelPlural} a ${fmtBRL(cost!)}, sem meta ou referência comparável configurada.`;
  } else {
    veredito = "Inconclusivo por falta de dados suficientes no período.";
  }

  const metaComp =
    hasResults && targetAmount !== null
      ? cost! > targetAmount
        ? ` (${fmtBRL(cost! - targetAmount)} acima da ${targetSource} de ${fmtBRL(targetAmount)})`
        : ` (${fmtBRL(targetAmount - cost!)} abaixo da ${targetSource} de ${fmtBRL(targetAmount)})`
      : " (nenhuma meta definida)";

  const benchComp =
    compAvg !== null && hasResults
      ? cost! < compAvg
        ? ` Melhor que a referência de ${fmtBRL(compAvg)}.`
        : ` Acima da referência de ${fmtBRL(compAvg)}.`
      : " Sem referência comparável.";

  const salesExtra =
    cat === "PURCHASES" && m.purchase_value && Number(m.purchase_value) > 0
      ? ` Receita de ${fmtBRL(Number(m.purchase_value))}${m.roas ? ` (ROAS ${Number(m.roas).toFixed(2).replace(".", ",")}x)` : ""}.`
      : "";

  const resultadoLine = `Em ${daysCount} dia(s), **${String(ctx?.entity_name || "o item analisado")}** investiu **${fmtBRL(spendVal)}** e gerou **${fmtNum(resultVal)} ${labelPlural}** com **${costLabel}** de **${hasResults ? fmtBRL(cost!) : "não calculável"}**${metaComp}.${salesExtra}${benchComp}`;

  const clickToConv =
    linkClicks > 0 && resultVal > 0
      ? ` (~${Math.round((resultVal / linkClicks) * 100)}% dos cliques no link virando ${labelSingular}, relação observada sem provar causa)`
      : "";
  const hasVisualCreative = Boolean(ctx?.creative?.has_media || ctx?.configuration?.has_creative_data);
  const creativeObs = !hasVisualCreative
    ? "Consegui analisar os resultados, mas não tive acesso à imagem ou ao vídeo para avaliar o criativo visualmente."
    : "Mídia criativa acessível no contexto para acompanhamento de CTR de link e custo.";
  const crmObs =
    !ctx?.configuration?.has_crm_funnel_data && (cat === "MESSAGES" || cat === "LEADS")
      ? " Sem dados de CRM para medir qualidade comercial ou fechamento."
      : "";

  const leituraLine =
    cat === "REACH"
      ? `Entrega de **${fmtNum(reach)} pessoas alcançadas** e **${fmtNum(impressions)} impressões** (CPM ${fmtBRL(Number(m.cpm || 0))}, frequência ${freq.toFixed(2).replace(".", ",")}). ${creativeObs}`
      : `Teve **${fmtNum(impressions)} impressões**, **${fmtNum(reach)} alcance** (frequência **${freq.toFixed(2).replace(".", ",")}**${freq > 0 && freq < 1.8 ? ", sem sinal de saturação" : ""}), **${fmtNum(linkClicks)} cliques no link** (CTR de link ${fmtPct(Number(m.ctr_link || 0))}, CPC de link ${linkClicks > 0 ? fmtBRL(cpcLink) : "—"})${allClicks > linkClicks ? ` e **${fmtNum(allClicks)} cliques totais**` : ""}${clickToConv}. ${creativeObs}${crmObs}`;

  const actions =
    spendVal === 0
      ? [
          "1. Verificar se a entrega está ativa antes de julgar desempenho.",
          "2. Acumular volume mínimo de impressões e cliques.",
        ]
      : spendVal > 0 && resultVal === 0
        ? [
            `1. Revisar se destino e evento de ${labelPlural} recebem os ${fmtNum(linkClicks)} cliques.`,
            "2. Testar 1 variação de criativo mudando gancho ou oferta principal.",
          ]
        : [
            compAvg !== null && hasResults && cost! <= compAvg
              ? "1. **Manter o anúncio ativo como controle** (entrega abaixo da referência comparável)."
              : "1. **Manter o controle estável se ainda trouxer volume**, sem editar tudo junto.",
            `2. **Testar 1–2 variações mudando uma variável por vez:** gancho inicial para elevar CTR de link (${fmtPct(Number(m.ctr_link || 0))}) ou CTA/texto para melhorar conversão pós-clique.`,
            "3. **Não alterar público, orçamento e objetivo juntos** durante o teste.",
          ];

  const validacaoLine = `Compare **${costLabel}**, **CTR de link** e clique-para-${labelSingular} entre controle e variações por janela compatível, sem presumir atingir ${targetAmount !== null ? fmtBRL(targetAmount) : "a meta"}.`;

  return [
    `**1. Veredito:** ${veredito}`,
    `**2. Resultado principal:** ${resultadoLine}`,
    `**3. Leitura do funil:** ${leituraLine}`,
    `**4. O que fazer agora:**\n${actions.slice(0, 3).join("\n")}`,
    `**5. Como validar:** ${validacaoLine}`,
  ].join("\n\n");
}

export function enforceServerPostLlmGuardrails(
  rawText: string,
  analysisContext?: any,
  ragCitations: ServerRagCitation[] = [],
  operationalMode: string = VICTORIA_DEFAULT_OPERATIONAL_MODE,
  requireFull10Sections: boolean = false,
  userPrompt?: string | null,
  truncatedByLength: boolean = false
): {
  text: string;
  replacedByDeterministic: boolean;
  reasons: string[];
  citationsUsed: ServerRagCitation[];
} {
  const sanitized = sanitizeVictoriaServerOutput(rawText, analysisContext, operationalMode);
  if (!analysisContext || !analysisContext.entity_id) {
    const usedGeneral = selectUsedRagCitations(sanitized, ragCitations);
    return {
      text: requireFull10Sections ? sanitized : stripTechnicalArtifactsServerQuick(sanitized),
      replacedByDeterministic: false,
      reasons: [],
      citationsUsed: usedGeneral,
    };
  }

  const effectiveFull10 = resolveServerRequireFull10Sections(requireFull10Sections, userPrompt);
  const reasons: string[] = [];
  if (truncatedByLength) {
    reasons.push("upstream_truncated_length");
  }
  const leak = detectCrossEntityLeakageServer(sanitized, analysisContext);
  if (leak.leaked) reasons.push(`cross_entity_leak:${leak.matches.join(",")}`);
  if (sanitized.length < (effectiveFull10 ? 120 : 80) || /^\[ERRO\s+\d+\]/i.test(sanitized)) {
    reasons.push("empty_or_provider_error");
  }
  const isScopedEntity = ["campaign", "adset", "ad"].includes(String(analysisContext.entity_level || ""));
  if (isScopedEntity && effectiveFull10) {
    if (!sanitized.includes("O que esta campanha foi configurada para otimizar?")) {
      reasons.push("missing_opening_question");
    }
    if (!hasAllMandatory10SectionsServer(sanitized)) {
      reasons.push("missing_mandatory_10_sections");
    }
  } else if (isScopedEntity && !effectiveFull10) {
    if (hasAllMandatory10SectionsServer(sanitized)) {
      reasons.push("bloated_10_sections_in_quick_mode");
    } else {
      const quickClean = stripTechnicalArtifactsServerQuick(sanitized);
      const quickCheck = validateQuickExecutiveStructureServer(quickClean, analysisContext);
      if (!quickCheck.valid) {
        reasons.push(...quickCheck.reasons);
      }
    }
  }

  if (reasons.length > 0) {
    const fallbackDocs =
      ragCitations.length > 0
        ? ragCitations.slice(0, 4)
        : Array.isArray(analysisContext?.governance_and_benchmarks?.rag_documents)
        ? analysisContext.governance_and_benchmarks.rag_documents
        : [];
    return {
      text: effectiveFull10
        ? generateDeterministic10SectionAnalysis(analysisContext, fallbackDocs)
        : generateQuickExecutiveAnalysisServer(analysisContext, userPrompt),
      replacedByDeterministic: true,
      reasons,
      citationsUsed: fallbackDocs,
    };
  }

  if (!effectiveFull10) {
    const usedDocsQuick = selectUsedRagCitations(sanitized, ragCitations);
    return {
      text: stripTechnicalArtifactsServerQuick(sanitized),
      replacedByDeterministic: false,
      reasons: [],
      citationsUsed: usedDocsQuick,
    };
  }

  let finalOut = sanitized;
  let usedDocs = selectUsedRagCitations(finalOut, ragCitations);
  if (ragCitations.length > 0) {
    const falselyStatesNone = /nenhum\s+documento\s+(espec[íi]fico|pertinente|recuperado|utilizado)/i.test(finalOut);
    if (usedDocs.length === 0 || falselyStatesNone) {
      const topApplied = ragCitations.slice(0, Math.min(ragCitations.length, 3));
      const cleanBody = finalOut
        .replace(/-?\s*\*?\*?Base de conhecimento RAG:\*?\*?[^\n]*nenhum documento[^\n]*/gi, "")
        .trim();
      const citationBullets = topApplied
        .map(
          (d) =>
            `- \`[${d.id}]\` **${d.title}** (\`${d.evidence_level}\` · v\`${d.version}\` · status \`${d.approval_status}\`)`
        )
        .join("\n");
      finalOut = `${cleanBody}\n\n- **Fontes RAG curadas aplicadas (${topApplied.length} de ${ragCitations.length} candidatas):**\n${citationBullets}`;
      usedDocs = topApplied;
    }
  }

  return { text: finalOut, replacedByDeterministic: false, reasons: [], citationsUsed: usedDocs };
}
