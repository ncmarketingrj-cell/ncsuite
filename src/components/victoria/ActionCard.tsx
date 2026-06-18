import { useState } from "react";
import { motion } from "framer-motion";
import { Sparkles, Check, X, Loader2, AlertTriangle, Play, HelpCircle, FileText } from "lucide-react";
import { Link } from "@tanstack/react-router";

interface ActionCardProps {
  messageId: string;
  action: {
    type: string;
    campaignId?: string;
    campaignName?: string;
    value?: number;
    reportId?: string;
    title?: string;
    description?: string;
    risk?: 'low' | 'medium' | 'high';
    params?: Record<string, any>;
  };
  status: "pending" | "approved" | "rejected" | "error";
  onApprove: (messageId: string, action: any) => Promise<void>;
  onReject: (messageId: string) => Promise<void>;
}

export function ActionCard({ messageId, action, status, onApprove, onReject }: ActionCardProps) {
  const [loading, setLoading] = useState(false);
  const [highRiskInput, setHighRiskInput] = useState("");
  const [showHighRiskConfirm, setShowHighRiskConfirm] = useState(false);

  const risk = action.risk || 'low';

  const riskStyles = {
    low: {
      border: "border-emerald-500/20 bg-emerald-500/5",
      icon: Sparkles,
      iconColor: "text-emerald-500",
      accentGlow: "shadow-[0_0_15px_rgba(16,185,129,0.08)]",
      riskText: "Seguro",
    },
    medium: {
      border: "border-amber-500/20 bg-amber-500/5",
      icon: AlertTriangle,
      iconColor: "text-amber-500",
      accentGlow: "shadow-[0_0_15px_rgba(245,158,11,0.08)]",
      riskText: "Moderação",
    },
    high: {
      border: "border-red-500/20 bg-red-500/5",
      icon: AlertTriangle,
      iconColor: "text-red-500",
      accentGlow: "shadow-[0_0_15px_rgba(239,68,68,0.08)]",
      riskText: "Risco Alto",
    },
  }[risk];

  const handleApprove = async () => {
    if (risk === "high" && !showHighRiskConfirm) {
      setShowHighRiskConfirm(true);
      return;
    }

    if (risk === "high" && highRiskInput !== "CONFIRMAR") {
      return;
    }

    setLoading(true);
    try {
      await onApprove(messageId, action);
    } finally {
      setLoading(false);
      setShowHighRiskConfirm(false);
    }
  };

  const handleReject = async () => {
    setLoading(true);
    try {
      await onReject(messageId);
    } finally {
      setLoading(false);
    }
  };

  // Se a ação for um atalho de redirecionamento para o configurador de relatórios
  if (action.type === "open_report_config" && action.reportId) {
    return (
      <div className="mt-4 p-4 border border-primary/20 bg-primary/5 rounded-2xl flex flex-col gap-3 shadow-[0_0_15px_rgba(var(--primary-rgb),0.05)]">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
            <FileText className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-foreground">Relatório OCR Salvo com Sucesso</h4>
            <p className="text-[10px] text-muted-foreground">O relatório foi gerado e está pronto para personalização avançada.</p>
          </div>
        </div>
        
        <p className="text-[11px] text-foreground/80 leading-relaxed">
          {action.description || "Personalize este relatório gerado a partir do print, filtre campanhas, adicione WhatsApp e exporte em PDF premium."}
        </p>

        <div className="flex gap-2">
          <Link
            to="/relatorios"
            search={{ activeReportId: action.reportId }}
            className="flex-1 py-2 rounded-xl bg-primary hover:brightness-110 active:scale-[0.98] transition-all text-primary-foreground font-bold text-[11px] uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-glow-sm"
          >
            <Play className="h-3.5 w-3.5 fill-current" />
            Configurar Relatório Avançado
          </Link>
        </div>
      </div>
    );
  }

  // Descrição padrão baseada na ação
  const getActionTitleAndDesc = () => {
    if (action.title && action.description) {
      return { title: action.title, desc: action.description };
    }

    if (action.type === "update_budget") {
      return {
        title: `Ajustar Orçamento: ${action.campaignName}`,
        desc: `Definir a verba diária da campanha para R$ ${action.value?.toFixed(2)}/dia. Esta otimização ajudará a impulsionar o retorno com base nos leads qualificados gerados recentes.`,
      };
    }
    if (action.type === "pause_campaign") {
      return {
        title: `Pausar Campanha: ${action.campaignName}`,
        desc: `Pausar esta campanha imediatamente devido a alto CPL (R$ ${action.params?.cpl?.toFixed(2) || '45.00+'}) ou baixo retorno geral para evitar desperdício de verba.`,
      };
    }
    if (action.type === "clone_funnel_snapshot") {
      return {
        title: `Clonar Funil: ${action.params?.sourceFunnelName || "Original"}`,
        desc: `Realizar o Deep Copy de toda a estrutura lógica e conexões deste funil para a conta do cliente "${action.params?.targetClientName || "Honda RJ"}".`,
      };
    }
    return {
      title: "Recomendação Operacional",
      desc: JSON.stringify(action),
    };
  };

  const { title: actionTitle, desc: actionDesc } = getActionTitleAndDesc();
  const IconComponent = riskStyles.icon;

  return (
    <div className={`mt-4 p-4 border rounded-2xl flex flex-col gap-3 transition-all duration-300 ${riskStyles.border} ${riskStyles.accentGlow}`}>
      {/* Topo do Card */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`h-7 w-7 rounded-lg bg-background flex items-center justify-center shadow-inner`}>
            <IconComponent className={`h-4 w-4 ${riskStyles.iconColor}`} />
          </div>
          <div>
            <h4 className="text-xs font-black text-foreground uppercase tracking-tight">{actionTitle}</h4>
            <p className="text-[9px] font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mt-0.5">
              <span>Nível de Ação:</span>
              <span className={`px-1.5 py-0.5 rounded-md bg-background border text-[8px] font-extrabold ${
                risk === 'low' ? 'text-emerald-500 border-emerald-500/10' :
                risk === 'medium' ? 'text-amber-500 border-amber-500/10' : 'text-red-500 border-red-500/10'
              }`}>{riskStyles.riskText}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Descrição */}
      <p className="text-[11px] text-foreground/80 leading-relaxed">
        {actionDesc}
      </p>

      {/* Risco Alto - Input de Confirmação */}
      {showHighRiskConfirm && status === "pending" && (
        <motion.div 
          initial={{ opacity: 0, y: -5 }} 
          animate={{ opacity: 1, y: 0 }}
          className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex flex-col gap-2"
        >
          <p className="text-[10px] text-red-400 font-bold uppercase tracking-wider">⚠️ Esta ação possui alto risco operacional.</p>
          <p className="text-[10px] text-foreground/80">Digite <strong className="font-extrabold text-red-500">CONFIRMAR</strong> no campo abaixo para aprovar:</p>
          <input
            type="text"
            placeholder="Digite CONFIRMAR..."
            value={highRiskInput}
            onChange={(e) => setHighRiskInput(e.target.value)}
            className="w-full bg-background/50 border border-red-500/30 rounded-lg px-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500/40"
          />
        </motion.div>
      )}

      {/* Rodapé / Botões */}
      <div className="flex gap-2">
        {status === "pending" ? (
          <>
            <button
              onClick={handleReject}
              disabled={loading}
              className="flex-1 py-2 rounded-xl bg-background border border-border hover:bg-white/5 active:scale-[0.98] transition-all text-foreground font-black text-[10px] uppercase tracking-wider flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <X className="h-3.5 w-3.5" />
              Rejeitar
            </button>
            <button
              onClick={handleApprove}
              disabled={loading || (risk === "high" && showHighRiskConfirm && highRiskInput !== "CONFIRMAR")}
              className={`flex-1 py-2 rounded-xl font-black text-[10px] uppercase tracking-wider flex items-center justify-center gap-1.5 text-white shadow-glow-sm disabled:opacity-50 transition-all active:scale-[0.98] ${
                risk === 'high' ? 'bg-red-500 hover:bg-red-600' : 'bg-primary hover:brightness-110'
              }`}
            >
              {loading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Processando...
                </>
              ) : (
                <>
                  <Check className="h-3.5 w-3.5" />
                  {risk === "high" && !showHighRiskConfirm ? "Prosseguir" : "Aprovar Ação"}
                </>
              )}
            </button>
          </>
        ) : status === "approved" ? (
          <div className="w-full py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2">
            <Check className="h-4 w-4" />
            Otimização Executada com Sucesso
          </div>
        ) : status === "rejected" ? (
          <div className="w-full py-2.5 rounded-xl bg-white/5 border border-white/5 text-muted-foreground font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2">
            <X className="h-4 w-4" />
            Ação Rejeitada e Arquivada
          </div>
        ) : (
          <div className="w-full py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Falha na Execução da Ação
          </div>
        )}
      </div>
    </div>
  );
}
