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
 * Calcula a pontuação numérica de hierarquia de um usuário (10 a 100)
 */
export function getUserLevel(profile?: { email?: string; role?: string; position?: string } | null): number {
  if (!profile) return 0;
  if (isMasterAdmin(profile)) return 100;

  const role = (profile.role || "").toLowerCase();
  const pos = (profile.position || "").toLowerCase();

  // Nível 90: Admin / CEO / Sócios
  if (role === "admin" || role === "ceo" || /ceo|sócio|socio|proprietário|proprietario|dono|administrador master/i.test(pos)) {
    return 90;
  }

  // Nível 80: Diretores
  if (role === "diretor" || /diretor|diretora/i.test(pos)) {
    return 80;
  }

  // Nível 70: Gerentes
  if (role === "gerente" || /gerente|head|gestor geral/i.test(pos)) {
    return 70;
  }

  // Nível 60: Coordenadores / Líderes
  if (role === "coordenador" || /coordenador|coordenadora|líder|lider|team lead/i.test(pos)) {
    return 60;
  }

  // Nível 50: Gestores e Especialistas Sênior
  if (
    role === "gestor_trafego" ||
    role === "gestor_projetos" ||
    role === "desenvolvedor" ||
    /gestor de tráfego|gestor de trafego|media buyer|tráfego pago|desenvolvedor|programador|gestor de projetos/i.test(pos)
  ) {
    return 50;
  }

  // Nível 20: Criação & Conteúdo
  if (
    role === "social_media" ||
    role === "designer" ||
    role === "videomaker" ||
    /social media|designer|videomaker|filmmaker|criativos|audiovisual/i.test(pos)
  ) {
    return 20;
  }

  // Nível 15: SDR & Comercial
  if (role === "sdr" || role === "agency_sdr" || /sdr|bdr|comercial|vendas|closer/i.test(pos)) {
    return 15;
  }

  // Nível 10: Operação / Lojista / Membro Base
  return 10;
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

  // Verificação de permissão 'criar_usuarios'
  const hasUserManagementPerm = caller.role === "admin" || !!caller.permissions?.criar_usuarios;

  if (!hasUserManagementPerm && callerLevel < 70) {
    return {
      isSuperior: false,
      canEditLogin: false,
      canEditPassword: false,
      canEditPermissions: false,
      canDelete: false,
      reason: "Você não possui a permissão de Gestão de Usuários.",
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

/**
 * Retorna os cargos e roles que o chamador tem autoridade para atribuir a terceiros
 */
export function getAllowedAssignableRoles(caller?: { email?: string; role?: string; position?: string } | null): {
  roles: { value: string; label: string; minLevel: number }[];
  positions: string[];
} {
  const callerLevel = getUserLevel(caller);
  const isMaster = isMasterAdmin(caller);

  const ALL_ROLES = [
    { value: "admin", label: "Administrador (Admin)", minLevel: 90 },
    { value: "ceo", label: "CEO / Diretoria Executiva", minLevel: 90 },
    { value: "diretor", label: "Diretor", minLevel: 80 },
    { value: "gerente", label: "Gerente", minLevel: 70 },
    { value: "coordenador", label: "Coordenador", minLevel: 60 },
    { value: "gestor_trafego", label: "Gestor de Tráfego", minLevel: 50 },
    { value: "gestor_projetos", label: "Gestor de Projetos", minLevel: 50 },
    { value: "desenvolvedor", label: "Desenvolvedor", minLevel: 50 },
    { value: "social_media", label: "Social Media / Conteúdo", minLevel: 20 },
    { value: "designer", label: "Designer", minLevel: 20 },
    { value: "videomaker", label: "Videomaker / Filmmaker", minLevel: 20 },
    { value: "sdr", label: "SDR / Comercial", minLevel: 15 },
    { value: "outro", label: "Operação / Membro", minLevel: 10 },
  ];

  const ALL_POSITIONS = [
    { name: "Administrador", minLevel: 90 },
    { name: "CEO", minLevel: 90 },
    { name: "Diretor", minLevel: 80 },
    { name: "Gerente", minLevel: 70 },
    { name: "Coordenador de Tráfego", minLevel: 60 },
    { name: "Gestor de Tráfego", minLevel: 50 },
    { name: "Gestor de Projetos", minLevel: 50 },
    { name: "Desenvolvedor", minLevel: 50 },
    { name: "Social Media", minLevel: 20 },
    { name: "Designer", minLevel: 20 },
    { name: "Videomaker", minLevel: 20 },
    { name: "SDR", minLevel: 15 },
    { name: "Outros", minLevel: 10 },
  ];

  // Master Admin pode atribuir qualquer nível
  if (isMaster) {
    return {
      roles: ALL_ROLES,
      positions: ALL_POSITIONS.map(p => p.name),
    };
  }

  // Outros só podem atribuir níveis estritamente inferiores ao seu
  const allowedRoles = ALL_ROLES.filter(r => r.minLevel < callerLevel);
  const allowedPositions = ALL_POSITIONS.filter(p => p.minLevel < callerLevel).map(p => p.name);

  return {
    roles: allowedRoles,
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

