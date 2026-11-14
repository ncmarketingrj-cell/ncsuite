// src/lib/metaAlgorithmEngine.ts
// Motor Algorítmico Oficial do Meta Ads (Andromeda MoE + GEM OneSeq/Kunlun + Leilão VCG + Pacing λ + CAPI/EMQ)
// Também exporta os Documentos Treinados Oficiais para a Base de Conhecimento (RAG) da Victoria AI.

export interface TrainedKnowledgeDoc {
  id: string;
  title: string;
  category: "strategy" | "manual" | "custom" | "inventory" | "brand_voice";
  content: string;
}

export const META_ADS_MASTER_KNOWLEDGE_DOCS: TrainedKnowledgeDoc[] = [
  {
    id: "meta-ads-doc-arquitetura-2026",
    title: "[PARECER TÉCNICO META ADS 2026 — PARTE 1] Infraestrutura Advantage+, Motor Andromeda (MoE) e GEM (OneSeq/Kunlun)",
    category: "strategy",
    content: `# Arquitetura de Entrega e Engenharia de Recomendação Multi-Estágio do Meta Ads (2026)

## 1. Virada da Automação e Governança Advantage+
- **Padronização pelo Ecossistema Advantage+**: Consolidação sob a interface unificada Advantage+ (Advantage+ Sales substituindo ASC, Advantage+ Leads e App Promotion).
- **Transição do Targeting Manual para Sinais de Orientação (Advantage+ Audience)**: Segmentações detalhadas (interesses, demografia e comportamentos) deixaram de operar como restrições rígidas (hard constraints) e atuam estritamente como sugestões informativas iniciais. Apenas localização geográfica e idade mínima permanecem restrições rígidas inegociáveis.
- **Camada de Agentes de IA e Protocolo MCP**: Suporte a conectores Model Context Protocol (MCP) operando em formato de rascunho/aprovação humana obrigatória.
- **Inventários e Posicionamentos**: Descontinuação de Messenger Stories e Instagram Explore feed via API; inclusão do Threads como posicionamento padrão global.

## 2. Pipeline Computacional de Entrega Multi-Estágio
1. **Universo Total (~10M+ Anúncios Elegíveis)** -> Filtros Rígidos (Idade mínima, Geografia).
2. **Candidatura & Recuperação — Andromeda Retrieval Engine**:
   - Arquitetura Retrieval Mixture-of-Experts (MoE) executada em chips MTIA e NVIDIA GH200 Grace Hopper.
   - Fused GPU Kernel pontuando mais de 1 bilhão de anúncios/segundo por servidor GPU em memória HBM.
   - **Learning To Index (LTI)**: Atribuição suave diferenciável (Soft Assignment) onde a probabilidade de afinidade a_k de um vetor de anúncio v_j ao centro do nó c_k é:
     a_k = exp(-α · ||v_j - c_k||_2) / Σ exp(-α · ||v_j - c_k'||_2)
   - **Desmistificação do Entity ID**: O Andromeda não funde criativos num único ID, mas agrupa peças com atributos visuais/semânticos similares para compartilhar aprendizados, enquanto a regra de Auction Overlap garante que apenas o anúncio de maior Total Value do mesmo anunciante entre no leilão final.
3. **Ranqueamento — GEM (Generative Ads Recommendation Model)**:
   - Calcula com precisão milimétrica a probabilidade estimada de clique (**pCTR**) e de conversão pós-clique (**pCVR**).
   - **OneSeq (Event Sequence Learning)**: Trata a jornada histórica do usuário como uma sequência contínua de eventos (estilo LLM), prevendo a próxima conversão.
   - **Arquitetura Kunlun + CompSkip**: Component Skip Connection economiza até 43% de FLOPS pulando módulos redundantes sem perda preditiva, com transferência via LoopFM, Solaris e Teacher-Student Adapters.
   - **Impacto Comprovado**: +18,9% em conversões e +12% no CTR global (+5,8% FB, +4,1% IG, +1,6% off-site).`
  },
  {
    id: "meta-ads-doc-leilao-vcg-pacing",
    title: "[PARECER TÉCNICO META ADS 2026 — PARTE 2] Matemática do Leilão (Total Value, VCG, Pacing λ e Cold Start)",
    category: "strategy",
    content: `# Matemática do Leilão, Precificação VCG, Pacing por Shadow Price e Fase de Aprendizado

## 1. Equação Fundamental do Valor Total (Total Value)
O vencedor de cada impressão no leilão do Meta Ads é determinado por:
  Total Value = (Bid_efetivo × pCTR × pCVR) + User Value

- **Bid (Lance)**: Disposição monetária para obter o evento de otimização.
- **pCTR (Predicted Click-Through Rate)**: Probabilidade estimada pelo GEM do usuário clicar no link.
- **pCVR (Predicted Conversion Rate)**: Probabilidade estimada pelo GEM do usuário converter após o clique.
- **User Value (Experiência Pós-Clique)**: Mede velocidade de carregamento da página, taxa de rejeição, sinais de feedback negativo e autenticidade da copy (penaliza clickbait/sensacionalismo). Queda no User Value atua como redutor matemático severo, inflacionando o CPM imediatamente.

## 2. Mecânica de Precificação Vickrey-Clarke-Groves (VCG)
O anunciante vencedor paga o custo social mínimo necessário para superar o Total Value do 2º colocado:
  Actual Cost (eCPM efetivo) = (Total Value_SegundoColocado - User Value_Vencedor) / (pCTR_Vencedor × pCVR_Vencedor)

- **Implicação Estratégica Direta**: Peças criativas com altos índices de pCTR, pCVR e User Value reduzem matematicamente o custo efetivo (eCPM) e vencem concorrentes com orçamentos muito maiores.

## 3. Algoritmo de Pacing e Preço de Sombra (Shadow Price λ)
O controle de distribuição orçamentária ao longo das 24h é regido pelo multiplicador dinâmico λ ∈ (0, 1]:
  Bid_efetivo = λ · Bid_base

- Se o consumo está acelerado, λ diminui para entrar apenas em leilões de altíssimo retorno (menor custo marginal).
- Se o consumo está atrasado (ou quando o orçamento é escalado agressivamente), λ converge para 1.0, forçando entrada em leilões marginais mais caros e elevando o CPA marginal.

## 4. Cold Start, Multi-Armed Bandits e Fase de Aprendizado (50 Eventos/Semana)
- Novos conjuntos/anúncios operam sob algoritmos Multi-Armed Bandit (Thompson Sampling e Upper Confidence Bound), injetando variância otimista inicial (fase de Exploration).
- O sistema exige cerca de **50 eventos de conversão otimizados por semana por conjunto de anúncios** para transitar para a fase de Exploitation (Fase de Aprendizado concluída).
- Abaixo de 50 eventos/semana, o conjunto cai em **Learning Limited**, mantendo incerteza estatística alta e oscilação severa de CPA.`
  },
  {
    id: "meta-ads-doc-telemetria-capi-atribuicao",
    title: "[PARECER TÉCNICO META ADS 2026 — PARTE 3] Telemetria CAPI, Event Match Quality (EMQ) e Reestruturação de Atribuição",
    category: "manual",
    content: `# Telemetria Server-Side (CAPI), Event Match Quality (EMQ) e Atribuição Real 2026

## 1. Conversions API (CAPI) vs. Meta Pixel Client-Side
- Bloqueadores de anúncios, Safari ITP e Apple ATT causam perdas de **20% a 40% dos eventos** no Pixel de navegador.
- A **Conversions API (CAPI)** transmite eventos servidor-a-servidor, preservando o sinal para o modelo GEM calcular o pCVR e o pLTV (Value-Based Bidding).
- **Protocolo de Deduplicação Obrigatório**: Disparar Pixel + CAPI simultaneamente com o exato mesmo \`event_id\` e \`event_name\` dentro da janela de 48h. Falha no \`event_id\` duplica conversões falsas e corrompe os lances automáticos.

## 2. Pesos e Diagnóstico do Event Match Quality (EMQ 0 a 10)
- **\`em\` (E-mail em SHA-256 minúsculo)**: Peso Elevado (+4,0 pontos).
- **\`ph\` (Telefone em SHA-256 padrão E.164 ex: +5521999999999)**: Peso Elevado (+3,0 pontos).
- **\`fbc\` (Click ID fbclid sem hash)**: Peso Elevado (atribuição direta ao anúncio).
- **\`fbp\` (Browser ID _fbp sem hash)** e **\`external_id\`**: Peso Moderado (estabilizam sessão e CRM).
- **Regra Crítica**: NUNCA aplicar hash em \`fbp\`, \`fbc\`, \`client_ip_address\` ou \`client_user_agent\`.
- **Metas de EMQ**: >= 8.8 para Compras (Purchase), >= 8.0 para AddToCart, >= 7.5 para Leads/Formulários.

## 3. Reestruturação da Atribuição em 2026 e Métricas de Negócio
- **Click-Through Estrito a Links Direcionais**: A atribuição de clique computa estritamente Link Clicks. Curtidas, comentários, salvamentos e cliques na foto/perfil foram banidos da coluna de cliques padrão.
- **1-Day Engage-Through**: Conversões geradas por interações não-direcionais ou engajamento com o post migraram para a coluna dedicada de 1-day Engage-Through.
- **Engaged Video View**: Reduzido de 10s para **5 segundos contínuos**.
- **Eliminação de Janelas Estendidas**: Janelas de visualização de 7d e 28d foram removidas da API (mantendo 1d-view, 1d-engage-through, 1d-click e 7d-click).
- **Verdade Contábil (Camada Financeira)**:
  - **MER (Marketing Efficiency Ratio)** = Receita Total / Gasto Total em Anúncios.
  - **nCAC (New Customer Acquisition Cost)** = Gasto Total em Anúncios / Novos Clientes Adquiridos.
  - **Estudos de Incrementalidade (Holdout / Conversion Lift)**: O impacto estritamente causal costuma representar 40% a 70% das conversões atribuídas nativamente.`
  },
  {
    id: "meta-ads-doc-criativos-orcamento-anomalias",
    title: "[PARECER TÉCNICO META ADS 2026 — PARTE 4] Creative Diversity Score, CBO vs ABO, Lances e Diagnóstico de Anomalias",
    category: "manual",
    content: `# Engenharia Criativa (Andromeda), Estratégias de Lance, Governança IA e Resolução de Anomalias

## 1. O Criativo como Segmentação e Creative Diversity Score
- **Fim das Variações Cosméticas (Baixa Diversidade)**: Mudar cor de botão, trocar trilha sonora ou cortar 2 segundos mantém o anúncio no mesmo cluster vetorial do Andromeda. O algoritmo concentra a verba na 1ª variação e satura a audiência rapidamente.
- **Diversidade Conceitual Autêntica (Alta Diversidade)**: Exige alternância real de formatos (UGC em 1ª pessoa, tour real no pátio, estático de oferta direta, carrossel comparativo) e ângulos psicológicos (dor/problema, prova técnica, quebra de objeção financeira, status). Isso gera novos vetores no MoE do Andromeda e abre bolsões inéditos de público com menor CPM.

## 2. Arquitetura de Conta e Estratégias de Lance
- **Advantage+ Campaign Budget (CBO)**: Distribui verba em tempo real para o menor custo marginal. Ideal para escala com 3 a 4 conjuntos consolidados.
- **Ad Set Budget (ABO)**: Orçamento fixo por conjunto. Ideal para Incubadora de Criativos (testes controlados sem sufocamento pelo CBO).
- **Estratégias de Lance**:
  1. **Volume Máximo (Lowest Cost)**: Consome 100% do orçamento diário; maior sensibilidade a oscilações de CPM/saturação quando escalado rápido.
  2. **Meta de Custo (Cost Cap)**: Protege o CPA médio; requer teto inicial configurado 20% a 30% acima do CPA médio histórico para evitar travamento (underdelivery).
  3. **Meta de ROAS (Target ROAS)**: Prioriza maior AOV/pLTV; exige CAPI + EMQ alto.
  4. **Limite de Lance (Bid Cap)**: Teto rígido em cada leilão; risco severo de travar entrega se abaixo do eCPM de equilíbrio.

## 3. Diagnóstico Causal de Anomalias no Leilão
- **Disparada de CPM com queda de entrega**: Degradação na variável **User Value** (lentidão na página/WhatsApp, alta rejeição pós-clique ou feedback negativo), forçando lances muito maiores na equação de Total Value.
- **Travamento de Entrega (Underdelivery) em Cost Cap / Bid Cap**: Restrição de lance abaixo do preço de equilíbrio do multiplicador de Pacing (λ) ou pCTR × pCVR insuficientes para gerar Total Value competitivo.
- **Campanhas Presas em Learning Limited**: Pulverização de conjuntos impedindo atingir 50 conversões semanais por conjunto (Multi-Armed Bandit preso em exploração aleatória).

## 4. Matriz de Governança para Escala e Agentes de IA
- **Regra Inviolável de Escala de Orçamento**: Aumentos de orçamento diário devem respeitar o teto máximo seguro de **+20% por ciclo (a cada 48h–72h)** para evitar reinicialização descontrolada da Fase de Aprendizado e disparo do Shadow Price (λ -> 1.0).`
  }
];

// ═══════════════════════════════════════════════════════════════════════════════
// TIPOS DO SIMULADOR ALGORÍTMICO META ADS
// ═══════════════════════════════════════════════════════════════════════════════

export type SimObjectiveId =
  | "AUTO"
  | "MESSAGES"
  | "OUTCOME_LEADS"
  | "OUTCOME_SALES"
  | "LANDING_PAGE_VIEWS"
  | "INSTAGRAM_PROFILE"
  | "OUTCOME_AWARENESS";

export type BidStrategyId = "LOWEST_COST" | "COST_CAP" | "TARGET_ROAS" | "BID_CAP";
export type BudgetStructureId = "CBO" | "ABO";
export type CreativeDiversityLevel = "LOW" | "MEDIUM" | "HIGH";

export interface ObjectiveMetaConfig {
  id: SimObjectiveId;
  label: string;
  shortLabel: string;
  resultName: string;
  resultSingular: string;
  costMetricName: string;
  description: string;
  defaultCloseRatePct: number;
  defaultAvgTicketBRL: number;
  benchmarkCpaBRL: number;
  benchmarkCtrPct: number;
}

export const SIM_OBJECTIVES: Record<SimObjectiveId, ObjectiveMetaConfig> = {
  AUTO: {
    id: "AUTO",
    label: "Automático (Detectado da Conta/Campanha)",
    shortLabel: "Automático",
    resultName: "Resultados Otimizados",
    resultSingular: "Resultado",
    costMetricName: "CPA / CPL Médio",
    description: "Usa automaticamente o objetivo predominante das campanhas filtradas.",
    defaultCloseRatePct: 8.0,
    defaultAvgTicketBRL: 4500,
    benchmarkCpaBRL: 12.0,
    benchmarkCtrPct: 1.45,
  },
  MESSAGES: {
    id: "MESSAGES",
    label: "Mensagens Iniciadas (WhatsApp / Direct)",
    shortLabel: "WhatsApp / Msg",
    resultName: "Conversas Iniciadas",
    resultSingular: "Conversa",
    costMetricName: "Custo por Mensagem",
    description: "Otimização para onsite_conversion.messaging_conversation_started_7d.",
    defaultCloseRatePct: 6.5,
    defaultAvgTicketBRL: 3800,
    benchmarkCpaBRL: 6.5,
    benchmarkCtrPct: 1.65,
  },
  OUTCOME_LEADS: {
    id: "OUTCOME_LEADS",
    label: "Geração de Cadastros / Leads (Formulário & CRM)",
    shortLabel: "Cadastros / Leads",
    resultName: "Leads Qualificados",
    resultSingular: "Lead",
    costMetricName: "CPL (Custo por Lead)",
    description: "Otimização Advantage+ Leads com qualificação de intenção.",
    defaultCloseRatePct: 10.0,
    defaultAvgTicketBRL: 5500,
    benchmarkCpaBRL: 22.0,
    benchmarkCtrPct: 1.30,
  },
  OUTCOME_SALES: {
    id: "OUTCOME_SALES",
    label: "Vendas & Conversões (Advantage+ Sales / CAPI)",
    shortLabel: "Vendas / Compras",
    resultName: "Compras / Conversões",
    resultSingular: "Venda",
    costMetricName: "CAC / CPA de Venda",
    description: "Otimização de fim de funil guiada por CAPI, Pixel e valor preditivo (pLTV).",
    defaultCloseRatePct: 100.0,
    defaultAvgTicketBRL: 490,
    benchmarkCpaBRL: 48.0,
    benchmarkCtrPct: 1.25,
  },
  LANDING_PAGE_VIEWS: {
    id: "LANDING_PAGE_VIEWS",
    label: "Visualizações da Página de Destino (Tráfego LPV)",
    shortLabel: "Página de Destino",
    resultName: "Visitas Carregadas (LPV)",
    resultSingular: "Visita LPV",
    costMetricName: "Custo por LPV",
    description: "Otimiza para usuários que clicam no link direcional e aguardam o carregamento real.",
    defaultCloseRatePct: 2.5,
    defaultAvgTicketBRL: 2500,
    benchmarkCpaBRL: 1.85,
    benchmarkCtrPct: 1.90,
  },
  INSTAGRAM_PROFILE: {
    id: "INSTAGRAM_PROFILE",
    label: "Visitas ao Perfil do Instagram & Audiência",
    shortLabel: "Visitas Perfil IG",
    resultName: "Visitas ao Perfil",
    resultSingular: "Visita IG",
    costMetricName: "Custo por Visita",
    description: "Tráfego direcionado para ganho de autoridade, seguidores e engajamento no Instagram.",
    defaultCloseRatePct: 1.5,
    defaultAvgTicketBRL: 2000,
    benchmarkCpaBRL: 0.95,
    benchmarkCtrPct: 2.40,
  },
  OUTCOME_AWARENESS: {
    id: "OUTCOME_AWARENESS",
    label: "Alcance & Reconhecimento de Marca (Awareness)",
    shortLabel: "Alcance / Marca",
    resultName: "Milhares Alcançados",
    resultSingular: "Mil Impressões",
    costMetricName: "CPM Efetivo",
    description: "Maximiza exposição única com controle de frequência na região selecionada.",
    defaultCloseRatePct: 0.5,
    defaultAvgTicketBRL: 3000,
    benchmarkCpaBRL: 14.0,
    benchmarkCtrPct: 0.95,
  },
};

export interface BaselineMetrics {
  cost: number;
  dailyCost: number;
  conversions: number;
  impressions: number;
  reach: number;
  clicks: number;
  cpl: number;
  ctr: number;        // decimal e.g. 0.015 = 1.5%
  cvr: number;        // decimal e.g. 0.08 = 8%
  cpm: number;        // R$
  cpc: number;        // R$
  freq: number;       // ex: 2.1
  days: number;
  activeCampaignsCount: number;
  estimatedAdSetsCount: number;
  detectedObjective: Exclude<SimObjectiveId, "AUTO">;
  sourceType: "real_period" | "historical_account" | "benchmark_demo";
  sourceLabel: string;
}

export interface SimulationParams {
  objective: SimObjectiveId;
  budgetMult: number;                      // 0.3x a 3.0x
  periodDays: 7 | 14 | 30 | 60;
  targetFreq: number;                      // 1.1x a 5.0x
  cpmMarketPressure: number;               // 0.7x a 1.6x (sazonalidade/concorrência externa)
  ctrCreativeBoost: number;                // 0.6x a 2.5x (força do gancho criativo)
  creativeDiversity: CreativeDiversityLevel; // LOW (Cosmética) | MEDIUM | HIGH (Conceitual Andromeda)
  userValueScore: number;                  // 40 a 100 (Velocidade LP / SLA WhatsApp / Sem Clickbait)
  emqScore: number;                        // 3.0 a 10.0 (Event Match Quality CAPI + Pixel)
  capiDeduplicated: boolean;               // CAPI ativo com event_id deduplicado
  budgetStructure: BudgetStructureId;      // CBO (Advantage+) vs ABO
  bidStrategy: BidStrategyId;              // LOWEST_COST | COST_CAP | TARGET_ROAS | BID_CAP
  activeAdSetsCount: number;               // Número de conjuntos ativos recebendo a verba
  closeRatePct: number;                    // Taxa de conversão comercial (Lead -> Venda %)
  avgTicketBRL: number;                    // Ticket médio por venda (R$)
}

export interface SimulationResult {
  // Métricas Principais Projetadas
  projCost: number;
  projDailyCost: number;
  projImpressions: number;
  projReach: number;
  projLinkClicks: number;
  projEngageThroughConv: number;
  projDirectClickConv: number;
  projTotalConversions: number;
  projCPA: number;
  projCPM: number;
  projCPC: number;
  projCTR: number;           // decimal
  projCVR: number;           // decimal
  projFreq: number;

  // Métricas Financeiras (Verdade Contábil)
  projSalesCount: number;
  projRevenueBRL: number;
  projROAS: number;
  projPureClickROAS: number;
  projMER: number;
  projNCAC: number;

  // Variáveis Internas do Algoritmo Meta Ads (para Auditoria Oculta)
  shadowPriceLambda: number;           // λ ∈ (0, 1]
  effectiveBidMultiplier: number;      // Bid_efetivo / Bid_base
  andromedaAffinityScore: number;      // 0 a 100 (eficiência de cluster MoE)
  gemPctrMultiplier: number;           // multiplicador pCTR do GEM
  gemPcvrMultiplier: number;           // multiplicador pCVR do GEM
  userValueFactor: number;             // impacto do User Value na equação Total Value
  totalValueIndex: number;             // pontuação composta Total Value (base = 100)
  vcgEcpmDiscountPct: number;          // % de desconto (ou ágio) no eCPM pela regra VCG
  weeklyConvPerAdSet: number;          // Conversões/semana por conjunto (meta >= 50)
  learningPhaseStatus: "STABLE_EXPLOITATION" | "LEARNING_EXPLORATION" | "LEARNING_LIMITED";
  learningPhaseLabel: string;
  learningResetRisk: boolean;          // true se aumento de budget > 20%
  underdeliveryRiskPct: number;        // % de orçamento travado por Cost Cap / Bid Cap restritivo

  // Comparativos Percentuais vs Baseline Normalizada para o mesmo período
  basePeriodCost: number;
  basePeriodConversions: number;
  basePeriodImpressions: number;
  basePeriodReach: number;
  basePeriodClicks: number;
  basePeriodSales: number;
  basePeriodRevenue: number;
  deltaCostPct: number;
  deltaConversionsPct: number;
  deltaCPAPct: number;
  deltaCPMPct: number;
  deltaRevenuePct: number;

  // Diagnóstico Executivo & Tomada de Decisão
  verdictLevel: "OPTIMAL_SCALE" | "CAUTION_OPTIMIZE" | "HIGH_RISK";
  verdictTitle: string;
  verdictSummary: string;
  causalDiagnostics: {
    engine: "Andromeda MoE" | "GEM OneSeq" | "Leilão VCG" | "Pacing (λ)" | "Multi-Armed Bandit" | "CAPI / EMQ";
    status: "positive" | "warning" | "critical";
    title: string;
    explanation: string;
  }[];
  actionPlan: string[];
}

export function simulateMetaAdsImpact(
  baseline: BaselineMetrics,
  params: SimulationParams
): SimulationResult {
  const effectiveObjId: Exclude<SimObjectiveId, "AUTO"> =
    params.objective === "AUTO" ? baseline.detectedObjective : params.objective;

  // 1. Normalizar baseline para o mesmo número de dias da projeção (comparação justa maçã com maçã)
  const baseDailyCost = Math.max(baseline.dailyCost, 10);
  const basePeriodCost = baseDailyCost * params.periodDays;
  const periodRatio = baseline.days > 0 ? params.periodDays / baseline.days : 1;
  const basePeriodConversions = Math.max(0, Math.round(baseline.conversions * periodRatio));
  const basePeriodImpressions = Math.max(100, Math.round(baseline.impressions * periodRatio));
  const basePeriodClicks = Math.max(1, Math.round(baseline.clicks * periodRatio));
  const basePeriodReach = baseline.freq > 0 ? Math.round(basePeriodImpressions / baseline.freq) : Math.round(basePeriodImpressions / 2);

  // 2. Orçamento solicitado & Regra de Pacing / Preço de Sombra (λ)
  const rawRequestedCost = basePeriodCost * params.budgetMult;
  const budgetChangePct = (params.budgetMult - 1) * 100;

  // Se o operador usa Cost Cap ou Bid Cap e escala muito sem criativos diversos, ocorre Underdelivery
  let underdeliveryRiskPct = 0;
  if (params.bidStrategy === "BID_CAP") {
    if (params.budgetMult > 1.3 && params.creativeDiversity === "LOW") underdeliveryRiskPct = 22;
    else if (params.budgetMult > 1.5) underdeliveryRiskPct = 14;
  } else if (params.bidStrategy === "COST_CAP") {
    if (params.budgetMult > 1.5 && params.creativeDiversity === "LOW") underdeliveryRiskPct = 12;
  }

  const projCost = rawRequestedCost * (1 - underdeliveryRiskPct / 100);
  const projDailyCost = projCost / params.periodDays;

  // Cálculo do Preço de Sombra (Shadow Price λ ∈ [0.45, 1.00]):
  // Em gasto moderado/reduzido, λ opera em ~0.62 (entrando só nos leilões mais eficientes).
  // Ao escalar verba, λ se aproxima de 1.0 para cumprir a entrega diária, elevando o lance marginal.
  // CBO amortece a subida de λ distribuindo entre conjuntos de menor custo marginal.
  const cboDampener = params.budgetStructure === "CBO" ? 0.85 : 1.08;
  const rawLambda = 0.62 * Math.pow(params.budgetMult, 0.34 * cboDampener);
  const shadowPriceLambda = Math.min(1.0, Math.max(0.42, rawLambda));
  const effectiveBidMultiplier = shadowPriceLambda / 0.62;

  // 3. Motor Andromeda (Learning To Index & Creative Diversity Score)
  // Alta diversidade conceitual abre novos clusters MoE e reduz a penalidade de saturação de frequência.
  const diversityClusterBonus =
    params.creativeDiversity === "HIGH" ? 1.16 :
    params.creativeDiversity === "MEDIUM" ? 1.00 : 0.86;

  // Fadiga por frequência: frequência acima de 2.5x satura o mesmo cluster caso a diversidade seja baixa
  const freqDiff = params.targetFreq - Math.max(1.2, baseline.freq || 2.1);
  const freqSaturationPenalty =
    params.targetFreq > 2.6
      ? Math.max(0.68, 1 - (params.targetFreq - 2.6) * (params.creativeDiversity === "HIGH" ? 0.06 : 0.14))
      : 1 + Math.min(0.12, (2.2 - params.targetFreq) * 0.05);

  const andromedaAffinityScore = Math.min(
    100,
    Math.max(25, Math.round(74 * diversityClusterBonus * freqSaturationPenalty))
  );

  // 4. Motor GEM (OneSeq / Kunlun) + Telemetria CAPI & Event Match Quality (EMQ)
  // EMQ recomendado >= 8.0. Se CAPI está ativo e deduplicado com EMQ alto, o GEM prevê pCVR com precisão (+18.9% max).
  // Sem CAPI ou com EMQ baixo, há perda de 20%-40% de sinal client-side (ITP/ATT), degradando a previsão de pCVR.
  const emqNormalized = (params.emqScore - 6.0) / 4.0; // -0.75 a +1.0
  const capiSignalFactor = params.capiDeduplicated
    ? 1 + Math.max(0, emqNormalized * 0.14)
    : 0.91 + Math.max(-0.08, emqNormalized * 0.06);

  // pCTR estimado pelo GEM
  const gemPctrMultiplier = params.ctrCreativeBoost * (0.4 + 0.6 * diversityClusterBonus) * freqSaturationPenalty;
  const projCTR = Math.min(0.12, Math.max(0.002, baseline.ctr * gemPctrMultiplier));

  // User Value (Experiência pós-clique: 40 a 100, neutro = 80)
  // Impacta tanto a conversão na página/WhatsApp quanto o desconto/penalidade VCG no eCPM!
  const userValueFactor = 0.65 + (params.userValueScore / 100) * 0.45; // 0.83 a 1.10

  // Penalidade de escala marginal (diminishing returns quando λ -> 1.0 em leilões marginais)
  const scaleElasticityPenalty =
    params.budgetMult > 1.0
      ? Math.pow(params.budgetMult, params.creativeDiversity === "HIGH" ? -0.09 : -0.19)
      : Math.pow(params.budgetMult, -0.08); // reduzir orçamento foca nos leilões mais quentes

  // 5. Fase de Aprendizado (Multi-Armed Bandit — 50 eventos/semana por conjunto)
  const learningResetRisk = budgetChangePct > 20;
  // Estimativa preliminar de conversões para checar densidade semanal por conjunto
  const baseCvr = Math.max(0.005, baseline.cvr);
  const preliminaryPcvrMult = capiSignalFactor * userValueFactor * scaleElasticityPenalty * (params.bidStrategy === "COST_CAP" ? 1.05 : 1.0);

  // 6. Precificação VCG (Vickrey-Clarke-Groves) para o eCPM Efetivo:
  // Actual Cost = (TotalValue_2nd - UserValue_Winner) / (pCTR_Winner * pCVR_Winner)
  // Maior pCTR, pCVR e User Value geram desconto real no eCPM.
  // Por outro lado, escalar orçamento (λ mais alto) e pressão externa de mercado aumentam o eCPM.
  const relevanceQualityDenominator = Math.pow(Math.max(0.5, gemPctrMultiplier * preliminaryPcvrMult * userValueFactor), 0.38);
  const pacingExpansionFactor = Math.pow(effectiveBidMultiplier, 0.45);
  const vcgMultiplier = (params.cpmMarketPressure * pacingExpansionFactor) / relevanceQualityDenominator;

  const projCPM = Math.max(3.5, baseline.cpm * vcgMultiplier);
  const vcgEcpmDiscountPct = ((projCPM / (baseline.cpm * params.cpmMarketPressure)) - 1) * 100;

  // Impressões e Alcance projetados
  const projImpressions = projCPM > 0 ? Math.round((projCost / projCPM) * 1000) : 0;
  const effectiveFreq = Math.max(1.05, params.targetFreq * (params.budgetMult > 1.5 && params.creativeDiversity === "LOW" ? 1.15 : 1.0));
  const projReach = Math.round(projImpressions / effectiveFreq);

  // Cliques Direcionais no Link (2026 Attribution: estritamente Link Clicks)
  const projLinkClicks = Math.round(projImpressions * projCTR);
  const projCPC = projLinkClicks > 0 ? projCost / projLinkClicks : 0;

  // Verifique a Fase de Aprendizado (50 conversões/semana por conjunto)
  const rawConvEstimate = projLinkClicks * baseCvr * preliminaryPcvrMult;
  const weeklyConvTotal = (rawConvEstimate / params.periodDays) * 7;
  const safeAdSets = Math.max(1, params.activeAdSetsCount);
  const weeklyConvPerAdSet = weeklyConvTotal / safeAdSets;

  let learningPhaseStatus: SimulationResult["learningPhaseStatus"] = "STABLE_EXPLOITATION";
  let learningPhaseLabel = "Estabilizada (Exploitation ≥ 50 conv/sem)";
  let banditEfficiencyFactor = 1.0;

  if (weeklyConvPerAdSet < 25) {
    learningPhaseStatus = "LEARNING_LIMITED";
    learningPhaseLabel = "Learning Limited (< 25 conv/sem por conjunto)";
    banditEfficiencyFactor = 0.88; // Thompson Sampling preso em exploração ruidosa
  } else if (weeklyConvPerAdSet < 50 || learningResetRisk) {
    learningPhaseStatus = "LEARNING_EXPLORATION";
    learningPhaseLabel = learningResetRisk
      ? "Reinício de Aprendizado (Choque de Orçamento > 20%)"
      : "Em Aprendizado (25–49 conv/sem por conjunto)";
    banditEfficiencyFactor = learningResetRisk ? 0.93 : 0.96;
  }

  // pCVR Final do GEM (combinando CAPI/EMQ + User Value + Elasticidade + Multi-Armed Bandit)
  const gemPcvrMultiplier = preliminaryPcvrMult * banditEfficiencyFactor;
  const projCVR = Math.min(0.65, Math.max(0.002, baseCvr * gemPcvrMultiplier));

  // Conversões totais (2026 Attribution: Click-Through direto + 1-day Engage-Through)
  const projTotalConversions =
    effectiveObjId === "OUTCOME_AWARENESS"
      ? Math.round(projReach / 1000)
      : effectiveObjId === "LANDING_PAGE_VIEWS"
      ? Math.round(projLinkClicks * Math.min(0.95, 0.78 * userValueFactor))
      : Math.max(0, Math.round(projLinkClicks * projCVR));

  // Separação entre Conversão por Clique Direto (Link Click) e 1-day Engage-Through (~14% em vídeo/social)
  const engageShare = params.creativeDiversity === "HIGH" ? 0.16 : 0.12;
  const projEngageThroughConv = Math.round(projTotalConversions * engageShare);
  const projDirectClickConv = Math.max(0, projTotalConversions - projEngageThroughConv);

  const projCPA = projTotalConversions > 0 ? projCost / projTotalConversions : 0;

  // Pontuação de Total Value (Base = 100)
  const totalValueIndex = Math.round(
    100 * effectiveBidMultiplier * gemPctrMultiplier * gemPcvrMultiplier * userValueFactor
  );

  // 7. Camada Financeira (Verdade Contábil: Vendas, Receita, ROAS, MER, nCAC)
  const closeRateDec = Math.max(0, Math.min(1, params.closeRatePct / 100));
  const projSalesCount =
    effectiveObjId === "OUTCOME_SALES"
      ? projTotalConversions
      : Math.max(0, Math.round(projTotalConversions * closeRateDec));
  const projRevenueBRL = params.avgTicketBRL > 0 && closeRateDec > 0 ? projSalesCount * params.avgTicketBRL : 0;
  const projROAS = projCost > 0 && projRevenueBRL > 0 ? projRevenueBRL / projCost : 0;
  const projPureClickROAS = projROAS * (1 - engageShare);
  const projMER = projCost > 0 && projRevenueBRL > 0 ? projRevenueBRL / projCost : 0; // Receita estimada / Ad Spend (sem fator artificial)
  const projNCAC = projSalesCount > 0 ? projCost / projSalesCount : 0;

  // Baseline financeira para comparação justa
  const basePeriodSales =
    effectiveObjId === "OUTCOME_SALES"
      ? basePeriodConversions
      : Math.max(0, Math.round(basePeriodConversions * closeRateDec));
  const basePeriodRevenue = basePeriodSales * params.avgTicketBRL;

  // Deltas percentuais vs Baseline normalizada para o período
  const deltaCostPct = basePeriodCost > 0 ? ((projCost - basePeriodCost) / basePeriodCost) * 100 : 0;
  const deltaConversionsPct = basePeriodConversions > 0 ? ((projTotalConversions - basePeriodConversions) / basePeriodConversions) * 100 : 0;
  const deltaCPAPct = baseline.cpl > 0 ? ((projCPA - baseline.cpl) / baseline.cpl) * 100 : 0;
  const deltaCPMPct = baseline.cpm > 0 ? ((projCPM - baseline.cpm) / baseline.cpm) * 100 : 0;
  const deltaRevenuePct = basePeriodRevenue > 0 ? ((projRevenueBRL - basePeriodRevenue) / basePeriodRevenue) * 100 : 0;

  // 8. Diagnósticos Causais por Subsistema do Algoritmo Meta Ads
  const causalDiagnostics: SimulationResult["causalDiagnostics"] = [];

  // Andromeda Diagnostic
  if (params.creativeDiversity === "LOW" && (params.targetFreq > 2.7 || params.budgetMult > 1.25)) {
    causalDiagnostics.push({
      engine: "Andromeda MoE",
      status: "critical",
      title: "Fadiga de Cluster por Baixa Diversidade Criativa",
      explanation: `Com Creative Diversity Score baixo (variações cosméticas), o motor Andromeda mantém os anúncios no mesmo nó vetorial (LTI). Escalar verba eleva a frequência para ${effectiveFreq.toFixed(1)}× e comprime o pCTR.`,
    });
  } else if (params.creativeDiversity === "HIGH") {
    causalDiagnostics.push({
      engine: "Andromeda MoE",
      status: "positive",
      title: "Desbloqueio de Novos Clusters no Andromeda (MoE)",
      explanation: `A alta diversidade conceitual gera vetores distintos na função Soft Assignment (LTI), permitindo absorver ${(params.budgetMult * 100).toFixed(0)}% de budget com afinidade de ${andromedaAffinityScore}/100 sem saturar a audiência.`,
    });
  } else {
    causalDiagnostics.push({
      engine: "Andromeda MoE",
      status: "warning",
      title: "Diversidade Criativa Moderada",
      explanation: `Os ativos atuais sustentam a entrega base, mas adicionar 2 novos formatos distintos (ex: UGC em 1ª pessoa + Tour no Pátio) abrirá novos bolsões de audiência com menor CPM.`,
    });
  }

  // Leilão VCG & User Value Diagnostic
  if (vcgEcpmDiscountPct <= -3) {
    causalDiagnostics.push({
      engine: "Leilão VCG",
      status: "positive",
      title: `Desconto de ${Math.abs(vcgEcpmDiscountPct).toFixed(1)}% no eCPM via Regra VCG`,
      explanation: `O ganho combinado de pCTR (${(projCTR * 100).toFixed(2)}%) e User Value (${params.userValueScore}/100) reduz o custo social cobrado no leilão Vickrey-Clarke-Groves para R$ ${projCPM.toFixed(2)}.`,
    });
  } else if (params.userValueScore < 70 || vcgEcpmDiscountPct > 10) {
    causalDiagnostics.push({
      engine: "Leilão VCG",
      status: "critical",
      title: `Penalidade de eCPM (+${Math.max(0, vcgEcpmDiscountPct).toFixed(1)}%) na Equação de Total Value`,
      explanation: `Notas baixas de User Value (${params.userValueScore}/100 — lentidão na página/atendimento ou rejeição pós-clique) ou queda de pCTR forçam o algoritmo a inflar o lance financeiro para vencer a mesma impressão.`,
    });
  } else {
    causalDiagnostics.push({
      engine: "Leilão VCG",
      status: "positive",
      title: "Equilíbrio de Preço VCG Estável",
      explanation: `O Total Value (${totalValueIndex} pts) mantém competitividade saudável frente ao segundo colocado no leilão, com eCPM projetado em R$ ${projCPM.toFixed(2)}.`,
    });
  }

  // Pacing (Shadow Price λ) & Governança de Budget
  if (learningResetRisk) {
    causalDiagnostics.push({
      engine: "Pacing (λ)",
      status: "warning",
      title: `Aumento de +${budgetChangePct.toFixed(0)}% Viola Teto de Governança (+20%/ciclo)`,
      explanation: `Elevar o orçamento acima de 20% de uma só vez força o Preço de Sombra (λ = ${shadowPriceLambda.toFixed(2)}) a buscar leilões marginais caros e reinicia a Fase de Aprendizado.`,
    });
  } else {
    causalDiagnostics.push({
      engine: "Pacing (λ)",
      status: "positive",
      title: `Modulação de Pacing Calibrada (λ = ${shadowPriceLambda.toFixed(2)})`,
      explanation: `A variação de orçamento respeita a faixa de estabilidade algorítmica, mantendo o multiplicador de lance efetivo sem esgotamento prematuro em leilões de baixa conversão.`,
    });
  }

  // Multi-Armed Bandit & Learning Phase (50 conv/sem)
  if (learningPhaseStatus === "LEARNING_LIMITED") {
    causalDiagnostics.push({
      engine: "Multi-Armed Bandit",
      status: "critical",
      title: `Risco de "Learning Limited" (${weeklyConvPerAdSet.toFixed(1)} conv/sem por conjunto)`,
      explanation: `Com ${params.activeAdSetsCount} conjunto(s) ativo(s), a densidade fica abaixo dos 50 eventos semanais exigidos pelo GEM. O algoritmo permanece preso em amostragem Thompson Sampling com alta volatilidade.`,
    });
  } else {
    causalDiagnostics.push({
      engine: "Multi-Armed Bandit",
      status: "positive",
      title: `Densidade de Aprendizado Saudável (${weeklyConvPerAdSet.toFixed(1)} conv/sem por conjunto)`,
      explanation: `Volume suficiente para reduzir a incerteza estatística e operar em regime de Exploitation nas melhores sequências comportamentais (OneSeq).`,
    });
  }

  // CAPI & EMQ Diagnostic
  if (!params.capiDeduplicated || params.emqScore < 7.5) {
    causalDiagnostics.push({
      engine: "CAPI / EMQ",
      status: "warning",
      title: `Subnotificação de Sinais no GEM (EMQ ${params.emqScore.toFixed(1)}/10)`,
      explanation: `Sem CAPI redundante deduplicado por event_id e parâmetros hashados (em, ph, fbc), bloqueios de navegador (ITP/ATT) ocultam de 20% a 40% das conversões, subestimando o pCVR no leilão.`,
    });
  } else {
    causalDiagnostics.push({
      engine: "CAPI / EMQ",
      status: "positive",
      title: `Premissa CAPI Ativa (EMQ Simulado ${params.emqScore.toFixed(1)}/10)`,
      explanation: `Premissa de transmissão redundante Pixel + CAPI com event_id para reduzir perda de sinais client-side no modelo GEM (estimativa configurável pelo usuário).`,
    });
  }

  // 9. Veredito Executivo & Plano de Ação Tático
  let verdictLevel: SimulationResult["verdictLevel"] = "OPTIMAL_SCALE";
  let verdictTitle = "Cenário Altamente Vantajoso — Escala Recomendada";
  let verdictSummary = `Projeção indica ${projTotalConversions.toLocaleString("pt-BR")} resultados (${deltaConversionsPct >= 0 ? "+" : ""}${deltaConversionsPct.toFixed(1)}%) com CPA em R$ ${projCPA.toFixed(2)} (${deltaCPAPct >= 0 ? "+" : ""}${deltaCPAPct.toFixed(1)}%) e ROAS projetado de ${projROAS.toFixed(2)}×.`;

  if (deltaCPAPct > 22 || learningPhaseStatus === "LEARNING_LIMITED" || underdeliveryRiskPct >= 15) {
    verdictLevel = "HIGH_RISK";
    verdictTitle = "Cenário de Alto Risco Algorítmico — Requer Correção Antes de Aplicar";
    verdictSummary = `A configuração atual projeta inflação de +${deltaCPAPct.toFixed(1)}% no CPA (R$ ${projCPA.toFixed(2)}) ou travamento de aprendizado. Veja o plano de correção abaixo.`;
  } else if (deltaCPAPct > 8 || learningResetRisk || params.creativeDiversity === "LOW") {
    verdictLevel = "CAUTION_OPTIMIZE";
    verdictTitle = "Cenário Viável com Ressalvas — Otimize a Estrutura p/ Reduzir o CPA";
    verdictSummary = `O volume cresce (${deltaConversionsPct >= 0 ? "+" : ""}${deltaConversionsPct.toFixed(1)}%), mas o custo marginal sobe ${deltaCPAPct >= 0 ? "+" : ""}${deltaCPAPct.toFixed(1)}%. Ajustes em diversidade criativa ou fracionamento de budget destravam maior eficiência.`;
  }

  const actionPlan: string[] = [];
  if (learningResetRisk) {
    const stepsCount = Math.ceil(budgetChangePct / 20);
    actionPlan.push(
      `Fracionar o aumento de orçamento de +${budgetChangePct.toFixed(0)}% em ${stepsCount} ciclos de no máximo +20% a cada 48h–72h para não resetar a Fase de Aprendizado nem inflar o Preço de Sombra (λ).`
    );
  }
  if (learningPhaseStatus !== "STABLE_EXPLOITATION" && params.activeAdSetsCount > 1) {
    const idealAdSets = Math.max(1, Math.floor(weeklyConvTotal / 50));
    actionPlan.push(
      `Consolidar os ${params.activeAdSetsCount} conjuntos ativos para ${idealAdSets} conjunto(s) em Advantage+ Campaign Budget (CBO), concentrando pelo menos 50 conversões/semana por conjunto.`
    );
  }
  if (params.creativeDiversity !== "HIGH") {
    actionPlan.push(
      `Substituir variações cosméticas por 3 conceitos estruturalmente distintos (ex: 1 vídeo UGC/Tour no pátio em 1ª pessoa + 1 carrossel comparativo + 1 estático de condição comercial) para elevar o Creative Diversity Score no Andromeda.`
    );
  }
  if (!params.capiDeduplicated || params.emqScore < 8.0) {
    actionPlan.push(
      `Ativar Conversions API (CAPI) com deduplicação por event_id e envio de e-mail (em) + telefone E.164 (ph) em SHA-256 + fbc sem hash para elevar o EMQ acima de 8.0.`
    );
  }
  if (params.userValueScore < 80) {
    actionPlan.push(
      `Otimizar o User Value pós-clique (reduzir tempo de carregamento da página/LP para < 2.5s e responder leads no WhatsApp em menos de 5 minutos) para ganhar desconto direto de eCPM no leilão VCG.`
    );
  }
  if (actionPlan.length === 0) {
    actionPlan.push(
      `Configuração alinhada com a engenharia do Meta Ads: manter monitoramento do MER (${projMER.toFixed(2)}×) e renovar 1 conceito criativo a cada 14 dias para sustentar o pCTR acima de ${(projCTR * 100).toFixed(2)}%.`
    );
  }

  return {
    projCost,
    projDailyCost,
    projImpressions,
    projReach,
    projLinkClicks,
    projEngageThroughConv,
    projDirectClickConv,
    projTotalConversions,
    projCPA,
    projCPM,
    projCPC,
    projCTR,
    projCVR,
    projFreq: effectiveFreq,
    projSalesCount,
    projRevenueBRL,
    projROAS,
    projPureClickROAS,
    projMER,
    projNCAC,
    shadowPriceLambda,
    effectiveBidMultiplier,
    andromedaAffinityScore,
    gemPctrMultiplier,
    gemPcvrMultiplier,
    userValueFactor,
    totalValueIndex,
    vcgEcpmDiscountPct,
    weeklyConvPerAdSet,
    learningPhaseStatus,
    learningPhaseLabel,
    learningResetRisk,
    underdeliveryRiskPct,
    basePeriodCost,
    basePeriodConversions,
    basePeriodImpressions,
    basePeriodReach,
    basePeriodClicks,
    basePeriodSales,
    basePeriodRevenue,
    deltaCostPct,
    deltaConversionsPct,
    deltaCPAPct,
    deltaCPMPct,
    deltaRevenuePct,
    verdictLevel,
    verdictTitle,
    verdictSummary,
    causalDiagnostics,
    actionPlan,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PRESETS DIDÁTICOS DE EXEMPLO PRÁTICO (1-CLIQUE)
// ═══════════════════════════════════════════════════════════════════════════════

export interface DidacticPreset {
  id: string;
  badge: string;
  title: string;
  subtitle: string;
  algorithmicLesson: string;
  decisionOutcome: string;
  color: string;
  apply: (base: BaselineMetrics, current: SimulationParams) => SimulationParams;
}

export const DIDACTIC_SIMULATION_PRESETS: DidacticPreset[] = [
  {
    id: "safe_scale_20",
    badge: "REGRA DE GOVERNANÇA",
    title: "1. Escala Segura (+20% Budget em CBO)",
    subtitle: "Aumenta o investimento respeitando o teto algorítmico sem reiniciar a Fase de Aprendizado.",
    algorithmicLesson:
      "Na Matriz de Governança do Meta Ads, aumentos de até +20% por ciclo mantêm o multiplicador de Pacing (Shadow Price λ) equilibrado e preservam os pesos da sequência de eventos (OneSeq) no modelo GEM.",
    decisionOutcome:
      "Ideal para campanhas quentes que já estão batendo a meta de CPL/CPA e precisam ganhar volume imediato com previsibilidade.",
    color: "#10b981",
    apply: (base, cur) => ({
      ...cur,
      budgetMult: 1.2,
      targetFreq: Math.max(1.6, Math.min(2.4, base.freq || 2.0)),
      cpmMarketPressure: 1.0,
      ctrCreativeBoost: 1.05,
      creativeDiversity: "MEDIUM",
      userValueScore: 85,
      emqScore: 8.2,
      capiDeduplicated: true,
      budgetStructure: "CBO",
      bidStrategy: "LOWEST_COST",
    }),
  },
  {
    id: "andromeda_creative_shock",
    badge: "MOTOR ANDROMEDA + VCG",
    title: "2. Choque de Diversidade Criativa (Andromeda MoE)",
    subtitle: "Simula a entrada de 3 novos conceitos criativos autênticos + melhoria pós-clique.",
    algorithmicLesson:
      "Ao trocar variações cosméticas por conceitos distintos (UGC + Vídeo Pátio + Oferta Direta), o algoritmo Learning To Index (LTI) do Andromeda indexa o anúncio em novos clusters. O aumento de pCTR e User Value reduz o eCPM cobrado pela equação Vickrey-Clarke-Groves (VCG)!",
    decisionOutcome:
      "Permite escalar +40% de orçamento reduzindo simultaneamente o CPL/CPA em vez de encarecê-lo.",
    color: "#8b5cf6",
    apply: (base, cur) => ({
      ...cur,
      budgetMult: 1.4,
      targetFreq: Math.max(1.5, (base.freq || 2.2) - 0.3),
      cpmMarketPressure: 1.0,
      ctrCreativeBoost: 1.35,
      creativeDiversity: "HIGH",
      userValueScore: 92,
      emqScore: 8.8,
      capiDeduplicated: true,
      budgetStructure: "CBO",
      bidStrategy: "LOWEST_COST",
    }),
  },
  {
    id: "capi_emq_upgrade",
    badge: "ENGENHARIA DE DADOS GEM",
    title: "3. Ativação CAPI Server-Side + EMQ 9.2",
    subtitle: "Recupera os 20%–40% de sinais perdidos no navegador e calibra o pCVR do modelo GEM.",
    algorithmicLesson:
      "Quando o Pixel opera sozinho sem CAPI deduplicado (event_id) ou sem dados hashados (em, ph, fbc), o modelo GEM subestima a probabilidade de conversão (pCVR). Elevar o EMQ para 9.2 aumenta a competitividade na equação de Total Value sem gastar R$ 1,00 a mais em mídia.",
    decisionOutcome:
      "Eleva o volume de conversões e habilita estratégias baseadas em valor (Cost Cap / Target ROAS) com segurança.",
    color: "#06b6d4",
    apply: (base, cur) => ({
      ...cur,
      budgetMult: 1.0,
      targetFreq: base.freq || 2.1,
      cpmMarketPressure: 1.0,
      ctrCreativeBoost: 1.05,
      creativeDiversity: "HIGH",
      userValueScore: 88,
      emqScore: 9.2,
      capiDeduplicated: true,
      budgetStructure: "CBO",
      bidStrategy: "COST_CAP",
    }),
  },
  {
    id: "stress_test_bad_scale",
    badge: "ALERTA DE ERRO COMUM",
    title: "4. Teste de Estresse: Dobrar Verba (+100%) sem Criativos Novos",
    subtitle: "Mostra por que dobrar o orçamento em conjuntos fragmentados destrói o CPA no Meta Ads.",
    algorithmicLesson:
      "Dobrar a verba (+100%) de uma vez com baixa diversidade criativa força o Shadow Price (λ → 1.0) a entrar em leilões marginais caros, satura o mesmo cluster no Andromeda (frequência > 3.8×), reseta a Fase de Aprendizado (Multi-Armed Bandit) e dispara o CPA.",
    decisionOutcome:
      "Demonstra matematicamente por que você nunca deve escalar orçamento no grito sem antes consolidar conjuntos e diversificar criativos.",
    color: "#ef4444",
    apply: (_base, cur) => ({
      ...cur,
      budgetMult: 2.0,
      targetFreq: 3.9,
      cpmMarketPressure: 1.15,
      ctrCreativeBoost: 0.85,
      creativeDiversity: "LOW",
      userValueScore: 62,
      emqScore: 5.5,
      capiDeduplicated: false,
      budgetStructure: "ABO",
      bidStrategy: "LOWEST_COST",
      activeAdSetsCount: Math.max(5, cur.activeAdSetsCount),
    }),
  },
];

