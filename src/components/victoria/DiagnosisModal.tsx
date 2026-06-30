import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  X, AlertTriangle, Cpu, TrendingUp, HelpCircle, 
  Loader2, CheckCircle2, Copy, Check 
} from "lucide-react";
import { supabase } from "@/integrations/supabase-external/client";

interface DiagnosisModalProps {
  isOpen: boolean;
  onClose: () => void;
  campaignId: string | null;
  campaignName: string;
}

const LOADING_PHRASES = [
  "Victoria está analisando a série histórica de métricas...",
  "Cruzando flutuações de CPM com variações de CPC...",
  "Verificando a taxa de conversão (CTR) e saturação de público...",
  "Calculando velocidade de gastos nas horas de pico do leilão...",
  "Gerando diagnóstico causal estratégico..."
];

export const DiagnosisModal: React.FC<DiagnosisModalProps> = ({
  isOpen,
  onClose,
  campaignId,
  campaignName,
}) => {
  const [loading, setLoading] = useState(false);
  const [diagnosis, setDiagnosis] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loadingPhraseIdx, setLoadingPhraseIdx] = useState(0);

  // Efeito para trocar frases de loading
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (loading) {
      interval = setInterval(() => {
        setLoadingPhraseIdx((prev) => (prev + 1) % LOADING_PHRASES.length);
      }, 2500);
    }
    return () => clearInterval(interval);
  }, [loading]);

  // Carregar diagnóstico sob demanda
  useEffect(() => {
    if (isOpen && campaignId) {
      fetchDiagnosis();
    } else {
      setDiagnosis(null);
      setCopied(false);
    }
  }, [isOpen, campaignId]);

  const fetchDiagnosis = async () => {
    if (!campaignId) return;
    setLoading(true);
    setDiagnosis(null);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/victoria-agent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            action: "diagnose_alert",
            campaign_id: campaignId
          })
        }
      );

      if (!response.ok) throw new Error("Erro na requisição de diagnóstico");
      const resData = await response.json();
      setDiagnosis(resData.diagnosis || "Não foi possível estruturar o diagnóstico.");
    } catch (err) {
      console.error("[DIAGNOSIS_ERROR]", err);
      setDiagnosis("Desculpe comandante, tive um problema de comunicação com o servidor de IA ao cruzar as métricas de leilão recentes desta campanha.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (diagnosis) {
      navigator.clipboard.writeText(diagnosis);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/95 p-6 shadow-2xl backdrop-blur-md"
          >
            {/* Cabeçalho */}
            <div className="flex items-start justify-between gap-4 border-b border-white/5 pb-4 mb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 border border-primary/20 text-primary">
                  <Cpu className="h-5 w-5 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                    Diagnóstico Causal de Alerta
                  </h3>
                  <p className="text-[10px] text-muted-foreground uppercase font-mono mt-0.5 tracking-wider truncate max-w-[280px]">
                    {campaignName}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="rounded-lg p-1 text-muted-foreground hover:bg-white/5 hover:text-white transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Conteúdo */}
            <div className="min-h-[160px] flex flex-col justify-center py-2">
              {loading ? (
                <div className="flex flex-col items-center justify-center text-center space-y-4 py-6">
                  <Loader2 className="h-10 w-10 text-primary animate-spin" />
                  <div className="space-y-1 px-4">
                    <p className="text-xs font-bold text-white">Análise sob Demanda da Victoria AI</p>
                    <motion.p 
                      key={loadingPhraseIdx}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-[11px] text-muted-foreground italic h-4"
                    >
                      {LOADING_PHRASES[loadingPhraseIdx]}
                    </motion.p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {diagnosis && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="bg-white/[0.02] border border-white/5 p-4 rounded-xl relative overflow-hidden"
                    >
                      <div className="absolute top-0 left-0 w-1 h-full bg-primary" />
                      <p className="text-xs text-foreground/90 leading-relaxed whitespace-pre-line font-medium pl-2">
                        {diagnosis}
                      </p>
                    </motion.div>
                  )}

                  {/* Detalhe técnico explicativo */}
                  <div className="flex items-start gap-2 text-[10px] text-muted-foreground/60 bg-white/[0.01] border border-white/5 p-3 rounded-lg">
                    <HelpCircle className="h-4 w-4 shrink-0 text-muted-foreground/40 mt-0.5" />
                    <p className="leading-normal">
                      A análise causacional é processada pela Victoria AI a partir do cruzamento de desvio padrão de leilão, saturação de criativos (CTR) e histórico de CPM nos últimos 7 dias. Nenhuma alteração foi realizada na campanha.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Ações */}
            <div className="flex items-center justify-end gap-3 border-t border-white/5 pt-4 mt-4">
              {diagnosis && !loading && (
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold text-white hover:bg-white/10 transition cursor-pointer"
                >
                  {copied ? (
                    <><Check className="h-3.5 w-3.5 text-success" /> Copiado!</>
                  ) : (
                    <><Copy className="h-3.5 w-3.5" /> Copiar Diagnóstico</>
                  )}
                </button>
              )}
              <button
                onClick={onClose}
                className="rounded-xl bg-gradient-to-r from-primary to-secondary px-5 py-2 text-xs font-bold text-background shadow-glow transition hover:scale-105 active:scale-95 cursor-pointer"
              >
                Concluído
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
