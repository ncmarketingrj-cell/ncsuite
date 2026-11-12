import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Loader2, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase-external/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { AvatarUpload } from "@/components/AvatarUpload";

interface ProfileSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: any;
  userId: string;
}

export function ProfileSettingsModal({ isOpen, onClose, profile, userId }: ProfileSettingsModalProps) {
  const [saving, setSaving] = useState(false);
  const [fullName, setFullName] = useState("");
  const [position, setPosition] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const qc = useQueryClient();

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || "");
      setPosition(profile.position || profile.role || "");
      setAvatarUrl(profile.avatar_url || "");
    }
  }, [profile, isOpen]);

  const handleAvatarChange = async (publicUrl: string) => {
    setAvatarUrl(publicUrl);
    try {
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl || null, updated_at: new Date().toISOString() })
        .eq("id", userId);

      if (updateError) throw updateError;

      await supabase.auth.updateUser({
        data: { avatar_url: publicUrl || null },
      });

      qc.invalidateQueries({ queryKey: ["current_user_profile"] });
      qc.invalidateQueries({ queryKey: ["profiles"] });
    } catch (err: any) {
      toast.error(`Falha ao atualizar foto: ${err?.message || "Erro desconhecido"}`);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      toast.error("O nome de usuário não pode estar vazio.");
      return;
    }

    setSaving(true);
    try {
      // Update DB
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: fullName.trim(),
          position: position.trim(),
          avatar_url: avatarUrl || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);

      if (error) throw error;

      // Update Auth Metadata
      await supabase.auth.updateUser({
        data: { full_name: fullName.trim(), position: position.trim(), avatar_url: avatarUrl || null },
      });

      toast.success("Perfil atualizado com sucesso!");

      qc.invalidateQueries({ queryKey: ["current_user_profile"] });
      qc.invalidateQueries({ queryKey: ["profiles"] });
      onClose();
    } catch (err: any) {
      toast.error(`Erro ao salvar perfil: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 20 }}
            transition={{ type: "spring", duration: 0.5, bounce: 0.3 }}
            className="relative z-10 w-full max-w-md rounded-2xl border border-white/10 bg-card/95 p-6 shadow-2xl backdrop-blur-xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-5">
              <h2 className="text-sm font-black uppercase tracking-widest text-foreground">Perfil da Conta</h2>
              <button
                onClick={onClose}
                className="h-8 w-8 rounded-full border border-white/10 flex items-center justify-center text-muted-foreground hover:text-foreground transition-all"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveProfile} className="space-y-5">
              {/* Avatar Upload Area com suporte direto a arquivo */}
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                <AvatarUpload
                  value={avatarUrl}
                  onChange={handleAvatarChange}
                  userId={userId}
                  label="Foto de Perfil (Upload)"
                  size="lg"
                />
              </div>

              {/* Form Fields */}
              <div className="w-full space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-wider font-black text-muted-foreground/60">
                    Nome de Usuário
                  </label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Seu nome"
                    className="w-full rounded-xl border border-white/10 bg-background/60 px-4 py-2.5 text-sm font-semibold focus:border-primary/50 focus:outline-none transition-all placeholder:text-muted-foreground/30 text-foreground"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-wider font-black text-muted-foreground/60">
                    Cargo / Função
                  </label>
                  <input
                    type="text"
                    value={position}
                    onChange={(e) => setPosition(e.target.value)}
                    placeholder="Ex: Gerente, Diretor"
                    className="w-full rounded-xl border border-white/10 bg-background/60 px-4 py-2.5 text-sm font-semibold focus:border-primary/50 focus:outline-none transition-all placeholder:text-muted-foreground/30 text-foreground"
                  />
                </div>

                <div className="p-3.5 rounded-xl bg-muted/20 border border-white/5 space-y-1">
                  <span className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground/50">ID de Acesso</span>
                  <p className="text-[11px] font-mono text-foreground truncate opacity-70">{userId}</p>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={saving}
                className="w-full rounded-xl bg-primary py-3 text-xs font-black uppercase tracking-wider text-primary-foreground shadow-glow hover:shadow-glow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Salvando...</span>
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    <span>Salvar Alterações</span>
                  </>
                )}
              </button>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
