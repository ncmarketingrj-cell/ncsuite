import { supabase } from "@/integrations/supabase-external/client";

export interface ReportCampaignItem {
  id: string;
  name: string;
  cost: number;
  impressions: number;
  clicks: number;
  conversions: number;
  reach: number;
  objective: string;
  platform: "meta" | "google";
  selected: boolean;
  campaignName?: string;
  adSetName?: string;
}

export interface ReportTemplateRecord {
  id: string;
  name: string;
  message_template: string;
  pdf_layout: "classic" | "analytical" | "minimalist";
  is_system?: boolean;
  system_mode?: "standard_auto" | "ecommerce_sales" | "complete" | "objective" | "campaigns";
  variant_type?: "objective" | "campaigns" | "complete" | "sector" | "custom";
  group_id?: string;
  description?: string;
  created_at?: string;
}

export type ParameterSectionId = "header" | "totals" | "objectives" | "campaigns" | "footer";

export interface DidacticTemplateParameter {
  key: string;
  tag: string;
  label: string;
  shortLabel: string;
  section: ParameterSectionId;
  sectionLabel: string;
  whereItAppears: string;
  explanation: string;
  exampleOutput: string;
  formattedLine: string;
  defaultChecked?: boolean;
}

export const PARAMETER_SECTIONS: {
  id: ParameterSectionId;
  title: string;
  subtitle: string;
  badge: string;
}[] = [
  {
    id: "header",
    title: "1. Cabeçalho & Identificação",
    subtitle: "Aparece no topo da mensagem identificando o cliente e o período",
    badge: "Topo do Texto",
  },
  {
    id: "totals",
    title: "2. Totais Gerais & Resumo Executivo",
    subtitle: "Aparece logo abaixo do cabeçalho consolidando os números gerais",
    badge: "Bloco de Totais",
  },
  {
    id: "objectives",
    title: "3. Resultados por Objetivo (Frentes de Tráfego)",
    subtitle: "Agrupa os resultados por objetivo (Veículos, WhatsApp, Alcance, Consignado, Perfil)",
    badge: "Meio — Por Objetivo",
  },
  {
    id: "campaigns",
    title: "4. Campanhas & Detalhamento Individual",
    subtitle: "Lista cada campanha selecionada (resumida ou com detalhes completos)",
    badge: "Corpo — Por Campanha",
  },
  {
    id: "footer",
    title: "5. Rodapé & Assinatura",
    subtitle: "Aparece no encerramento da mensagem de WhatsApp",
    badge: "Final do Texto",
  },
];

export const REPORT_TEMPLATE_PARAMETERS: DidacticTemplateParameter[] = [
  // 1. HEADER
  {
    key: "NOME_CLIENTE",
    tag: "{{NOME_CLIENTE}}",
    label: "Nome da Loja / Cliente",
    shortLabel: "Loja / Cliente",
    section: "header",
    sectionLabel: "Cabeçalho",
    whereItAppears: "Logo abaixo do título do relatório",
    explanation: "Insere automaticamente o nome da loja ou cliente selecionado no Passo 1 do relatório.",
    exampleOutput: "🏢 *Cliente:* LumaCar Multimarcas",
    formattedLine: "🏢 *Cliente:* {{NOME_CLIENTE}}",
    defaultChecked: true,
  },
  {
    key: "PERIODO",
    tag: "{{PERIODO}}",
    label: "Período de Análise",
    shortLabel: "Período",
    section: "header",
    sectionLabel: "Cabeçalho",
    whereItAppears: "No cabeçalho, abaixo do nome do cliente",
    explanation: "Mostra o mês de referência ou o intervalo exato de datas selecionado no calendário.",
    exampleOutput: "📅 *Período:* 01/11/2026 a 12/11/2026",
    formattedLine: "📅 *Período:* {{PERIODO}}",
    defaultChecked: true,
  },
  {
    key: "PLATAFORMAS",
    tag: "{{PLATAFORMAS}}",
    label: "Plataformas de Anúncio (Meta / Google)",
    shortLabel: "Plataformas",
    section: "header",
    sectionLabel: "Cabeçalho",
    whereItAppears: "No final do cabeçalho de identificação",
    explanation: "Identifica automaticamente se as campanhas vieram do Meta Ads, Google Ads ou ambos.",
    exampleOutput: "📱 *Plataformas:* Meta Ads",
    formattedLine: "📱 *Plataformas:* {{PLATAFORMAS}}",
    defaultChecked: false,
  },

  // 2. TOTALS
  {
    key: "INVESTIMENTO",
    tag: "{{INVESTIMENTO}}",
    label: "Investimento Total no Período",
    shortLabel: "Investimento Total",
    section: "totals",
    sectionLabel: "Totais Gerais",
    whereItAppears: "Na seção de Totais Gerais",
    explanation: "Soma todo o valor investido nas campanhas marcadas no relatório, formatado em Reais (R$).",
    exampleOutput: "💵 *Investimento Total:* R$ 4.850,00",
    formattedLine: "💵 *Investimento Total:* {{INVESTIMENTO}}",
    defaultChecked: true,
  },
  {
    key: "TOTAL_RESULTADOS",
    tag: "{{TOTAL_RESULTADOS}}",
    label: "Total de Resultados / Leads Gerados",
    shortLabel: "Total de Resultados",
    section: "totals",
    sectionLabel: "Totais Gerais",
    whereItAppears: "Na seção de Totais Gerais, abaixo do Investimento",
    explanation: "Soma todas as conversas iniciadas, leads captados ou ações principais de todas as campanhas.",
    exampleOutput: "📈 *Resultados Totais:* 642",
    formattedLine: "📈 *Resultados Totais:* {{TOTAL_RESULTADOS}}",
    defaultChecked: true,
  },
  {
    key: "CPA_MEDIO",
    tag: "{{CPA_MEDIO}}",
    label: "Custo Médio por Resultado (CPA / CPL Geral)",
    shortLabel: "CPA / CPL Médio",
    section: "totals",
    sectionLabel: "Totais Gerais",
    whereItAppears: "Na seção de Totais Gerais, abaixo do Total de Resultados",
    explanation: "Calcula automaticamente a média de custo por lead/resultado (Investimento Total ÷ Resultados Totais).",
    exampleOutput: "💲 *CPA Médio Geral:* R$ 7,55",
    formattedLine: "💲 *CPA Médio Geral:* {{CPA_MEDIO}}",
    defaultChecked: true,
  },
  {
    key: "ALCANCE_TOTAL",
    tag: "{{ALCANCE_TOTAL}}",
    label: "Alcance Total (Pessoas Únicas)",
    shortLabel: "Alcance Total",
    section: "totals",
    sectionLabel: "Totais Gerais",
    whereItAppears: "Na seção de Totais Gerais",
    explanation: "Mostra quantas pessoas únicas foram impactadas pelos anúncios da loja no período.",
    exampleOutput: "👥 *Alcance Total:* 84.320",
    formattedLine: "👥 *Alcance Total:* {{ALCANCE_TOTAL}}",
    defaultChecked: false,
  },
  {
    key: "IMPRESSOES_TOTAIS",
    tag: "{{IMPRESSOES_TOTAIS}}",
    label: "Impressões Totais (Visualizações de Tela)",
    shortLabel: "Impressões Totais",
    section: "totals",
    sectionLabel: "Totais Gerais",
    whereItAppears: "Na seção de Totais Gerais",
    explanation: "Soma quantas vezes os anúncios foram exibidos nas telas dos usuários no período.",
    exampleOutput: "👁️ *Impressões Totais:* 142.900",
    formattedLine: "👁️ *Impressões Totais:* {{IMPRESSOES_TOTAIS}}",
    defaultChecked: false,
  },
  {
    key: "TOTAL_CAMPANHAS",
    tag: "{{TOTAL_CAMPANHAS}}",
    label: "Quantidade de Campanhas Selecionadas",
    shortLabel: "Nº de Campanhas",
    section: "totals",
    sectionLabel: "Totais Gerais",
    whereItAppears: "No fechamento do bloco de Totais Gerais",
    explanation: "Informa quantas campanhas ativas compõem os números apresentados neste relatório.",
    exampleOutput: "📌 *Campanhas no Relatório:* 5",
    formattedLine: "📌 *Campanhas no Relatório:* {{TOTAL_CAMPANHAS}}",
    defaultChecked: false,
  },

  // 3. OBJECTIVES
  {
    key: "RESULTADOS_POR_TIPO",
    tag: "{{RESULTADOS_POR_TIPO}}",
    label: "Agrupamento Automático por Objetivo (Todos os Objetivos Ativos)",
    shortLabel: "Todos os Objetivos Agrupados",
    section: "objectives",
    sectionLabel: "Por Objetivo",
    whereItAppears: "No bloco central de Resultados por Objetivo",
    explanation: "Agrupa automaticamente as campanhas por objetivo (Mensagens nos Veículos, Alcance, Consignado, Visitas ao Perfil, Cliques) exibindo Investimento, Resultados e CPL/CPM de cada grupo.",
    exampleOutput: "🚗 *Mensagens nos veículos*\n   💵 Investimento: R$ 3.200,00\n   📈 Resultados: 512\n   💲 CPL/CPA: R$ 6,25",
    formattedLine: "{{RESULTADOS_POR_TIPO}}",
    defaultChecked: true,
  },
  {
    key: "BLOCO_VEICULOS",
    tag: "{{BLOCO_VEICULOS}}",
    label: "Bloco Dedicado: Mensagens nos Veículos / WhatsApp",
    shortLabel: "Bloco Mensagens Veículos",
    section: "objectives",
    sectionLabel: "Por Objetivo",
    whereItAppears: "Na seção de objetivos específicos",
    explanation: "Exibe no formato enxuto NC o Investimento, Total de Leads e Custo por Lead apenas das campanhas de mensagens/veículos.",
    exampleOutput: "*Campanha de mensagens nos veículos:*\n Investimento: R$ 3.200,00\n Total de leads: 512\n Custo por lead: R$ 6,25",
    formattedLine: "{{BLOCO_VEICULOS}}",
    defaultChecked: false,
  },
  {
    key: "BLOCO_ALCANCE",
    tag: "{{BLOCO_ALCANCE}}",
    label: "Bloco Dedicado: Alcance, Impressões & Thru-Play",
    shortLabel: "Bloco Alcance & CPM",
    section: "objectives",
    sectionLabel: "Por Objetivo",
    whereItAppears: "Na seção de objetivos específicos",
    explanation: "Exibe exclusivamente o Investimento, Impressões/Plays e CPM das campanhas de reconhecimento de marca e Reels.",
    exampleOutput: "*Campanha de Alcance e Impressões:*\nInvestimento: R$ 650,00\nImpressões / Plays: 68.400\nCPM: R$ 9,50",
    formattedLine: "{{BLOCO_ALCANCE}}",
    defaultChecked: false,
  },
  {
    key: "BLOCO_CONSIGNADO",
    tag: "{{BLOCO_CONSIGNADO}}",
    label: "Bloco Dedicado: Campanha de Consignado / Captação",
    shortLabel: "Bloco Consignado",
    section: "objectives",
    sectionLabel: "Por Objetivo",
    whereItAppears: "Na seção de objetivos específicos",
    explanation: "Exibe exclusivamente o Total de Leads, Custo por Lead e Investimento das campanhas de captação/compra de veículos.",
    exampleOutput: "*Campanha de consignado*\nTotal de leads: 85\nCusto por leads: R$ 7,05\nInvestimento: R$ 600,00",
    formattedLine: "{{BLOCO_CONSIGNADO}}",
    defaultChecked: false,
  },
  {
    key: "BLOCO_PERFIL",
    tag: "{{BLOCO_PERFIL}}",
    label: "Bloco Dedicado: Visitas ao Perfil do Instagram",
    shortLabel: "Bloco Visitas ao Perfil",
    section: "objectives",
    sectionLabel: "Por Objetivo",
    whereItAppears: "Na seção de objetivos específicos",
    explanation: "Exibe exclusivamente o Investimento, Visitas ao Perfil e Custo por Visita das campanhas de tráfego para o Instagram.",
    exampleOutput: "*Campanha de Visitas ao Perfil:*\nInvestimento: R$ 400,00\nVisitas ao perfil: 1.120\nCusto por visita: R$ 0,36",
    formattedLine: "{{BLOCO_PERFIL}}",
    defaultChecked: false,
  },
  {
    key: "BLOCO_PAGINA",
    tag: "{{BLOCO_PAGINA}}",
    label: "Bloco Dedicado: Visualizações na Página / Cliques no Link",
    shortLabel: "Bloco Site / Link",
    section: "objectives",
    sectionLabel: "Por Objetivo",
    whereItAppears: "Na seção de objetivos específicos",
    explanation: "Exibe exclusivamente o Investimento, Visitas/Cliques e Custo por Visualização das campanhas de site, estoque ou cardápio.",
    exampleOutput: "*Visualizações na Página:*\nInvestimento: R$ 450,00\nResultados: 980 visitas\nCusto por visualizações: R$ 0,46",
    formattedLine: "{{BLOCO_PAGINA}}",
    defaultChecked: false,
  },

  // 4. CAMPAIGNS
  {
    key: "LISTA_CAMPANHAS_RESUMO",
    tag: "{{LISTA_CAMPANHAS_RESUMO}}",
    label: "Lista Enxuta por Campanha (Visão Direta)",
    shortLabel: "Lista Enxuta de Campanhas",
    section: "campaigns",
    sectionLabel: "Por Campanha",
    whereItAppears: "Na seção de Campanhas (formato direto)",
    explanation: "Lista cada campanha em formato compacto com Nome, Investimento, Resultados e Custo por Resultado (ideal para o modelo Por Campanha).",
    exampleOutput: "• *MSG | ESTOQUE SEMINOVOS* — R$ 1.850,00 | 310 leads (R$ 5,97)",
    formattedLine: "{{LISTA_CAMPANHAS_RESUMO}}",
    defaultChecked: false,
  },
  {
    key: "LISTA_CAMPANHAS",
    tag: "{{LISTA_CAMPANHAS}}",
    label: "Detalhamento Completo por Campanha (Visão Analítica)",
    shortLabel: "Detalhe Completo de Campanhas",
    section: "campaigns",
    sectionLabel: "Detalhe de Campanha",
    whereItAppears: "Na seção de Detalhamento de Campanhas",
    explanation: "Exibe a ficha completa de cada campanha (e conjunto/anúncio se selecionado) com Plataforma, Investimento, Resultados, CPL/CPM e Alcance.",
    exampleOutput: "🎯 *MSG | ESTOQUE SEMINOVOS*\n   💵 Investimento: R$ 1.850,00\n   📈 Resultados: 310\n   💲 Custo/Resultado: R$ 5,97\n   👥 Alcance: 32.400",
    formattedLine: "{{LISTA_CAMPANHAS}}",
    defaultChecked: true,
  },
  {
    key: "BLOCO_ECOMMERCE",
    tag: "{{BLOCO_ECOMMERCE}}",
    label: "Fechamento de Vendas / Site / Cardápio (Faturamento & Pedidos)",
    shortLabel: "Fechamento E-commerce / Cardápio",
    section: "campaigns",
    sectionLabel: "Vendas & Conversão",
    whereItAppears: "Abaixo do detalhamento de campanhas",
    explanation: "Exibe o Faturamento Líquido, Pedidos Finalizados no Site/Cardápio e o cálculo automático da Taxa de Conversão.",
    exampleOutput: "*No site/Cardápio:*\n Faturamento Líquido: R$ 25.538,08\n Resultados: 244 pedidos finalizados",
    formattedLine: "{{BLOCO_ECOMMERCE}}",
    defaultChecked: false,
  },

  // 5. FOOTER
  {
    key: "AGENCIA",
    tag: "{{AGENCIA}}",
    label: "Assinatura Oficial da Agência",
    shortLabel: "Assinatura da Agência",
    section: "footer",
    sectionLabel: "Rodapé",
    whereItAppears: "Na última linha da mensagem",
    explanation: "Insere o nome da sua agência em destaque no encerramento do relatório.",
    exampleOutput: "━━━━━━━━━━━━━━━━━━━━\n*NC AGÊNCIA*",
    formattedLine: "*{{AGENCIA}}*",
    defaultChecked: true,
  },
];

// ─── Templates Oficiais do Sistema (Sempre visíveis e editáveis no Gerenciador) ───
export const SYSTEM_REPORT_TEMPLATES: ReportTemplateRecord[] = [
  {
    id: "standard_auto",
    name: "⭐ Padrão NC (Veículos / Leads / Consignado)",
    description: "Modelo enxuto oficial da NC separado por frentes (Mensagens nos Veículos, Alcance, Consignado, Visitas ao Perfil e Site).",
    pdf_layout: "minimalist",
    is_system: true,
    system_mode: "standard_auto",
    variant_type: "sector",
    message_template: `Relatório mensal: 
Loja: {{NOME_CLIENTE}}
 *Período:* {{PERIODO}}

{{BLOCO_VEICULOS}}

{{BLOCO_ALCANCE}}

{{BLOCO_CONSIGNADO}}

{{BLOCO_PERFIL}}

{{BLOCO_PAGINA}}`,
  },
  {
    id: "objective",
    name: "🎯 Apenas por Tipo / Objetivo",
    description: "Apresenta o cabeçalho, os totais gerais consolidados e o agrupamento automático por objetivo de campanha.",
    pdf_layout: "analytical",
    is_system: true,
    system_mode: "objective",
    variant_type: "objective",
    message_template: `📊 *RELATÓRIO DE RESULTADOS*
━━━━━━━━━━━━━━━━━━━━
🏢 *Cliente:* {{NOME_CLIENTE}}
📅 *Período:* {{PERIODO}}
📱 *Plataformas:* {{PLATAFORMAS}}

━━━━━━━━━━━━━━━━━━━━
*📊 TOTAIS GERAIS*
━━━━━━━━━━━━━━━━━━━━
💵 *Investimento Total:* {{INVESTIMENTO}}
📈 *Resultados Totais:* {{TOTAL_RESULTADOS}}
💲 *CPA Médio Geral:* {{CPA_MEDIO}}
👥 *Alcance Total:* {{ALCANCE_TOTAL}}
👁️ *Impressões Totais:* {{IMPRESSOES_TOTAIS}}
📌 *Campanhas no Relatório:* {{TOTAL_CAMPANHAS}}

━━━━━━━━━━━━━━━━━━━━
*RESULTADOS POR OBJETIVO*
━━━━━━━━━━━━━━━━━━━━

{{RESULTADOS_POR_TIPO}}

━━━━━━━━━━━━━━━━━━━━
*{{AGENCIA}}*`,
  },
  {
    id: "campaigns",
    name: "📌 Apenas Métrica de Campanhas",
    description: "Apresenta o cabeçalho, os totais gerais consolidados e a lista individual de cada campanha sem o agrupamento intermediário.",
    pdf_layout: "minimalist",
    is_system: true,
    system_mode: "campaigns",
    variant_type: "campaigns",
    message_template: `📊 *RELATÓRIO DE PERFORMANCE*
━━━━━━━━━━━━━━━━━━━━
🏢 *Cliente:* {{NOME_CLIENTE}}
📅 *Período:* {{PERIODO}}
📱 *Plataformas:* {{PLATAFORMAS}}

━━━━━━━━━━━━━━━━━━━━
*📊 TOTAIS GERAIS*
━━━━━━━━━━━━━━━━━━━━
💵 *Investimento Total:* {{INVESTIMENTO}}
📈 *Resultados Totais:* {{TOTAL_RESULTADOS}}
💲 *CPA Médio Geral:* {{CPA_MEDIO}}
👥 *Alcance Total:* {{ALCANCE_TOTAL}}
👁️ *Impressões Totais:* {{IMPRESSOES_TOTAIS}}
📌 *Campanhas no Relatório:* {{TOTAL_CAMPANHAS}}

━━━━━━━━━━━━━━━━━━━━
*DETALHAMENTO DE CAMPANHAS*
━━━━━━━━━━━━━━━━━━━━

{{LISTA_CAMPANHAS}}

━━━━━━━━━━━━━━━━━━━━
*{{AGENCIA}}*`,
  },
  {
    id: "complete",
    name: "📊 Completo Analítico (Objetivo + Detalhe de Campanha)",
    description: "Relatório executivo completo contendo Totais Gerais, Resultados Agrupados por Objetivo e Ficha Detalhada de cada Campanha.",
    pdf_layout: "classic",
    is_system: true,
    system_mode: "complete",
    variant_type: "complete",
    message_template: `📊 *RELATÓRIO DE PERFORMANCE*
━━━━━━━━━━━━━━━━━━━━
🏢 *Cliente:* {{NOME_CLIENTE}}
📅 *Período:* {{PERIODO}}
📱 *Plataformas:* {{PLATAFORMAS}}

━━━━━━━━━━━━━━━━━━━━
*📊 TOTAIS GERAIS*
━━━━━━━━━━━━━━━━━━━━
💵 *Investimento Total:* {{INVESTIMENTO}}
📈 *Resultados Totais:* {{TOTAL_RESULTADOS}}
💲 *CPA Médio Geral:* {{CPA_MEDIO}}
👥 *Alcance Total:* {{ALCANCE_TOTAL}}
👁️ *Impressões Totais:* {{IMPRESSOES_TOTAIS}}
📌 *Campanhas no Relatório:* {{TOTAL_CAMPANHAS}}

━━━━━━━━━━━━━━━━━━━━
*RESULTADOS POR OBJETIVO*
━━━━━━━━━━━━━━━━━━━━

{{RESULTADOS_POR_TIPO}}

━━━━━━━━━━━━━━━━━━━━
*DETALHAMENTO DE CAMPANHAS*
━━━━━━━━━━━━━━━━━━━━

{{LISTA_CAMPANHAS}}

━━━━━━━━━━━━━━━━━━━━
*{{AGENCIA}}*`,
  },
  {
    id: "ecommerce_sales",
    name: "🍕 Vendas / Cardápio / E-commerce (Site & Pedidos)",
    description: "Modelo focado em operações de venda direta, cardápio digital e e-commerce com cálculo de taxa de conversão e faturamento.",
    pdf_layout: "analytical",
    is_system: true,
    system_mode: "ecommerce_sales",
    variant_type: "custom",
    message_template: `Relatório mensal: 
Loja: {{NOME_CLIENTE}}
 *Período:* {{PERIODO}}

*Totais Gerais:*
💵 *Investimento Total:* {{INVESTIMENTO}}
👥 *Alcance Total:* {{ALCANCE_TOTAL}}
👁️ *Impressões Totais:* {{IMPRESSOES_TOTAIS}}

{{BLOCO_PAGINA}}

{{BLOCO_ECOMMERCE}}`,
  },
];

// ─── Detecta quais parâmetros estão ativos em um texto de template ───
export function getCheckedParametersFromText(templateText: string): Record<string, boolean> {
  const map: Record<string, boolean> = {};
  for (const param of REPORT_TEMPLATE_PARAMETERS) {
    map[param.key] = templateText.includes(param.tag);
  }
  return map;
}

// ─── Constrói um template estruturado nas posições designadas a partir do Checklist ───
export function buildTemplateFromChecklist(
  checked: Record<string, boolean>,
  options?: {
    headerTitle?: string;
    variant?: "complete" | "objective" | "campaigns" | "sector";
  }
): string {
  const variant = options?.variant || "complete";
  const headerTitle =
    options?.headerTitle ||
    (variant === "objective"
      ? "RELATÓRIO DE RESULTADOS POR OBJETIVO"
      : variant === "campaigns"
      ? "RELATÓRIO POR CAMPANHA"
      : variant === "sector"
      ? "RELATÓRIO DE PERFORMANCE"
      : "RELATÓRIO DE PERFORMANCE");

  // Se for variação setorial enxuta (estilo Padrão NC)
  if (variant === "sector") {
    const lines: string[] = [`Relatório mensal:`];
    if (checked.NOME_CLIENTE) lines.push(`Loja: {{NOME_CLIENTE}}`);
    if (checked.PERIODO) lines.push(` *Período:* {{PERIODO}}`);
    if (checked.PLATAFORMAS) lines.push(` *Plataformas:* {{PLATAFORMAS}}`);
    lines.push("");

    const totalLines: string[] = [];
    if (checked.INVESTIMENTO) totalLines.push(`💵 *Investimento Total:* {{INVESTIMENTO}}`);
    if (checked.TOTAL_RESULTADOS) totalLines.push(`📈 *Resultados Totais:* {{TOTAL_RESULTADOS}}`);
    if (checked.CPA_MEDIO) totalLines.push(`💲 *CPA Médio Geral:* {{CPA_MEDIO}}`);
    if (checked.ALCANCE_TOTAL) totalLines.push(`👥 *Alcance Total:* {{ALCANCE_TOTAL}}`);
    if (checked.IMPRESSOES_TOTAIS) totalLines.push(`👁️ *Impressões Totais:* {{IMPRESSOES_TOTAIS}}`);
    if (checked.TOTAL_CAMPANHAS) totalLines.push(`📌 *Campanhas no Relatório:* {{TOTAL_CAMPANHAS}}`);
    if (totalLines.length > 0) {
      lines.push(`*Totais Gerais:*`, ...totalLines, "");
    }

    if (checked.BLOCO_VEICULOS) lines.push(`{{BLOCO_VEICULOS}}`, "");
    if (checked.BLOCO_ALCANCE) lines.push(`{{BLOCO_ALCANCE}}`, "");
    if (checked.BLOCO_CONSIGNADO) lines.push(`{{BLOCO_CONSIGNADO}}`, "");
    if (checked.BLOCO_PERFIL) lines.push(`{{BLOCO_PERFIL}}`, "");
    if (checked.BLOCO_PAGINA) lines.push(`{{BLOCO_PAGINA}}`, "");
    if (
      !checked.BLOCO_VEICULOS &&
      !checked.BLOCO_ALCANCE &&
      !checked.BLOCO_CONSIGNADO &&
      !checked.BLOCO_PERFIL &&
      !checked.BLOCO_PAGINA &&
      checked.RESULTADOS_POR_TIPO
    ) {
      lines.push(`{{RESULTADOS_POR_TIPO}}`, "");
    }

    if (checked.BLOCO_ECOMMERCE) lines.push(`{{BLOCO_ECOMMERCE}}`, "");
    if (checked.AGENCIA) lines.push(`━━━━━━━━━━━━━━━━━━━━`, `*{{AGENCIA}}*`);

    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  // Estrutura executiva organizada por zonas designadas
  const sections: string[] = [];

  // ZONA 1: Cabeçalho
  const headerLines: string[] = [
    `📊 *${headerTitle}*`,
    `━━━━━━━━━━━━━━━━━━━━`,
  ];
  for (const p of REPORT_TEMPLATE_PARAMETERS.filter((x) => x.section === "header")) {
    if (checked[p.key]) {
      headerLines.push(p.formattedLine);
    }
  }
  sections.push(headerLines.join("\n"));

  // ZONA 2: Totais Gerais
  const totalParams = REPORT_TEMPLATE_PARAMETERS.filter((x) => x.section === "totals" && checked[x.key]);
  if (totalParams.length > 0) {
    const totalLines: string[] = [
      `━━━━━━━━━━━━━━━━━━━━`,
      `*📊 TOTAIS GERAIS*`,
      `━━━━━━━━━━━━━━━━━━━━`,
      ...totalParams.map((p) => p.formattedLine),
    ];
    sections.push(totalLines.join("\n"));
  }

  // ZONA 3: Resultados por Objetivo (incluído se variant !== 'campaigns')
  if (variant !== "campaigns") {
    const objParams = REPORT_TEMPLATE_PARAMETERS.filter((x) => x.section === "objectives" && checked[x.key]);
    if (objParams.length > 0) {
      const objLines: string[] = [
        `━━━━━━━━━━━━━━━━━━━━`,
        `*RESULTADOS POR OBJETIVO*`,
        `━━━━━━━━━━━━━━━━━━━━`,
        "",
        ...objParams.map((p) => p.formattedLine),
      ];
      sections.push(objLines.join("\n"));
    } else if (variant === "objective") {
      sections.push(
        [
          `━━━━━━━━━━━━━━━━━━━━`,
          `*RESULTADOS POR OBJETIVO*`,
          `━━━━━━━━━━━━━━━━━━━━`,
          "",
          `{{RESULTADOS_POR_TIPO}}`,
        ].join("\n")
      );
    }
  }

  // ZONA 4: Campanhas / Detalhamento (incluído se variant !== 'objective')
  if (variant !== "objective") {
    const campParams = REPORT_TEMPLATE_PARAMETERS.filter((x) => x.section === "campaigns" && checked[x.key]);
    if (campParams.length > 0) {
      const sectionHeading =
        variant === "campaigns" && checked.LISTA_CAMPANHAS_RESUMO && !checked.LISTA_CAMPANHAS
          ? "*RESUMO POR CAMPANHA*"
          : "*DETALHAMENTO DE CAMPANHAS*";
      const campLines: string[] = [
        `━━━━━━━━━━━━━━━━━━━━`,
        sectionHeading,
        `━━━━━━━━━━━━━━━━━━━━`,
        "",
        ...campParams.map((p) => p.formattedLine),
      ];
      sections.push(campLines.join("\n"));
    } else if (variant === "campaigns") {
      sections.push(
        [
          `━━━━━━━━━━━━━━━━━━━━`,
          `*RESUMO POR CAMPANHA*`,
          `━━━━━━━━━━━━━━━━━━━━`,
          "",
          `{{LISTA_CAMPANHAS_RESUMO}}`,
        ].join("\n")
      );
    }
  }

  // ZONA 5: Rodapé
  const footerParams = REPORT_TEMPLATE_PARAMETERS.filter((x) => x.section === "footer" && checked[x.key]);
  if (footerParams.length > 0) {
    sections.push(
      [`━━━━━━━━━━━━━━━━━━━━`, ...footerParams.map((p) => p.formattedLine)].join("\n")
    );
  }

  return sections.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
}

// ─── Insere ou remove um parâmetro exatamente no seu local designado do texto ───
export function toggleParameterInTemplateText(
  currentText: string,
  paramKey: string,
  enable: boolean
): string {
  const param = REPORT_TEMPLATE_PARAMETERS.find((p) => p.key === paramKey);
  if (!param) return currentText;

  if (!enable) {
    // Remove a linha que contém a tag
    const lines = currentText.split("\n");
    const filtered = lines.filter((line) => !line.includes(param.tag));
    return filtered.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  // Se já existe no texto, não duplica
  if (currentText.includes(param.tag)) return currentText;

  // Insere na posição designada procurando outros parâmetros da mesma seção
  const sameSectionParams = REPORT_TEMPLATE_PARAMETERS.filter((p) => p.section === param.section);
  const lines = currentText.split("\n");

  let lastMatchingLineIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (sameSectionParams.some((sp) => lines[i].includes(sp.tag))) {
      lastMatchingLineIdx = i;
    }
  }

  if (lastMatchingLineIdx !== -1) {
    lines.splice(lastMatchingLineIdx + 1, 0, param.formattedLine);
    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  // Se a seção inteira ainda não existia no texto, reconstrói preservando o texto ou insere na zona correta
  const currentChecked = getCheckedParametersFromText(currentText);
  currentChecked[paramKey] = true;

  if (param.section === "header") {
    // Insere logo após a primeira linha de título/separador
    const insertIdx = Math.min(2, lines.length);
    lines.splice(insertIdx, 0, param.formattedLine);
    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  if (param.section === "totals") {
    // Insere logo após o cabeçalho
    let headerEndIdx = 0;
    for (let i = 0; i < lines.length; i++) {
      if (
        REPORT_TEMPLATE_PARAMETERS.filter((p) => p.section === "header").some((hp) =>
          lines[i].includes(hp.tag)
        )
      ) {
        headerEndIdx = i + 1;
      }
    }
    const block = [
      "",
      `━━━━━━━━━━━━━━━━━━━━`,
      `*📊 TOTAIS GERAIS*`,
      `━━━━━━━━━━━━━━━━━━━━`,
      param.formattedLine,
    ];
    lines.splice(headerEndIdx, 0, ...block);
    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  if (param.section === "objectives") {
    // Insere antes da seção de campanhas ou antes do rodapé
    let beforeIdx = lines.length;
    for (let i = 0; i < lines.length; i++) {
      if (
        lines[i].includes("CAMPANHA") ||
        lines[i].includes("{{LISTA_CAMPANHAS") ||
        lines[i].includes("{{AGENCIA}}")
      ) {
        beforeIdx = Math.max(0, i - 1);
        break;
      }
    }
    const block = [
      "",
      `━━━━━━━━━━━━━━━━━━━━`,
      `*RESULTADOS POR OBJETIVO*`,
      `━━━━━━━━━━━━━━━━━━━━`,
      "",
      param.formattedLine,
      "",
    ];
    lines.splice(beforeIdx, 0, ...block);
    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  if (param.section === "campaigns") {
    // Insere antes do rodapé {{AGENCIA}} ou no final
    let beforeIdx = lines.length;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes("{{AGENCIA}}")) {
        beforeIdx = Math.max(0, i - 1);
        break;
      }
    }
    const block = [
      "",
      `━━━━━━━━━━━━━━━━━━━━`,
      `*DETALHAMENTO DE CAMPANHAS*`,
      `━━━━━━━━━━━━━━━━━━━━`,
      "",
      param.formattedLine,
      "",
    ];
    lines.splice(beforeIdx, 0, ...block);
    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  // Footer: adiciona no final
  return `${currentText.trim()}\n\n━━━━━━━━━━━━━━━━━━━━\n${param.formattedLine}`;
}

// ─── Gera automaticamente as variações a partir de um Template Base ───
export function generateVariationsFromBaseTemplate(
  baseName: string,
  baseTemplateText: string
): {
  variantKey: "objective" | "campaigns" | "complete" | "sector";
  title: string;
  badge: string;
  description: string;
  pdfLayout: "classic" | "analytical" | "minimalist";
  templateText: string;
}[] {
  const cleanBaseName = baseName
    .replace(/\s*—\s*(Por Objetivo|Por Campanha|Detalhe de Campanha|Completo|Padrão Setorial).*$/i, "")
    .trim() || "Modelo Personalizado";

  const checked = getCheckedParametersFromText(baseTemplateText);

  // Garantir que cabeçalho e totais marcados no base sejam respeitados em todas as variações
  const objChecked: Record<string, boolean> = {
    ...checked,
    RESULTADOS_POR_TIPO: true,
    LISTA_CAMPANHAS: false,
    LISTA_CAMPANHAS_RESUMO: false,
  };

  const campResumoChecked: Record<string, boolean> = {
    ...checked,
    RESULTADOS_POR_TIPO: false,
    BLOCO_VEICULOS: false,
    BLOCO_ALCANCE: false,
    BLOCO_CONSIGNADO: false,
    BLOCO_PERFIL: false,
    BLOCO_PAGINA: false,
    LISTA_CAMPANHAS_RESUMO: true,
    LISTA_CAMPANHAS: false,
  };

  const campDetalheChecked: Record<string, boolean> = {
    ...checked,
    RESULTADOS_POR_TIPO: true,
    LISTA_CAMPANHAS: true,
    LISTA_CAMPANHAS_RESUMO: false,
  };

  const sectorChecked: Record<string, boolean> = {
    ...checked,
    BLOCO_VEICULOS: true,
    BLOCO_ALCANCE: true,
    BLOCO_CONSIGNADO: true,
    BLOCO_PERFIL: true,
    BLOCO_PAGINA: true,
  };

  return [
    {
      variantKey: "objective",
      title: `${cleanBaseName} — Por Objetivo`,
      badge: "🎯 Por Objetivo",
      description: "Mantém seu cabeçalho e totais escolhidos + agrupamento automático por Objetivo.",
      pdfLayout: "analytical",
      templateText: buildTemplateFromChecklist(objChecked, {
        headerTitle: "RELATÓRIO POR OBJETIVO",
        variant: "objective",
      }),
    },
    {
      variantKey: "campaigns",
      title: `${cleanBaseName} — Por Campanha`,
      badge: "📌 Por Campanha",
      description: "Mantém seu cabeçalho e totais escolhidos + lista direta de cada campanha.",
      pdfLayout: "minimalist",
      templateText: buildTemplateFromChecklist(campResumoChecked, {
        headerTitle: "RELATÓRIO POR CAMPANHA",
        variant: "campaigns",
      }),
    },
    {
      variantKey: "complete",
      title: `${cleanBaseName} — Detalhe de Campanha`,
      badge: "📊 Detalhe de Campanha",
      description: "Mantém seu cabeçalho e totais + Resultados por Objetivo + Ficha detalhada de cada campanha.",
      pdfLayout: "classic",
      templateText: buildTemplateFromChecklist(campDetalheChecked, {
        headerTitle: "RELATÓRIO DE PERFORMANCE COMPLETO",
        variant: "complete",
      }),
    },
    {
      variantKey: "sector",
      title: `${cleanBaseName} — Padrão Setorial (Frentes)`,
      badge: "⭐ Padrão por Frentes",
      description: "Formato enxuto separado por frentes (Mensagens nos Veículos, Alcance, Consignado, Perfil e Site).",
      pdfLayout: "minimalist",
      templateText: buildTemplateFromChecklist(sectorChecked, {
        variant: "sector",
      }),
    },
  ];
}

// ─── Campanhas de Exemplo Realistas para a Prévia quando nenhuma campanha estiver selecionada ───
export const SAMPLE_PREVIEW_CAMPAIGNS: ReportCampaignItem[] = [
  {
    id: "sample-1",
    name: "MSG | ESTOQUE SEMINOVOS [WHATSAPP]",
    cost: 2450.0,
    impressions: 58400,
    clicks: 1420,
    conversions: 385,
    reach: 34200,
    objective: "🚗 Mensagens nos veículos",
    platform: "meta",
    selected: true,
    campaignName: "MSG | ESTOQUE SEMINOVOS [WHATSAPP]",
  },
  {
    id: "sample-2",
    name: "REELS | OFERTAS DA SEMANA [ALCANCE]",
    cost: 680.0,
    impressions: 74500,
    clicks: 690,
    conversions: 74500,
    reach: 48900,
    objective: "👁️ Alcance e Impressões",
    platform: "meta",
    selected: true,
    campaignName: "REELS | OFERTAS DA SEMANA [ALCANCE]",
  },
  {
    id: "sample-3",
    name: "CAPTAÇÃO | COMPRAMOS SEU CARRO [CONSIGNADO]",
    cost: 790.0,
    impressions: 24100,
    clicks: 510,
    conversions: 112,
    reach: 16800,
    objective: "🚗 Consignado",
    platform: "meta",
    selected: true,
    campaignName: "CAPTAÇÃO | COMPRAMOS SEU CARRO [CONSIGNADO]",
  },
  {
    id: "sample-4",
    name: "TRÁFEGO | VISITAS AO PERFIL INSTAGRAM",
    cost: 420.0,
    impressions: 31200,
    clicks: 1180,
    conversions: 1180,
    reach: 21500,
    objective: "📱 Visitas ao Perfil",
    platform: "meta",
    selected: true,
    campaignName: "TRÁFEGO | VISITAS AO PERFIL INSTAGRAM",
  },
];

// ─── Renderizador Unificado de Template (Usado tanto na Prévia quanto no Relatório Real) ───
export function renderReportTemplateText(params: {
  templateText: string;
  campaigns: ReportCampaignItem[];
  clientName?: string;
  periodText?: string;
  agencyName?: string;
  reportLevel?: "campaign" | "adset" | "ad";
  isVehicleContext?: boolean;
  salesRevenue?: string;
  salesOrders?: string;
}): string {
  const {
    templateText,
    campaigns,
    clientName = "LumaCar Multimarcas",
    periodText = "NOVEMBRO 2026",
    agencyName = "NC AGÊNCIA",
    reportLevel = "campaign",
    isVehicleContext = true,
    salesRevenue = "25.538,08",
    salesOrders = "244",
  } = params;

  const selected = campaigns.filter((c) => c.selected);
  if (selected.length === 0) return "";

  const totalCost = selected.reduce((sum, c) => sum + c.cost, 0);
  const totalReach = selected.reduce((sum, c) => sum + c.reach, 0);
  const totalImps = selected.reduce((sum, c) => sum + c.impressions, 0);

  const groupedTypes = new Map<
    string,
    { cost: number; results: number; reach: number; impressions: number }
  >();
  const platforms = new Set<string>();

  selected.forEach((c) => {
    platforms.add(c.platform === "google" ? "Google Ads" : "Meta Ads");
    const isClickBased = c.objective.includes("Cliques");
    const isReachBased =
      c.objective.includes("Alcance") ||
      c.objective.includes("Visualizações") ||
      c.objective.includes("Engajamento") ||
      c.objective.includes("Impressões") ||
      c.objective.includes("Thru-Play");

    let resultValue = c.conversions;
    if (isClickBased) resultValue = c.clicks;
    if (isReachBased) resultValue = c.impressions;

    const cur = groupedTypes.get(c.objective) || {
      cost: 0,
      results: 0,
      reach: 0,
      impressions: 0,
    };
    cur.cost += c.cost;
    cur.results += resultValue;
    cur.reach += c.reach;
    cur.impressions += c.impressions;
    groupedTypes.set(c.objective, cur);
  });

  const totalResults = Array.from(groupedTypes.values()).reduce(
    (sum, g) => sum + g.results,
    0
  );
  const avgCpa = totalResults > 0 ? totalCost / totalResults : 0;
  const platformString = Array.from(platforms).join(" & ") || "Meta Ads";

  let text = templateText;

  // 1. Substituições de Cabeçalho & Totais
  text = text.replace(/\{\{NOME_CLIENTE\}\}/g, clientName || "Cliente");
  text = text.replace(/\{\{PERIODO\}\}/g, periodText || "Período Atual");
  text = text.replace(/\{\{PLATAFORMAS\}\}/g, platformString);
  text = text.replace(/\{\{TOTAL_CAMPANHAS\}\}/g, selected.length.toString());
  text = text.replace(
    /\{\{INVESTIMENTO\}\}/g,
    `R$ ${totalCost.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  );
  text = text.replace(/\{\{TOTAL_RESULTADOS\}\}/g, totalResults.toLocaleString("pt-BR"));
  text = text.replace(
    /\{\{CPA_MEDIO\}\}/g,
    `R$ ${avgCpa.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  );
  text = text.replace(/\{\{ALCANCE_TOTAL\}\}/g, totalReach.toLocaleString("pt-BR"));
  text = text.replace(/\{\{IMPRESSOES_TOTAIS\}\}/g, totalImps.toLocaleString("pt-BR"));
  text = text.replace(/\{\{AGENCIA\}\}/g, agencyName.toUpperCase());

  // 2. Classificadores de Blocos Setoriais
  const isConsignado = (c: ReportCampaignItem) =>
    /consignado/i.test(c.name) || c.objective.toLowerCase().includes("consignado");
  const isReachOrImpression = (c: ReportCampaignItem) =>
    c.objective.includes("Alcance") ||
    c.objective.includes("Thru-Play") ||
    c.objective.includes("Vídeo") ||
    /alcance|reconhecimento|impress[õo]es|plays|vídeo|video|artes/i.test(c.name);
  const isProfile = (c: ReportCampaignItem) =>
    c.objective.includes("Perfil") ||
    /visita.*perfil|perfil.*instagram|post.*instagram|insta/i.test(c.name);
  const isPage = (c: ReportCampaignItem) =>
    c.objective.includes("Página") ||
    c.objective.includes("Pagina") ||
    c.objective.includes("Cliques") ||
    /página.*destino|pagina.*destino|site|cardapio|landing|clique.*link|link.*click/i.test(c.name);
  const isCarMsg = (c: ReportCampaignItem) =>
    c.objective.includes("veículo") ||
    c.objective.includes("veiculo") ||
    c.objective.includes("Mensagens") ||
    c.objective.includes("WhatsApp") ||
    (!isConsignado(c) && !isReachOrImpression(c) && !isProfile(c) && !isPage(c));

  // {{BLOCO_VEICULOS}}
  if (text.includes("{{BLOCO_VEICULOS}}")) {
    const carCamps = selected.filter((c) => isCarMsg(c) && !isConsignado(c) && !isReachOrImpression(c));
    if (carCamps.length > 0) {
      const costMsg = carCamps.reduce((s, c) => s + c.cost, 0);
      const leadsMsg = carCamps.reduce(
        (s, c) => s + (c.conversions > 0 ? c.conversions : c.clicks > 0 ? c.clicks : 0),
        0
      );
      const cplMsg = leadsMsg > 0 ? costMsg / leadsMsg : 0;
      const heading = isVehicleContext
        ? `*Campanha de mensagens nos veiculos:*`
        : `*Campanha de Mensagens / WhatsApp:*`;
      const block = `${heading}\n Investimento: R$ ${costMsg.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n Total de leads: ${leadsMsg.toLocaleString("pt-BR")}\n Custo por lead: R$ ${cplMsg.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      text = text.replace(/\{\{BLOCO_VEICULOS\}\}/g, block);
    } else {
      text = text.replace(/\{\{BLOCO_VEICULOS\}\}/g, "");
    }
  }

  // {{BLOCO_ALCANCE}}
  if (text.includes("{{BLOCO_ALCANCE}}")) {
    const reachCamps = selected.filter((c) => isReachOrImpression(c) && !isConsignado(c));
    if (reachCamps.length > 0) {
      const costReach = reachCamps.reduce((s, c) => s + c.cost, 0);
      const impsReach = reachCamps.reduce(
        (s, c) => s + (c.impressions > 0 ? c.impressions : c.reach),
        0
      );
      const cpmReach = impsReach > 0 ? (costReach / impsReach) * 1000 : 0;
      const block = `*Campanha de Alcance e Impressões:*\nInvestimento: R$ ${costReach.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\nImpressões / Plays: ${impsReach.toLocaleString("pt-BR")}\nCPM: R$ ${cpmReach.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      text = text.replace(/\{\{BLOCO_ALCANCE\}\}/g, block);
    } else {
      text = text.replace(/\{\{BLOCO_ALCANCE\}\}/g, "");
    }
  }

  // {{BLOCO_CONSIGNADO}}
  if (text.includes("{{BLOCO_CONSIGNADO}}")) {
    const consCamps = selected.filter((c) => isConsignado(c));
    if (consCamps.length > 0) {
      const costCons = consCamps.reduce((s, c) => s + c.cost, 0);
      const leadsCons = consCamps.reduce((s, c) => s + (c.conversions > 0 ? c.conversions : 0), 0);
      const cplCons = leadsCons > 0 ? costCons / leadsCons : 0;
      const block = `*Campanha de consignado*\nTotal de leads: ${leadsCons.toLocaleString("pt-BR")}\nCusto por leads: R$ ${cplCons.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\nInvestimento: R$ ${costCons.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      text = text.replace(/\{\{BLOCO_CONSIGNADO\}\}/g, block);
    } else {
      text = text.replace(/\{\{BLOCO_CONSIGNADO\}\}/g, "");
    }
  }

  // {{BLOCO_PERFIL}}
  if (text.includes("{{BLOCO_PERFIL}}")) {
    const profCamps = selected.filter(
      (c) => isProfile(c) && !isReachOrImpression(c) && !isConsignado(c)
    );
    if (profCamps.length > 0) {
      const costProf = profCamps.reduce((s, c) => s + c.cost, 0);
      const visitsProf = profCamps.reduce(
        (s, c) => s + (c.conversions > 0 ? c.conversions : c.clicks > 0 ? c.clicks : 0),
        0
      );
      const cpvProf = visitsProf > 0 ? costProf / visitsProf : 0;
      const block = `*Campanha de Visitas ao Perfil:*\nInvestimento: R$ ${costProf.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\nVisitas ao perfil: ${visitsProf.toLocaleString("pt-BR")}\nCusto por visita: R$ ${cpvProf.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      text = text.replace(/\{\{BLOCO_PERFIL\}\}/g, block);
    } else {
      text = text.replace(/\{\{BLOCO_PERFIL\}\}/g, "");
    }
  }

  // {{BLOCO_PAGINA}}
  if (text.includes("{{BLOCO_PAGINA}}")) {
    const pageCamps = selected.filter(
      (c) => isPage(c) && !isReachOrImpression(c) && !isConsignado(c)
    );
    if (pageCamps.length > 0) {
      const costViews = pageCamps.reduce((s, c) => s + c.cost, 0);
      const visitsViews = pageCamps.reduce(
        (s, c) => s + (c.conversions > 0 ? c.conversions : c.clicks > 0 ? c.clicks : 0),
        0
      );
      const cpView = visitsViews > 0 ? costViews / visitsViews : 0;
      const block = `*Visualizações na Página / Cliques:*\nInvestimento: R$ ${costViews.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\nResultados: ${visitsViews.toLocaleString("pt-BR")} visitas\nCusto por visita: R$ ${cpView.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      text = text.replace(/\{\{BLOCO_PAGINA\}\}/g, block);
    } else {
      text = text.replace(/\{\{BLOCO_PAGINA\}\}/g, "");
    }
  }

  // {{BLOCO_ECOMMERCE}}
  if (text.includes("{{BLOCO_ECOMMERCE}}")) {
    const numOrders = Number(String(salesOrders).replace(/\./g, "").replace(",", ".")) || 0;
    const parsedRevenue =
      Number(String(salesRevenue).replace(/[^\d.,]/g, "").replace(/\./g, "").replace(",", ".")) || 0;
    const formattedRevenue =
      parsedRevenue > 0
        ? parsedRevenue.toLocaleString("pt-BR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })
        : salesRevenue || "0,00";
    const block = `*No site/Cardápio:*\n Faturamento Líquido: R$ ${formattedRevenue}\n Resultados: ${numOrders.toLocaleString("pt-BR")} pedidos finalizados`;
    text = text.replace(/\{\{BLOCO_ECOMMERCE\}\}/g, block);
  }

  // 3. {{RESULTADOS_POR_TIPO}}
  if (text.includes("{{RESULTADOS_POR_TIPO}}")) {
    let typeText = "";
    groupedTypes.forEach((data, type) => {
      const isClick = type.includes("Cliques");
      const isReach =
        type.includes("Alcance") ||
        type.includes("Visualizações") ||
        type.includes("Engajamento") ||
        type.includes("Impressões") ||
        type.includes("Thru-Play");

      const cpl =
        data.results > 0
          ? isReach
            ? (data.cost / data.results) * 1000
            : data.cost / data.results
          : 0;

      let resultLabel = "Resultados";
      if (isClick) resultLabel = "Visitas";
      if (isReach) resultLabel = "Impressões";

      let costLabel = "CPL/CPA";
      if (isClick) costLabel = "Custo por Visita";
      if (isReach) costLabel = "CPM";

      typeText += `*${type}*\n`;
      typeText += `   💵 Investimento: R$ ${data.cost.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
      typeText += `   📈 ${resultLabel}: ${data.results.toLocaleString("pt-BR")}\n`;
      typeText += `   💲 ${costLabel}: R$ ${cpl.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n\n`;
    });
    text = text.replace(/\{\{RESULTADOS_POR_TIPO\}\}/g, typeText.trim());
  }

  // 4. {{LISTA_CAMPANHAS_RESUMO}}
  if (text.includes("{{LISTA_CAMPANHAS_RESUMO}}")) {
    let summaryText = "";
    selected.forEach((c) => {
      const isClick = c.objective.includes("Cliques");
      const isReach =
        c.objective.includes("Alcance") ||
        c.objective.includes("Visualizações") ||
        c.objective.includes("Engajamento") ||
        c.objective.includes("Impressões") ||
        c.objective.includes("Thru-Play");
      let resultValue = c.conversions;
      if (isClick) resultValue = c.clicks;
      if (isReach) resultValue = c.impressions;
      const costPerRes =
        resultValue > 0 ? (isReach ? (c.cost / resultValue) * 1000 : c.cost / resultValue) : 0;
      const unitLabel = isReach ? "impr." : isClick ? "cliques" : "leads";
      const costUnit = isReach ? "CPM" : "CPA";
      summaryText += `• *${c.name.toUpperCase()}*\n  💵 R$ ${c.cost.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} | 📈 ${resultValue.toLocaleString("pt-BR")} ${unitLabel} (${costUnit}: R$ ${costPerRes.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})\n\n`;
    });
    text = text.replace(/\{\{LISTA_CAMPANHAS_RESUMO\}\}/g, summaryText.trim());
  }

  // 5. {{LISTA_CAMPANHAS}}
  if (text.includes("{{LISTA_CAMPANHAS}}")) {
    let listText = "";
    selected.forEach((c) => {
      const isClick = c.objective.includes("Cliques");
      const isReach =
        c.objective.includes("Alcance") ||
        c.objective.includes("Visualizações") ||
        c.objective.includes("Engajamento") ||
        c.objective.includes("Impressões") ||
        c.objective.includes("Thru-Play");

      let resultValue = c.conversions;
      if (isClick) resultValue = c.clicks;
      if (isReach) resultValue = c.impressions;

      const costPerRes =
        resultValue > 0 ? (isReach ? (c.cost / resultValue) * 1000 : c.cost / resultValue) : 0;
      const costLabel = isReach ? "CPM" : "Custo/Resultado";
      const platIcon = c.platform === "google" ? "🌐" : "🎯";

      listText += `${platIcon} *${c.name.toUpperCase()}*\n`;
      if (reportLevel === "adset" && c.campaignName) {
        listText += `   📁 Campanha: ${c.campaignName}\n`;
      } else if (reportLevel === "ad") {
        if (c.adSetName) listText += `   📦 Conjunto: ${c.adSetName}\n`;
        if (c.campaignName) listText += `   📁 Campanha: ${c.campaignName}\n`;
      }
      listText += `   💵 Investimento: R$ ${c.cost.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
      listText += `   📈 Resultados: ${resultValue.toLocaleString("pt-BR")} ${isReach ? "impr." : ""}\n`;
      listText += `   💲 ${costLabel}: R$ ${costPerRes.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
      if (c.reach > 0) listText += `   👥 Alcance: ${c.reach.toLocaleString("pt-BR")}\n`;
      listText += `\n`;
    });
    text = text.replace(/\{\{LISTA_CAMPANHAS\}\}/g, listText.trim());
  }

  return text.replace(/\n{3,}/g, "\n\n").trim();
}

// ─── Persistência Híbrida Garantida (report_templates + agency_settings + localStorage) ───
const LOCAL_STORAGE_TEMPLATES_KEY = "nc_report_templates_catalog_v2";
const AGENCY_SETTINGS_TEMPLATES_KEY = "nc_report_templates_catalog";

function readLocalTemplates(): ReportTemplateRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_TEMPLATES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalTemplates(list: ReportTemplateRecord[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LOCAL_STORAGE_TEMPLATES_KEY, JSON.stringify(list));
  } catch {}
}

function normalizeDbTemplateRow(row: any): ReportTemplateRecord | null {
  if (!row || !row.id) return null;
  // Se message_template existe diretamente
  if (typeof row.message_template === "string" && row.message_template.trim()) {
    return {
      id: row.id,
      name: row.name || "Template Customizado",
      message_template: row.message_template,
      pdf_layout: row.pdf_layout || "classic",
      is_system: Boolean(row.is_system),
      variant_type: row.variant_type || "custom",
      group_id: row.group_id,
      description: row.description,
      created_at: row.created_at,
    };
  }
  // Se foi salvo em footer_text (JSON ou string pura)
  if (typeof row.footer_text === "string" && row.footer_text.trim()) {
    try {
      const parsed = JSON.parse(row.footer_text);
      if (parsed && typeof parsed.message_template === "string") {
        return {
          id: row.id,
          name: row.name || "Template Customizado",
          message_template: parsed.message_template,
          pdf_layout: parsed.pdf_layout || "classic",
          is_system: false,
          variant_type: parsed.variant_type || "custom",
          group_id: parsed.group_id,
          description: parsed.description,
          created_at: row.created_at,
        };
      }
    } catch {
      return {
        id: row.id,
        name: row.name || "Template Customizado",
        message_template: row.footer_text,
        pdf_layout: "classic",
        is_system: false,
        variant_type: "custom",
        created_at: row.created_at,
      };
    }
  }
  return null;
}

export async function fetchAllCustomReportTemplates(): Promise<ReportTemplateRecord[]> {
  const mergedMap = new Map<string, ReportTemplateRecord>();

  // 1. LocalStorage cache
  for (const item of readLocalTemplates()) {
    if (item?.id && item?.message_template) {
      mergedMap.set(item.id, item);
    }
  }

  // 2. agency_settings (compartilhado para toda a equipe)
  try {
    const { data: settingRow } = await (supabase as any)
      .from("agency_settings")
      .select("setting_value")
      .eq("setting_key", AGENCY_SETTINGS_TEMPLATES_KEY)
      .maybeSingle();

    if (settingRow?.setting_value) {
      const parsed = JSON.parse(settingRow.setting_value);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item?.id && item?.message_template) {
            mergedMap.set(item.id, item);
          }
        }
      }
    }
  } catch {}

  // 3. report_templates table
  try {
    const { data: dbRows } = await (supabase as any)
      .from("report_templates")
      .select("*")
      .order("created_at", { ascending: false });

    if (Array.isArray(dbRows)) {
      for (const row of dbRows) {
        const norm = normalizeDbTemplateRow(row);
        if (norm) {
          mergedMap.set(norm.id, norm);
        }
      }
    }
  } catch {}

  const result = Array.from(mergedMap.values());
  writeLocalTemplates(result);
  return result;
}

async function syncTemplatesCatalogToAgencySettings(list: ReportTemplateRecord[]) {
  writeLocalTemplates(list);
  try {
    await (supabase as any)
      .from("agency_settings")
      .upsert(
        {
          setting_key: AGENCY_SETTINGS_TEMPLATES_KEY,
          setting_value: JSON.stringify(list),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "setting_key" }
      );
  } catch {}
}

export async function saveCustomReportTemplate(
  template: Omit<ReportTemplateRecord, "id"> & { id?: string }
): Promise<ReportTemplateRecord> {
  const existing = await fetchAllCustomReportTemplates();
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id || null;

  let savedId = template.id || `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  const packedFooter = JSON.stringify({
    message_template: template.message_template,
    pdf_layout: template.pdf_layout || "classic",
    variant_type: template.variant_type || "custom",
    group_id: template.group_id || null,
    description: template.description || "",
  });

  // Tenta salvar também na tabela report_templates usando o schema real (name, footer_text, is_default, user_id)
  try {
    if (template.id && !template.id.startsWith("tpl-")) {
      await (supabase as any)
        .from("report_templates")
        .update({
          name: template.name,
          footer_text: packedFooter,
        })
        .eq("id", template.id);
    } else {
      const { data: inserted } = await (supabase as any)
        .from("report_templates")
        .insert({
          name: template.name,
          footer_text: packedFooter,
          is_default: false,
          user_id: userId,
        })
        .select("id")
        .maybeSingle();
      if (inserted?.id) {
        savedId = inserted.id;
      }
    }
  } catch {}

  const record: ReportTemplateRecord = {
    id: savedId,
    name: template.name,
    message_template: template.message_template,
    pdf_layout: template.pdf_layout || "classic",
    is_system: false,
    variant_type: template.variant_type || "custom",
    group_id: template.group_id,
    description: template.description,
    created_at: new Date().toISOString(),
  };

  const nextList = [
    record,
    ...existing.filter((item) => item.id !== record.id && item.id !== template.id),
  ];
  await syncTemplatesCatalogToAgencySettings(nextList);
  return record;
}

export async function deleteCustomReportTemplate(id: string): Promise<void> {
  const existing = await fetchAllCustomReportTemplates();
  const nextList = existing.filter((item) => item.id !== id);
  await syncTemplatesCatalogToAgencySettings(nextList);
  try {
    await (supabase as any).from("report_templates").delete().eq("id", id);
  } catch {}
}

