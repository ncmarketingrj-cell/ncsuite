// ──────────────────────────────────────────────────────────────────────────────
// mindMapTemplates.ts — Modelos Estratégicos Profissionais no Estilo MindMeister
// ──────────────────────────────────────────────────────────────────────────────

export interface TemplateNode {
  id: string;
  parentId?: string;
  label: string;
  emoji?: string;
  color: string;
  bgColor?: string;
  note?: string;
  status?: "todo" | "inprogress" | "done" | "blocked";
  offsetX: number;
  offsetY: number;
}

export interface MindMapTemplate {
  id: string;
  title: string;
  category: "Trafego" | "Vendas" | "Criativos" | "Gestao";
  description: string;
  icon: string;
  rootEmoji: string;
  rootLabel: string;
  nodes: TemplateNode[];
}

export const MIND_MAP_TEMPLATES: MindMapTemplate[] = [
  {
    id: "funil-automotivo",
    title: "Funil de Vendas Automotivo",
    category: "Vendas",
    description: "Estrutura completa de atração, engajamento, conversão no WhatsApp e pós-venda para concessionárias e lojas.",
    icon: "Car",
    rootEmoji: "🚗",
    rootLabel: "Funil Automotivo de Alta Conversão",
    nodes: [
      // 1º Nível: Topo de Funil
      { id: "topo", label: "Topo de Funil (Atração)", emoji: "🚀", color: "#3b82f6", offsetX: 340, offsetY: -160, note: "Público frio: gerar atenção e curiosidade no feed e stories." },
      { id: "topo-1", parentId: "topo", label: "Vídeos de Pátio / Showroom", emoji: "📹", color: "#3b82f6", offsetX: 640, offsetY: -230 },
      { id: "topo-2", parentId: "topo", label: "Reels de Novidades do Estoque", emoji: "✨", color: "#3b82f6", offsetX: 640, offsetY: -160 },
      { id: "topo-3", parentId: "topo", label: "Tráfego Pago Aberto no RJ", emoji: "🎯", color: "#3b82f6", offsetX: 640, offsetY: -90 },

      // 1º Nível: Meio de Funil
      { id: "meio", label: "Meio de Funil (Consideração)", emoji: "🔍", color: "#8b5cf6", offsetX: 340, offsetY: 160, note: "Construção de autoridade, condições de pagamento e quebra de objeções." },
      { id: "meio-1", parentId: "meio", label: "Simulações de Financiamento", emoji: "💳", color: "#8b5cf6", offsetX: 640, offsetY: 90 },
      { id: "meio-2", parentId: "meio", label: "Depoimentos e Entregas Reais", emoji: "⭐", color: "#8b5cf6", offsetX: 640, offsetY: 160 },
      { id: "meio-3", parentId: "meio", label: "Comparativo de Custo-Benefício", emoji: "⚖️", color: "#8b5cf6", offsetX: 640, offsetY: 230 },

      // 1º Nível: Fundo de Funil
      { id: "fundo", label: "Fundo de Funil (WhatsApp)", emoji: "🔥", color: "#10b981", offsetX: -340, offsetY: -160, note: "Geração de lead qualificado e resposta rápida em até 5 minutos." },
      { id: "fundo-1", parentId: "fundo", label: "Anúncios 'Fale no WhatsApp'", emoji: "💬", color: "#10b981", offsetX: -640, offsetY: -230 },
      { id: "fundo-2", parentId: "fundo", label: "Campanha Limpa Estoque", emoji: "🏷️", color: "#10b981", offsetX: -640, offsetY: -160 },
      { id: "fundo-3", parentId: "fundo", label: "SLA de Resposta em 5 Minutos", emoji: "⚡", color: "#10b981", offsetX: -640, offsetY: -90 },

      // 1º Nível: Pós-Venda
      { id: "pos", label: "Retenção & Remarketing", emoji: "🔄", color: "#f59e0b", offsetX: -340, offsetY: 160, note: "Aproveitar a base para indicações e revisões." },
      { id: "pos-1", parentId: "pos", label: "Pesquisa de Satisfação", emoji: "📋", color: "#f59e0b", offsetX: -640, offsetY: 90 },
      { id: "pos-2", parentId: "pos", label: "Indicação Premiada", emoji: "🎁", color: "#f59e0b", offsetX: -640, offsetY: 160 },
      { id: "pos-3", parentId: "pos", label: "Troca com Troco (12-24 meses)", emoji: "🔁", color: "#f59e0b", offsetX: -640, offsetY: 230 },
    ],
  },
  {
    id: "meta-ads-structure",
    title: "Estrutura de Conta Meta Ads",
    category: "Trafego",
    description: "Arquitetura profissional de campanhas de tráfego pago: validação ABO, escala CBO e remarketing dinâmico.",
    icon: "Target",
    rootEmoji: "🎯",
    rootLabel: "Estrutura Meta Ads — NC Suite",
    nodes: [
      { id: "abo", label: "Validação de Criativos (ABO)", emoji: "🧪", color: "#3b82f6", offsetX: 350, offsetY: -150, note: "Orçamento a nível de conjunto para testar novos anúncios." },
      { id: "abo-1", parentId: "abo", label: "Público Aberto (Broad)", emoji: "🌐", color: "#3b82f6", offsetX: 660, offsetY: -200 },
      { id: "abo-2", parentId: "abo", label: "Público por Interesses Automotivos", emoji: "👥", color: "#3b82f6", offsetX: 660, offsetY: -100 },

      { id: "cbo", label: "Campanha de Escala (CBO)", emoji: "📈", color: "#10b981", offsetX: 350, offsetY: 150, note: "Distribuição inteligente para os melhores criativos validados." },
      { id: "cbo-1", parentId: "cbo", label: "Criativos Vencedores Validados", emoji: "🏆", color: "#10b981", offsetX: 660, offsetY: 100 },
      { id: "cbo-2", parentId: "cbo", label: "Orçamento Concentrado R$ 150+/dia", emoji: "💰", color: "#10b981", offsetX: 660, offsetY: 200 },

      { id: "rmk", label: "Remarketing de Precisão", emoji: "🎯", color: "#ec4899", offsetX: -350, offsetY: -150, note: "Pessoas que já demonstraram interesse recente." },
      { id: "rmk-1", parentId: "rmk", label: "Engajamento Instagram 30 Dias", emoji: "📱", color: "#ec4899", offsetX: -660, offsetY: -200 },
      { id: "rmk-2", parentId: "rmk", label: "Iniciadores de Mensagem no Whats", emoji: "💬", color: "#ec4899", offsetX: -660, offsetY: -100 },

      { id: "kpi", label: "Metas & Guardiões de CPL", emoji: "🛡️", color: "#f97316", offsetX: -350, offsetY: 150, note: "Travas de segurança e automações de alerta." },
      { id: "kpi-1", parentId: "kpi", label: "Meta CPL WhatsApp: R$ 5,00", emoji: "🎯", color: "#f97316", offsetX: -660, offsetY: 100 },
      { id: "kpi-2", parentId: "kpi", label: "CTR Médio Acima de 0,80%", emoji: "📊", color: "#f97316", offsetX: -660, offsetY: 200 },
    ],
  },
  {
    id: "criativos-alta-conversao",
    title: "Motor de Criativos Validados",
    category: "Criativos",
    description: "Framework de roteirização, gravação, edição e variação de criativos para bater metas de conversão.",
    icon: "Palette",
    rootEmoji: "🎬",
    rootLabel: "Motor de Criativos Automotivos",
    nodes: [
      { id: "gancho", label: "Ganchos de 3 Segundos (Hook)", emoji: "🪝", color: "#e11d48", offsetX: 340, offsetY: -140 },
      { id: "g-1", parentId: "gancho", label: "Parcela que Cabe no Bolso", emoji: "💸", color: "#e11d48", offsetX: 630, offsetY: -180 },
      { id: "g-2", parentId: "gancho", label: "Veículo Impecável no Showroom", emoji: "✨", color: "#e11d48", offsetX: 630, offsetY: -100 },

      { id: "corpo", label: "Roteiro & Prova Social", emoji: "📜", color: "#8b5cf6", offsetX: 340, offsetY: 140 },
      { id: "c-1", parentId: "corpo", label: "Apresentação em 360 Graus", emoji: "🔄", color: "#8b5cf6", offsetX: 630, offsetY: 100 },
      { id: "c-2", parentId: "corpo", label: "Condições Especiais de Entrada", emoji: "🤝", color: "#8b5cf6", offsetX: 630, offsetY: 180 },

      { id: "cta", label: "Chamada para Ação (CTA)", emoji: "📣", color: "#10b981", offsetX: -340, offsetY: -140 },
      { id: "cta-1", parentId: "cta", label: "'Clique no Botão para Simular'", emoji: "👉", color: "#10b981", offsetX: -630, offsetY: -180 },
      { id: "cta-2", parentId: "cta", label: "Qualificador de Entrada no Whats", emoji: "⚡", color: "#10b981", offsetX: -630, offsetY: -100 },

      { id: "formatos", label: "Formatos & Distribuição", emoji: "📐", color: "#06b6d4", offsetX: -340, offsetY: 140 },
      { id: "f-1", parentId: "formatos", label: "Reels / Stories Vertical 9:16", emoji: "📱", color: "#06b6d4", offsetX: -630, offsetY: 100 },
      { id: "f-2", parentId: "formatos", label: "Feed Retangular 4:5", emoji: "🖼️", color: "#06b6d4", offsetX: -630, offsetY: 180 },
    ],
  },
  {
    id: "planejamento-estrategico",
    title: "Planejamento Estratégico & OKRs",
    category: "Gestao",
    description: "Alinhamento de metas da agência, clientes prioritários, rotinas de otimização e indicadores de receita.",
    icon: "Briefcase",
    rootEmoji: "🎯",
    rootLabel: "Planejamento Estratégico — Agência",
    nodes: [
      { id: "receita", label: "Metas de Faturamento & Clientes", emoji: "💰", color: "#10b981", offsetX: 340, offsetY: -140 },
      { id: "rec-1", parentId: "receita", label: "Captação de Novos Lojistas", emoji: "🤝", color: "#10b981", offsetX: 630, offsetY: -180 },
      { id: "rec-2", parentId: "receita", label: "Aumento de Retenção e LTV", emoji: "📈", color: "#10b981", offsetX: 630, offsetY: -100 },

      { id: "operacao", label: "Eficiência Operacional", emoji: "⚙️", color: "#3b82f6", offsetX: 340, offsetY: 140 },
      { id: "op-1", parentId: "operacao", label: "Auditorias Semanais de Tráfego", emoji: "📊", color: "#3b82f6", offsetX: 630, offsetY: 100 },
      { id: "op-2", parentId: "operacao", label: "Sincronização Diária no Cockpit", emoji: "⚡", color: "#3b82f6", offsetX: 630, offsetY: 180 },

      { id: "equipe", label: "Desenvolvimento da Equipe", emoji: "👥", color: "#8b5cf6", offsetX: -340, offsetY: -140 },
      { id: "eq-1", parentId: "equipe", label: "Capacitação Contínua em Meta Ads", emoji: "🎓", color: "#8b5cf6", offsetX: -630, offsetY: -180 },
      { id: "eq-2", parentId: "equipe", label: "Hierarquia & Alinhamentos Semanais", emoji: "👔", color: "#8b5cf6", offsetX: -630, offsetY: -100 },

      { id: "inovacao", label: "Inovação & IA (Victoria)", emoji: "🧠", color: "#ec4899", offsetX: -340, offsetY: 140 },
      { id: "in-1", parentId: "inovacao", label: "Automações de Notificação WhatsApp", emoji: "📲", color: "#ec4899", offsetX: -630, offsetY: 100 },
      { id: "in-2", parentId: "inovacao", label: "Análise Preditiva de Tráfego", emoji: "🔮", color: "#ec4899", offsetX: -630, offsetY: 180 },
    ],
  },
];

