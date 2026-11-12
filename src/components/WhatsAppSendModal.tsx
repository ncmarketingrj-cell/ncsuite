import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Send, Users, Phone, Share2, Check, Copy, ExternalLink, BookmarkCheck } from "lucide-react";
import { toast } from "sonner";

interface WhatsAppSendModalProps {
  isOpen: boolean;
  onClose: () => void;
  reportText: string;
  storeName?: string;
}

export function WhatsAppSendModal({
  isOpen,
  onClose,
  reportText,
  storeName = "",
}: WhatsAppSendModalProps) {
  const [activeTab, setActiveTab] = useState<"phone" | "group" | "picker">("phone");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [groupLink, setGroupLink] = useState("");
  const [rememberDestination, setRememberDestination] = useState(true);
  const [isCopied, setIsCopied] = useState(false);

  // Chave única para salvar a configuração desta loja específica
  const storeKey = (storeName || "geral")
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "_");

  // Carrega configurações salvas para esta loja
  useEffect(() => {
    if (isOpen) {
      setIsCopied(false);
      try {
        const savedRaw = localStorage.getItem(`nc_wa_dest_${storeKey}`);
        if (savedRaw) {
          const parsed = JSON.parse(savedRaw);
          if (parsed.phoneNumber) setPhoneNumber(parsed.phoneNumber);
          if (parsed.groupLink) setGroupLink(parsed.groupLink);
          if (parsed.mode) setActiveTab(parsed.mode);
        } else {
          // Fallback para o WhatsApp padrão da agência
          const agencyWa = localStorage.getItem("nc_agency_whatsapp") || "";
          setPhoneNumber(agencyWa);
          setGroupLink("");
        }
      } catch {
        const agencyWa = localStorage.getItem("nc_agency_whatsapp") || "";
        setPhoneNumber(agencyWa);
      }
    }
  }, [isOpen, storeKey]);

  if (!isOpen) return null;

  // Sanitiza número (adiciona DDI 55 do Brasil se faltar)
  const formatAndCleanPhone = (val: string) => {
    const digits = val.replace(/\D/g, "");
    if (!digits) return "";
    // Se digitou DDD (10 ou 11 dígitos, ex: 21987654321), adiciona 55 na frente
    if (digits.length === 10 || digits.length === 11) {
      return `55${digits}`;
    }
    return digits;
  };

  const handleSavePreferences = () => {
    if (!rememberDestination) return;
    try {
      const dataToSave = {
        mode: activeTab,
        phoneNumber,
        groupLink,
        updatedAt: new Date().toISOString(),
      };
      localStorage.setItem(`nc_wa_dest_${storeKey}`, JSON.stringify(dataToSave));
      if (phoneNumber) {
        localStorage.setItem("nc_agency_whatsapp", phoneNumber);
      }
    } catch (e) {
      console.error("Erro ao salvar destino do WhatsApp:", e);
    }
  };

  // Enviar para número direto
  const handleSendToPhone = () => {
    const cleaned = formatAndCleanPhone(phoneNumber);
    if (!cleaned || cleaned.length < 10) {
      toast.warning("Digite um número de WhatsApp válido com DDD.");
      return;
    }

    handleSavePreferences();
    const url = `https://api.whatsapp.com/send?phone=${cleaned}&text=${encodeURIComponent(reportText)}`;
    window.open(url, "_blank");
    toast.success(`Abrindo conversa para ${storeName || "o número informado"}!`);
    onClose();
  };

  // Enviar para grupo via link
  const handleSendToGroup = async () => {
    let cleanLink = groupLink.trim();
    if (!cleanLink) {
      toast.warning("Cole o link de convite do grupo do WhatsApp.");
      return;
    }

    // Se o usuário colou só o código final do grupo (ex: B9xK3...)
    if (!cleanLink.startsWith("http")) {
      cleanLink = `https://chat.whatsapp.com/${cleanLink}`;
    }

    handleSavePreferences();

    // Copia o relatório automaticamente para a área de transferência
    try {
      await navigator.clipboard.writeText(reportText);
      setIsCopied(true);
      toast.success("📋 Relatório copiado! Abrindo grupo — basta colar (Ctrl + V) e enviar!");
    } catch {
      toast.info("Abrindo o grupo...");
    }

    setTimeout(() => {
      window.open(cleanLink, "_blank");
      onClose();
    }, 400);
  };

  // Abrir seletor de contatos/grupos do próprio WhatsApp
  const handleOpenPicker = () => {
    handleSavePreferences();
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(reportText)}`;
    window.open(url, "_blank");
    toast.info("Abrindo WhatsApp para você escolher o grupo ou contato...");
    onClose();
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="relative w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border bg-muted/30 px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#25D366]/20 border border-[#25D366]/30 text-[#25D366]">
                <Send className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-black uppercase tracking-wider text-foreground flex items-center gap-2">
                  Enviar para o WhatsApp
                </h3>
                <p className="text-[10px] text-muted-foreground font-medium">
                  {storeName ? `Loja / Cliente: ` : "Selecione o destino do relatório"}
                  {storeName && <span className="text-foreground font-bold">{storeName}</span>}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="p-6 space-y-5 overflow-y-auto scrollbar-thin">
            {/* Seletor de Modalidade (Tabs) */}
            <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-muted border border-border text-[10px] font-black uppercase tracking-wider">
              <button
                type="button"
                onClick={() => setActiveTab("phone")}
                className={`flex items-center justify-center gap-1.5 py-2.5 rounded-lg transition-all ${
                  activeTab === "phone"
                    ? "bg-[#25D366] text-black shadow-md font-black"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Phone className="h-3.5 w-3.5" />
                Número Direto
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("group")}
                className={`flex items-center justify-center gap-1.5 py-2.5 rounded-lg transition-all ${
                  activeTab === "group"
                    ? "bg-[#25D366] text-black shadow-md font-black"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Users className="h-3.5 w-3.5" />
                Link de Grupo
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("picker")}
                className={`flex items-center justify-center gap-1.5 py-2.5 rounded-lg transition-all ${
                  activeTab === "picker"
                    ? "bg-[#25D366] text-black shadow-md font-black"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Share2 className="h-3.5 w-3.5" />
                Escolher na Hora
              </button>
            </div>

            {/* Conteúdo da Aba: Número Direto */}
            {activeTab === "phone" && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-3"
              >
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block">
                  Número de WhatsApp do Destinatário
                </label>
                <div className="relative">
                  <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type="text"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="Ex: (21) 98765-4321 ou 21987654321"
                    className="w-full rounded-xl border border-border bg-background pl-10 pr-4 py-3 text-xs font-bold text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-[#25D366] transition"
                  />
                </div>
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  💡 Abre a conversa direta no WhatsApp Web ou App com a mensagem já pré-digitada no campo de envio.
                </p>
              </motion.div>
            )}

            {/* Conteúdo da Aba: Link do Grupo */}
            {activeTab === "group" && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-3"
              >
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block">
                  Link de Convite do Grupo da Loja
                </label>
                <div className="relative">
                  <Users className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type="text"
                    value={groupLink}
                    onChange={(e) => setGroupLink(e.target.value)}
                    placeholder="Ex: https://chat.whatsapp.com/B9xK3mN..."
                    className="w-full rounded-xl border border-border bg-background pl-10 pr-4 py-3 text-xs font-bold text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-[#25D366] transition font-mono"
                  />
                </div>
                <div className="rounded-xl border border-border bg-muted/30 p-3 text-[10px] text-muted-foreground space-y-1 leading-relaxed">
                  <p className="text-foreground font-bold flex items-center gap-1.5">
                    <BookmarkCheck className="h-3.5 w-3.5 text-[#25D366]" /> Prático e Didático:
                  </p>
                  <p>
                    O WhatsApp Web não aceita texto pré-preenchido em links de grupos. Ao clicar no botão, o relatório é <strong>COPIADO AUTOMATICAMENTE</strong> e o grupo abre na hora — basta você dar <strong>Ctrl + V</strong> e enviar!
                  </p>
                </div>
              </motion.div>
            )}

            {/* Conteúdo da Aba: Escolher na Hora */}
            {activeTab === "picker" && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-3"
              >
                <div className="rounded-xl border border-border bg-muted/30 p-4 text-xs text-muted-foreground space-y-2 leading-relaxed">
                  <p className="text-foreground font-bold flex items-center gap-2">
                    <Share2 className="h-4 w-4 text-[#25D366]" /> Seletor Geral do WhatsApp
                  </p>
                  <p className="text-[11px]">
                    Ideal se você já está com o grupo ou conversa aberta no seu WhatsApp e não quer colar link nem cadastrar número.
                  </p>
                  <p className="text-[11px]">
                    O WhatsApp abrirá uma lista com suas conversas recentes para você clicar no grupo desejado e a mensagem já entrará formatada!
                  </p>
                </div>
              </motion.div>
            )}

            {/* Opção para Salvar para Envios Futuros */}
            {activeTab !== "picker" && (
              <label className="flex items-center gap-2.5 cursor-pointer select-none pt-1">
                <input
                  type="checkbox"
                  checked={rememberDestination}
                  onChange={(e) => setRememberDestination(e.target.checked)}
                  className="rounded border-border bg-background text-[#25D366] focus:ring-0 focus:ring-offset-0 h-4 w-4"
                />
                <span className="text-[11px] font-bold text-foreground/90">
                  Salvar este destino para <span className="text-[#25D366]">{storeName || "esta loja"}</span> (lembrar nos próximos meses)
                </span>
              </label>
            )}

            {/* Prévia da Mensagem */}
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                <span>Prévia do Relatório</span>
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(reportText);
                    setIsCopied(true);
                    toast.success("Relatório copiado!");
                    setTimeout(() => setIsCopied(false), 2000);
                  }}
                  className="flex items-center gap-1 text-[#25D366] hover:underline"
                >
                  {isCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  {isCopied ? "Copiado!" : "Copiar Texto"}
                </button>
              </div>
              <div className="max-h-28 overflow-y-auto rounded-xl border border-border bg-muted/40 p-3 text-[10px] font-mono text-foreground leading-relaxed whitespace-pre scrollbar-thin">
                {reportText.slice(0, 350)}...
              </div>
            </div>
          </div>

          {/* Footer com Botão de Ação */}
          <div className="flex items-center justify-between border-t border-border bg-muted/30 px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              className="text-xs font-bold text-muted-foreground hover:text-foreground transition px-3 py-2"
            >
              Cancelar
            </button>

            {activeTab === "phone" && (
              <button
                type="button"
                onClick={handleSendToPhone}
                className="flex items-center gap-2 rounded-xl bg-[#25D366] hover:bg-[#20ba59] px-6 py-3 text-xs font-black uppercase tracking-wider text-black transition hover:scale-[1.02] active:scale-95 shadow-lg shadow-[#25D366]/20"
              >
                <Phone className="h-4 w-4" />
                Enviar para o Número
              </button>
            )}

            {activeTab === "group" && (
              <button
                type="button"
                onClick={handleSendToGroup}
                className="flex items-center gap-2 rounded-xl bg-[#25D366] hover:bg-[#20ba59] px-6 py-3 text-xs font-black uppercase tracking-wider text-black transition hover:scale-[1.02] active:scale-95 shadow-lg shadow-[#25D366]/20"
              >
                <ExternalLink className="h-4 w-4" />
                Copiar e Abrir Grupo
              </button>
            )}

            {activeTab === "picker" && (
              <button
                type="button"
                onClick={handleOpenPicker}
                className="flex items-center gap-2 rounded-xl bg-[#25D366] hover:bg-[#20ba59] px-6 py-3 text-xs font-black uppercase tracking-wider text-black transition hover:scale-[1.02] active:scale-95 shadow-lg shadow-[#25D366]/20"
              >
                <Share2 className="h-4 w-4" />
                Abrir WhatsApp
              </button>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

