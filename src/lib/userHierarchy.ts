// ──────────────────────────────────────────────────────────────────────────────
// userHierarchy.ts — Motor de Hierarquia e Autoridade da NC Suite
// ──────────────────────────────────────────────────────────────────────────────

export type HierarchyRole =
  | "master_admin"
  | "admin"
  | "ceo"
  | "diretor"
  | "gerente"
  | "coordenador"
  | "gestor_trafego"
  | "gestor_projetos"
  | "desenvolvedor"
  | "social_media"
  | "designer"
  | "videomaker"
  | "sdr"
  | "agency_sdr"
  | "client_store"
  | "outro";

export interface HierarchyInfo {
  level: number;
  rankCode: string;
  title: string;
  shortLabel: string;
  category: "master" | "diretoria" | "gerencia" | "gestao" | "operacao";
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  iconName: "crown" | "shield" | "star" | "award" | "target" | "users" | "briefcase" | "palette" | "phone" | "user";
  description: string;
}

export const MASTER_ADMIN_EMAILS = [
  "nc.marketingrj@gmail.com",
  "hc.marketing.dgt@gmail.com",
];

/**
 * Retorna se o e-mail ou perfil é do Administrador Master (Nível 100 absoluto)
 */
export function isMasterAdmin(userOrEmail?: string | { email?: string; id?: string } | null): boolean {
  if (!userOrEmail) return false;
  const email = typeof userOrEmail === "string" ? userOrEmail : userOrEmail.email;
  if (!email) return false;
  return MASTER_ADMIN_EMAILS.includes(email.trim().toLowerCase());
}

/**
 * Calcula a pontuação numérica de hierarquia de um usuário (10 a 100).
 * A patente (`role`) define a autoridade no sistema; `position` é usada apenas como fallback legado.
 */
export function getUserLevel(profile?: { email?: string; role?: string; position?: string } | null): number {
  if (!profile) return 0;
  if (isMasterAdmin(profile)) return 100;

  const role = (profile.role || "").toLowerCase().trim();
  const pos = (profile.position || "").toLowerCase().trim();

  // 1. Prioriza a Patente (`role`) explícita no sistema
  if (role === "master_admin") return 100;
  if (role === "admin" || role === "ceo") return 90;
  if (role === "diretor") return 80;
  if (role === "gerente") return 70;
  if (role === "coordenador") return 60;
  if (role === "gestor_trafego" || role === "gestor_projetos" || role === "desenvolvedor") return 50;
  if (role === "social_media" || role === "designer" || role === "videomaker") return 20;
  if (role === "sdr" || role === "agency_sdr") return 15;
  if (role === "client_store") return 10;

  // 2. Fallback por Cargo (`position`) quando role é "outro" / legado / indefinido
  if (/administrador master|ceo|sócio|socio|proprietário|proprietario|dono/i.test(pos)) return 90;
  if (/diretor|diretora/i.test(pos)) return 80;
  if (/gerente|head/i.test(pos)) return 70;
  if (/coordenador|coordenadora|líder|lider|team lead/i.test(pos)) return 60;
  if (/gestor de tráfego|gestor de trafego|media buyer|tráfego pago|desenvolvedor|programador|gestor de projetos/i.test(pos)) return 50;
  if (/social media|designer|videomaker|filmmaker|criativos|audiovisual/i.test(pos)) return 20;
  if (/sdr|bdr|comercial|vendas|closer/i.test(pos)) return 15;

  return 10;
}

/**
 * Verifica se uma chave no JSON `permissions` concede acesso real (bloqueia "none", false, null, undefined).
 */
export function hasPermissionAccess(
  perms: Record<string, any> | null | undefined,
  key: string
): boolean {
  if (!perms || typeof perms !== "object") return false;
  const val = perms[key];
  return val === "view" || val === "edit" || val === true;
}

/**
 * Verifica se uma chave no JSON `permissions` concede edição real.
 */
export function hasPermissionEdit(
  perms: Record<string, any> | null | undefined,
  key: string
): boolean {
  if (!perms || typeof perms !== "object") return false;
  const val = perms[key];
  return val === "edit" || val === true;
}

/**
 * Define quem pode abrir e operar a Gestão de Usuários & Pixel de Equipe.
 * Respeita estritamente `criar_usuarios === "none"`: um Gerente ou Gestor bloqueado NÃO vê a gestão.
 */
export function canUserManageUsers(
  profile?: { id?: string; email?: string; role?: string; position?: string; permissions?: Record<string, any> } | null
): boolean {
  if (!profile) return false;
  if (isMasterAdmin(profile)) return true;
  const role = (profile.role || "").toLowerCase().trim();
  if (role === "admin" || role === "ceo" || role === "master_admin") return true;
  return hasPermissionAccess(profile.permissions, "criar_usuarios");
}

/**
 * Define quem pode acessar a rota administrativa `/config`.
 * Remove falso-positivo com "Gestor de Tráfego" e respeita o bloqueio de `criar_usuarios`.
 */
export function canUserAccessConfig(
  profile?: { id?: string; email?: string; role?: string; position?: string; permissions?: Record<string, any> } | null
): boolean {
  if (!profile) return false;
  if (isMasterAdmin(profile)) return true;
  const role = (profile.role || "").toLowerCase().trim();
  if (role === "admin" || role === "ceo" || role === "diretor" || role === "master_admin") return true;
  return hasPermissionAccess(profile.permissions, "criar_usuarios");
}

/**
 * Informações visuais e semânticas completas da hierarquia
 */
export function getHierarchyInfo(profile?: { email?: string; role?: string; position?: string } | null): HierarchyInfo {
  const level = getUserLevel(profile);

  if (level >= 100) {
    return {
      level: 100,
      rankCode: "LVL-100",
      title: "Administrador Master",
      shortLabel: "MASTER ADMIN",
      category: "master",
      badgeBg: "bg-amber-500/15",
      badgeText: "text-amber-300",
      badgeBorder: "border-amber-500/40",
      iconName: "crown",
      description: "Autoridade máxima e proprietário vitalício da Suite. Acesso total irrestrito.",
    };
  }

  if (level >= 90) {
    return {
      level: 90,
      rankCode: "LVL-90",
      title: "Administrador / CEO",
      shortLabel: "ADMIN / CEO",
      category: "diretoria",
      badgeBg: "bg-red-500/15",
      badgeText: "text-red-400",
      badgeBorder: "border-red-500/30",
      iconName: "shield",
      description: "Corpo executivo. Gerencia diretores, gerentes, gestores e operação.",
    };
  }

  if (level >= 80) {
    return {
      level: 80,
      rankCode: "LVL-80",
      title: "Diretoria",
      shortLabel: "DIRETOR",
      category: "diretoria",
      badgeBg: "bg-purple-500/15",
      badgeText: "text-purple-300",
      badgeBorder: "border-purple-500/30",
      iconName: "star",
      description: "Liderança de diretoria. Gerencia gerentes, coordenadores e toda a equipe técnica.",
    };
  }

  if (level >= 70) {
    return {
      level: 70,
      rankCode: "LVL-70",
      title: "Gerência",
      shortLabel: "GERENTE",
      category: "gerencia",
      badgeBg: "bg-emerald-500/15",
      badgeText: "text-emerald-400",
      badgeBorder: "border-emerald-500/30",
      iconName: "award",
      description: "Gestão operacional. Coordena gestores, analistas, social media e designers.",
    };
  }

  if (level >= 60) {
    return {
      level: 60,
      rankCode: "LVL-60",
      title: "Coordenação",
      shortLabel: "COORDENADOR",
      category: "gerencia",
      badgeBg: "bg-cyan-500/15",
      badgeText: "text-cyan-400",
      badgeBorder: "border-cyan-500/30",
      iconName: "target",
      description: "Líder de equipe técnica e alinhamento tático direto com analistas.",
    };
  }

  if (level >= 50) {
    return {
      level: 50,
      rankCode: "LVL-50",
      title: "Gestor / Especialista Sênior",
      shortLabel: "GESTOR",
      category: "gestao",
      badgeBg: "bg-blue-500/15",
      badgeText: "text-blue-400",
      badgeBorder: "border-blue-500/30",
      iconName: "briefcase",
      description: "Especialista técnico em tráfego pago, projetos ou desenvolvimento.",
    };
  }

  if (level >= 20) {
    return {
      level: 20,
      rankCode: "LVL-20",
      title: "Criação & Social Media",
      shortLabel: "CRIAÇÃO / SOCIAL",
      category: "operacao",
      badgeBg: "bg-pink-500/15",
      badgeText: "text-pink-400",
      badgeBorder: "border-pink-500/30",
      iconName: "palette",
      description: "Produção de conteúdo, design gráfico, reels, copy e audiovisual.",
    };
  }

  if (level >= 15) {
    return {
      level: 15,
      rankCode: "LVL-15",
      title: "SDR & Comercial",
      shortLabel: "SDR / VENDAS",
      category: "operacao",
      badgeBg: "bg-lime-500/15",
      badgeText: "text-lime-400",
      badgeBorder: "border-lime-500/30",
      iconName: "phone",
      description: "Qualificação comercial de leads, agendamento de reuniões e CRM.",
    };
  }

  return {
    level: 10,
    rankCode: "LVL-10",
    title: "Operação / Membro",
    shortLabel: "OPERACIONAL",
    category: "operacao",
    badgeBg: "bg-white/10",
    badgeText: "text-muted-foreground",
    badgeBorder: "border-white/10",
    iconName: "user",
    description: "Operação e execução de tarefas com escopo delimitado.",
  };
}

/**
 * Avalia se o usuário chamador tem autoridade hierárquica sobre o usuário alvo
 */
export function checkHierarchyAuthority(
  caller?: { id?: string; email?: string; role?: string; position?: string; permissions?: any } | null,
  target?: { id?: string; email?: string; role?: string; position?: string } | null
): {
  isSuperior: boolean;
  canEditLogin: boolean;
  canEditPassword: boolean;
  canEditPermissions: boolean;
  canDelete: boolean;
  reason?: string;
} {
  if (!caller || !target) {
    return {
      isSuperior: false,
      canEditLogin: false,
      canEditPassword: false,
      canEditPermissions: false,
      canDelete: false,
      reason: "Usuários inválidos.",
    };
  }

  // Se o alvo for o Master Admin (nc.marketingrj@gmail.com)
  if (isMasterAdmin(target)) {
    const callerIsMaster = isMasterAdmin(caller);
    if (callerIsMaster && caller.id === target.id) {
      return {
        isSuperior: true,
        canEditLogin: false, // E-mail master é imutável
        canEditPassword: true, // Master pode trocar sua própria senha
        canEditPermissions: false, // Master tem acesso total fixo
        canDelete: false, // Master não pode ser deletado
      };
    }
    return {
      isSuperior: false,
      canEditLogin: false,
      canEditPassword: false,
      canEditPermissions: false,
      canDelete: false,
      reason: "O Administrador Master é protegido por regras rígidas e não pode ser editado nem excluído por outros usuários.",
    };
  }

  // Master Admin pode tudo sobre os outros
  if (isMasterAdmin(caller)) {
    return {
      isSuperior: true,
      canEditLogin: true,
      canEditPassword: true,
      canEditPermissions: true,
      canDelete: true,
    };
  }

  // Se for o próprio usuário
  if (caller.id && target.id && caller.id === target.id) {
    return {
      isSuperior: false,
      canEditLogin: false, // O próprio usuário comum não muda seu login pela gestão sem autorização
      canEditPassword: true, // Pode alterar sua própria senha
      canEditPermissions: false, // Não pode se auto-promover
      canDelete: false,
      reason: "Você não pode alterar sua própria hierarquia ou permissões.",
    };
  }

  const callerLevel = getUserLevel(caller);
  const targetLevel = getUserLevel(target);

  // Verificação estrita da permissão 'criar_usuarios' (bloqueia "none" e falsos positivos)
  const hasUserManagementPerm = canUserManageUsers(caller);

  if (!hasUserManagementPerm) {
    return {
      isSuperior: false,
      canEditLogin: false,
      canEditPassword: false,
      canEditPermissions: false,
      canDelete: false,
      reason: "Você não possui a permissão de Gestão de Usuários liberada.",
    };
  }

  // Regra de Ouro: Superioridade Estrita (callerLevel > targetLevel)
  if (callerLevel <= targetLevel) {
    const isPeer = callerLevel === targetLevel;
    return {
      isSuperior: false,
      canEditLogin: false,
      canEditPassword: false,
      canEditPermissions: false,
      canDelete: false,
      reason: isPeer
        ? "Usuário possui o mesmo nível hierárquico que você. Apenas superiores diretos podem alterar login e senha."
        : "Usuário possui nível hierárquico superior ao seu. Acesso protegido.",
    };
  }

  // Superior estrito tem autoridade completa sobre o subordinado
  return {
    isSuperior: true,
    canEditLogin: true,
    canEditPassword: true,
    canEditPermissions: true,
    canDelete: true,
  };
}

export interface RoleDefinition {
  value: HierarchyRole;
  label: string;
  shortLabel: string;
  minLevel: number;
  authorityTitle: string;
  authoritySummary: string;
  canManageTeamByDefault: boolean;
}

export interface CargoDefinition {
  name: string;
  recommendedRole: HierarchyRole;
  summary: string;
  defaultPermissions: Record<string, "none" | "view" | "edit">;
}

export const HUBS_CATALOG = [
  { id: "trafego", title: "Hub Tráfego & Performance", badgeClass: "text-red-400 bg-red-500/10 border-red-500/20" },
  { id: "operacao", title: "Hub Operação & Inteligência", badgeClass: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
  { id: "gestao", title: "Hub Gestão & Clientes", badgeClass: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
  { id: "sistema", title: "Administração & Segurança", badgeClass: "text-purple-400 bg-purple-500/10 border-purple-500/20" },
] as const;

export const PERMISSION_MODULES_CATALOG: Array<{
  key: string;
  label: string;
  hub: "trafego" | "operacao" | "gestao" | "sistema";
  mode: "read_only" | "full";
  hint: string;
}> = [
  { key: "dashboard", label: "Command Center", hub: "trafego", mode: "full", hint: "Visão executiva de KPIs de tráfego" },
  { key: "metricas", label: "Métricas & KPIs", hub: "trafego", mode: "full", hint: "Tabelas e filtros de campanhas Meta" },
  { key: "simulador", label: "Simulador", hub: "trafego", mode: "full", hint: "Projeção de verba e retorno" },
  { key: "cockpit", label: "Cockpit", hub: "trafego", mode: "full", hint: "Controle de contas e verbas" },
  { key: "relatorios", label: "Relatórios", hub: "trafego", mode: "full", hint: "Geração e envio de relatórios" },
  { key: "criativos", label: "Criativos", hub: "trafego", mode: "full", hint: "Biblioteca e upload de peças" },
  { key: "auditoria", label: "Auditoria Hub", hub: "trafego", mode: "full", hint: "Auditoria de contas e regras" },
  { key: "automacoes", label: "Automações", hub: "operacao", mode: "full", hint: "Regras automáticas e alertas" },
  { key: "agente", label: "Victoria AI (Chat & Uso)", hub: "operacao", mode: "full", hint: "Chat tático e diagnóstico IA" },
  { key: "gestao_victoria", label: "Mente da Victoria AI", hub: "operacao", mode: "full", hint: "Personalidade, RAG e Radar" },
  { key: "strategy_map", label: "Mapa Estratégico", hub: "operacao", mode: "full", hint: "Planejamento visual e funis" },
  { key: "reunioes", label: "Reuniões", hub: "operacao", mode: "full", hint: "Ata e agenda de reuniões" },
  { key: "clientes", label: "Clientes", hub: "gestao", mode: "full", hint: "Cadastro de lojas e contas" },
  { key: "cobrancas", label: "Cobranças", hub: "gestao", mode: "full", hint: "Financeiro e mensalidades" },
  { key: "social", label: "Social Media & Planner", hub: "gestao", mode: "full", hint: "Feed, agendamento e Insights" },
  { key: "criar_usuarios", label: "Gestão de Usuários & Pixel", hub: "sistema", mode: "full", hint: "Criar contas, senhas e ver Pixel" },
];

export const ROLE_CATALOG: RoleDefinition[] = [
  {
    value: "admin",
    label: "Nível 90 — Administrador Total",
    shortLabel: "Administrador",
    minLevel: 90,
    authorityTitle: "Poder Administrativo Total",
    authoritySummary: "Acessa Configurações Master e gerencia qualquer usuário abaixo do Administrador Master.",
    canManageTeamByDefault: true,
  },
  {
    value: "ceo",
    label: "Nível 90 — CEO / Sócio Diretor",
    shortLabel: "CEO / Sócio",
    minLevel: 90,
    authorityTitle: "Diretoria Executiva",
    authoritySummary: "Autoridade máxima operacional, visão financeira completa e gestão de toda a equipe.",
    canManageTeamByDefault: true,
  },
  {
    value: "diretor",
    label: "Nível 80 — Direção (Líder de Área)",
    shortLabel: "Diretor",
    minLevel: 80,
    authorityTitle: "Diretoria Setorial",
    authoritySummary: "Acessa Configurações e gerencia Gerentes e equipe se 'Gestão de Usuários' estiver liberada.",
    canManageTeamByDefault: true,
  },
  {
    value: "gerente",
    label: "Nível 70 — Gerência (Supervisão)",
    shortLabel: "Gerente",
    minLevel: 70,
    authorityTitle: "Supervisão de Equipe",
    authoritySummary: "Fica acima de Coordenadores e Gestores. Só acessa 'Gestão de Usuários' se você liberar o módulo abaixo.",
    canManageTeamByDefault: false,
  },
  {
    value: "coordenador",
    label: "Nível 60 — Coordenação Técnica",
    shortLabel: "Coordenador",
    minLevel: 60,
    authorityTitle: "Coordenação Operacional",
    authoritySummary: "Coordena Gestores e Operação. Gestão de Usuários fica bloqueada salvo se você liberar abaixo.",
    canManageTeamByDefault: false,
  },
  {
    value: "gestor_trafego",
    label: "Nível 50 — Especialista / Gestor",
    shortLabel: "Gestor / Especialista",
    minLevel: 50,
    authorityTitle: "Execução Sênior (Sem Gestão de Equipe)",
    authoritySummary: "Usa normalmente os Hubs de Tráfego/Operação liberados abaixo, sem acesso ao painel administrativo.",
    canManageTeamByDefault: false,
  },
  {
    value: "gestor_projetos",
    label: "Nível 50 — Gestor de Projetos",
    shortLabel: "Gestor de Projetos",
    minLevel: 50,
    authorityTitle: "Operação de Projetos",
    authoritySummary: "Organiza entregas, clientes e mapas nos módulos liberados, sem acesso administrativo salvo liberação.",
    canManageTeamByDefault: false,
  },
  {
    value: "desenvolvedor",
    label: "Nível 50 — Desenvolvedor / Técnico",
    shortLabel: "Desenvolvedor",
    minLevel: 50,
    authorityTitle: "Desenvolvimento & Automações",
    authoritySummary: "Atuação técnica em sistemas e automações. Acessa Gestão de Usuários somente se liberado abaixo.",
    canManageTeamByDefault: false,
  },
  {
    value: "social_media",
    label: "Nível 20 — Criação / Social Media",
    shortLabel: "Social Media",
    minLevel: 20,
    authorityTitle: "Execução de Conteúdo",
    authoritySummary: "Acessa apenas Social Media, Criativos e os módulos explicitamente liberados abaixo.",
    canManageTeamByDefault: false,
  },
  {
    value: "designer",
    label: "Nível 20 — Criação / Designer",
    shortLabel: "Designer",
    minLevel: 20,
    authorityTitle: "Produção Criativa",
    authoritySummary: "Focado em Criativos, Mapa Estratégico e entregas visuais conforme permissões abaixo.",
    canManageTeamByDefault: false,
  },
  {
    value: "videomaker",
    label: "Nível 20 — Audiovisual / Videomaker",
    shortLabel: "Videomaker",
    minLevel: 20,
    authorityTitle: "Produção Audiovisual",
    authoritySummary: "Focado em Criativos e Social Media conforme módulos liberados abaixo.",
    canManageTeamByDefault: false,
  },
  {
    value: "sdr",
    label: "Nível 15 — Comercial / SDR",
    shortLabel: "SDR / Comercial",
    minLevel: 15,
    authorityTitle: "Pré-vendas & Atendimento",
    authoritySummary: "Acesso restrito aos módulos comerciais/clientes liberados abaixo.",
    canManageTeamByDefault: false,
  },
  {
    value: "outro",
    label: "Nível 10 — Operação Básica",
    shortLabel: "Operação Básica",
    minLevel: 10,
    authorityTitle: "Acesso Somente ao Liberado",
    authoritySummary: "Nenhuma permissão administrativa. Enxerga exclusivamente o que estiver liberado abaixo.",
    canManageTeamByDefault: false,
  },
];

export const CARGO_CATALOG: CargoDefinition[] = [
  {
    name: "Gestor de Tráfego",
    recommendedRole: "gestor_trafego",
    summary: "Opera Tráfego, Métricas, Cockpit e Victoria AI — sem acesso administrativo ou usuários.",
    defaultPermissions: {
      dashboard: "edit", metricas: "edit", simulador: "edit", cockpit: "edit",
      clientes: "view", relatorios: "edit", criativos: "edit", social: "none",
      automacoes: "edit", reunioes: "none", cobrancas: "none", strategy_map: "edit",
      agente: "edit", gestao_victoria: "none", auditoria: "edit", criar_usuarios: "none",
    },
  },
  {
    name: "Social Media",
    recommendedRole: "social_media",
    summary: "Opera Social Media, Criativos, Relatórios e Mapa Estratégico — tráfego e admin bloqueados.",
    defaultPermissions: {
      dashboard: "none", metricas: "none", simulador: "none", cockpit: "none",
      clientes: "view", relatorios: "edit", criativos: "edit", social: "edit",
      automacoes: "none", reunioes: "none", cobrancas: "none", strategy_map: "edit",
      agente: "view", gestao_victoria: "none", auditoria: "none", criar_usuarios: "none",
    },
  },
  {
    name: "Designer",
    recommendedRole: "designer",
    summary: "Foco em Criativos, Mapa Estratégico e apoio a Social Media.",
    defaultPermissions: {
      dashboard: "none", metricas: "none", simulador: "none", cockpit: "none",
      clientes: "view", relatorios: "none", criativos: "edit", social: "view",
      automacoes: "none", reunioes: "none", cobrancas: "none", strategy_map: "edit",
      agente: "view", gestao_victoria: "none", auditoria: "none", criar_usuarios: "none",
    },
  },
  {
    name: "Videomaker",
    recommendedRole: "videomaker",
    summary: "Foco em Criativos e entrega de mídia no Hub Social.",
    defaultPermissions: {
      dashboard: "none", metricas: "none", simulador: "none", cockpit: "none",
      clientes: "view", relatorios: "none", criativos: "edit", social: "view",
      automacoes: "none", reunioes: "none", cobrancas: "none", strategy_map: "none",
      agente: "view", gestao_victoria: "none", auditoria: "none", criar_usuarios: "none",
    },
  },
  {
    name: "SDR",
    recommendedRole: "sdr",
    summary: "Foco em Reuniões e acompanhamento de Clientes.",
    defaultPermissions: {
      dashboard: "none", metricas: "none", simulador: "none", cockpit: "none",
      clientes: "view", relatorios: "none", criativos: "none", social: "none",
      automacoes: "none", reunioes: "edit", cobrancas: "none", strategy_map: "none",
      agente: "view", gestao_victoria: "none", auditoria: "none", criar_usuarios: "none",
    },
  },
  {
    name: "Gestor de Projetos",
    recommendedRole: "gestor_projetos",
    summary: "Acompanha entregas, clientes, reuniões, relatórios e Social Media.",
    defaultPermissions: {
      dashboard: "view", metricas: "view", simulador: "none", cockpit: "none",
      clientes: "edit", relatorios: "edit", criativos: "view", social: "edit",
      automacoes: "none", reunioes: "edit", cobrancas: "none", strategy_map: "edit",
      agente: "edit", gestao_victoria: "none", auditoria: "view", criar_usuarios: "none",
    },
  },
  {
    name: "Desenvolvedor",
    recommendedRole: "desenvolvedor",
    summary: "Acesso técnico amplo a Automações, Victoria AI e APIs — usuários bloqueados por padrão.",
    defaultPermissions: {
      dashboard: "edit", metricas: "edit", simulador: "edit", cockpit: "edit",
      clientes: "edit", relatorios: "edit", criativos: "edit", social: "edit",
      automacoes: "edit", reunioes: "edit", cobrancas: "none", strategy_map: "edit",
      agente: "edit", gestao_victoria: "edit", auditoria: "edit", criar_usuarios: "none",
    },
  },
  {
    name: "Coordenador",
    recommendedRole: "coordenador",
    summary: "Supervisiona entregas e operação técnica da equipe.",
    defaultPermissions: {
      dashboard: "edit", metricas: "edit", simulador: "edit", cockpit: "edit",
      clientes: "edit", relatorios: "edit", criativos: "edit", social: "edit",
      automacoes: "edit", reunioes: "edit", cobrancas: "none", strategy_map: "edit",
      agente: "edit", gestao_victoria: "view", auditoria: "edit", criar_usuarios: "none",
    },
  },
  {
    name: "Gerente",
    recommendedRole: "gerente",
    summary: "Supervisão geral da operação (gestão de usuários opcional, desativada por padrão por segurança).",
    defaultPermissions: {
      dashboard: "edit", metricas: "edit", simulador: "edit", cockpit: "edit",
      clientes: "edit", relatorios: "edit", criativos: "edit", social: "edit",
      automacoes: "view", reunioes: "edit", cobrancas: "none", strategy_map: "edit",
      agente: "edit", gestao_victoria: "view", auditoria: "edit", criar_usuarios: "none",
    },
  },
  {
    name: "Diretor",
    recommendedRole: "diretor",
    summary: "Liderança executiva com acesso estratégico e gestão de subordinados.",
    defaultPermissions: {
      dashboard: "edit", metricas: "edit", simulador: "edit", cockpit: "edit",
      clientes: "edit", relatorios: "edit", criativos: "edit", social: "edit",
      automacoes: "edit", reunioes: "edit", cobrancas: "edit", strategy_map: "edit",
      agente: "edit", gestao_victoria: "edit", auditoria: "edit", criar_usuarios: "edit",
    },
  },
  {
    name: "CEO",
    recommendedRole: "ceo",
    summary: "Comando executivo total da plataforma e da equipe.",
    defaultPermissions: {
      dashboard: "edit", metricas: "edit", simulador: "edit", cockpit: "edit",
      clientes: "edit", relatorios: "edit", criativos: "edit", social: "edit",
      automacoes: "edit", reunioes: "edit", cobrancas: "edit", strategy_map: "edit",
      agente: "edit", gestao_victoria: "edit", auditoria: "edit", criar_usuarios: "edit",
    },
  },
  {
    name: "Administrador",
    recommendedRole: "admin",
    summary: "Acesso irrestrito a todos os módulos e configurações master.",
    defaultPermissions: {
      dashboard: "edit", metricas: "edit", simulador: "edit", cockpit: "edit",
      clientes: "edit", relatorios: "edit", criativos: "edit", social: "edit",
      automacoes: "edit", reunioes: "edit", cobrancas: "edit", strategy_map: "edit",
      agente: "edit", gestao_victoria: "edit", auditoria: "edit", criar_usuarios: "edit",
    },
  },
  {
    name: "Outros",
    recommendedRole: "outro",
    summary: "Acesso mínimo inicial — libere manualmente apenas o necessário.",
    defaultPermissions: {
      dashboard: "view", metricas: "none", simulador: "none", cockpit: "none",
      clientes: "none", relatorios: "none", criativos: "none", social: "none",
      automacoes: "none", reunioes: "none", cobrancas: "none", strategy_map: "none",
      agente: "none", gestao_victoria: "none", auditoria: "none", criar_usuarios: "none",
    },
  },
];

export function getRoleDefinition(role?: string | null): RoleDefinition {
  const key = (role || "outro").toLowerCase().trim();
  return ROLE_CATALOG.find((r) => r.value === key) || ROLE_CATALOG[ROLE_CATALOG.length - 1];
}

export function getCargoDefinition(position?: string | null): CargoDefinition | undefined {
  const key = (position || "").toLowerCase().trim();
  return CARGO_CATALOG.find((c) => c.name.toLowerCase() === key);
}

/**
 * Fallback de compatibilidade: caso o banco remoto ainda esteja com a constraint
 * antiga `profiles_role_check`, mapeia roles novos para os aceitos sem elevar privilégio indevido.
 */
export const LEGACY_ALLOWED_DB_ROLES = new Set([
  "admin",
  "ceo",
  "gerente",
  "gestor_trafego",
  "social_media",
  "videomaker",
  "agency_sdr",
  "client_store",
  "outro",
]);

export function normalizeRoleForDbConstraint(role?: string | null): string {
  const key = (role || "outro").toLowerCase().trim();
  if (LEGACY_ALLOWED_DB_ROLES.has(key)) return key;
  const fallbackMap: Record<string, string> = {
    master_admin: "admin",
    diretor: "gerente",
    coordenador: "gerente",
    gestor_projetos: "gestor_trafego",
    desenvolvedor: "gestor_trafego",
    designer: "social_media",
    sdr: "agency_sdr",
  };
  return fallbackMap[key] || "outro";
}

/**
 * Retorna os cargos e roles que o chamador tem autoridade para atribuir a terceiros
 */
export function getAllowedAssignableRoles(caller?: { email?: string; role?: string; position?: string } | null): {
  roles: RoleDefinition[];
  positions: string[];
} {
  const callerLevel = getUserLevel(caller);
  const isMaster = isMasterAdmin(caller);

  if (isMaster) {
    return {
      roles: ROLE_CATALOG,
      positions: CARGO_CATALOG.map((c) => c.name),
    };
  }

  const allowedRoles = ROLE_CATALOG.filter((r) => r.minLevel < callerLevel);
  const allowedPositions = CARGO_CATALOG.filter((c) => {
    const r = getRoleDefinition(c.recommendedRole);
    return r.minLevel < callerLevel;
  }).map((c) => c.name);

  return {
    roles: allowedRoles.length > 0 ? allowedRoles : [ROLE_CATALOG[ROLE_CATALOG.length - 1]],
    positions: allowedPositions.length > 0 ? allowedPositions : ["Outros"],
  };
}

/**
 * Gerador de senha forte aleatória, legível e segura
 */
export function generateStrongPassword(): string {
  const lettersUpper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lettersLower = "abcdefghijkmnpqrstuvwxyz";
  const numbers = "23456789";
  const specials = "!@#$%&*";

  let pass = "";
  // 3 maiúsculas
  for (let i = 0; i < 3; i++) pass += lettersUpper.charAt(Math.floor(Math.random() * lettersUpper.length));
  // 3 minúsculas
  for (let i = 0; i < 3; i++) pass += lettersLower.charAt(Math.floor(Math.random() * lettersLower.length));
  // 3 números
  for (let i = 0; i < 3; i++) pass += numbers.charAt(Math.floor(Math.random() * numbers.length));
  // 1 especial
  pass += specials.charAt(Math.floor(Math.random() * specials.length));

  // Embaralha
  return pass
    .split("")
    .sort(() => Math.random() - 0.5)
    .join("");
}

