import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, User, Camera, Loader2, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

interface ProfileSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: any;
  userId: string;
}

export function ProfileSettingsModal({ isOpen, onClose, profile, userId }: ProfileSettingsModalProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fullName, setFullName] = useState("");
  const [position, setPosition] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || "");
      setPosition(profile.position || profile.role || "");
    }
  }, [profile, isOpen]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("A imagem deve ter no máximo 5MB.");
      return;
    }

    setLoading(true);
    try {
      // Create a unique file name
      const fileExt = file.name.split('.').pop();
      const fileName = `${userId}-${Date.now()}.${fileExt}`;
      const filePath = `avatars/${fileName}`;

      // Upload to 'media' bucket
      const { error: uploadError } = await supabase.storage
        .from("media")
        .upload(filePath, file, { cacheControl: "3600", upsert: true });

      if (uploadError) throw uploadError;

      // Get Public URL
      const { data: { publicUrl } } = supabase.storage
        .from("media")
        .getPublicUrl(filePath);

      // Update Profile table
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("id", userId);

      if (updateError) throw updateError;

      // Update Supabase Auth user metadata
      await supabase.auth.updateUser({
        data: { avatar_url: publicUrl }
      });

      toast.success("Foto de perfil atualizada com sucesso!");
      
      qc.invalidateQueries({ queryKey: ["current_user_profile", userId] });
      qc.invalidateQueries({ queryKey: ["profiles"] });

    } catch (err: any) {
      toast.error(`Falha no upload: ${err.message}`);
    } finally {
      setLoading(false);
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
          full_name: fullName,
          position: position,
          updated_at: new Date().toISOString()
        })
        .eq("id", userId);

      if (error) throw error;

      // Update Auth Metadata
      await supabase.auth.updateUser({
        data: { full_name: fullName, position: position }
      });

      toast.success("Perfil atualizado com sucesso!");
      
      qc.invalidateQueries({ queryKey: ["current_user_profile", userId] });
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
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", duration: 0.5, bounce: 0.3 }}
            className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-white/10 bg-card p-6 shadow-2xl z-10"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-sm font-black uppercase tracking-widest text-foreground">Perfil da Conta</h2>
              <button
                onClick={onClose}
                className="rounded-full bg-white/5 p-1.5 text-muted-foreground transition hover:bg-white/10 hover:text-foreground"
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveProfile} className="flex flex-col items-center gap-5">
              {/* Avatar Upload Area */}
              <div 
                className="relative group cursor-pointer" 
                onClick={() => !loading && fileInputRef.current?.click()}
                title="Clique para alterar a foto"
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="image/png, image/jpeg, image/webp"
                  className="hidden"
                />
                
                <div className={`h-24 w-24 rounded-full border-4 border-background bg-muted/30 overflow-hidden shadow-xl transition-all duration-300 group-hover:border-primary/50 relative flex items-center justify-center ${loading ? 'opacity-50' : ''}`}>
                  {profile?.avatar_url ? (
                    <img src={profile.avatar_url} alt="Avatar" className="h-full w-full object-cover" />
                  ) : (
                    <User className="h-10 w-10 text-primary/50" />
                  )}
                  
                  {/* Overlay Hover */}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Camera className="h-6 w-6 text-white" />
                  </div>
                </div>

                {/* Loading Indicator */}
                {loading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/50 rounded-full">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                )}
              </div>

              {/* Form Fields */}
              <div className="w-full space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-wider font-black text-muted-foreground/60">Nome de Usuário</label>
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
                  <label className="text-[10px] uppercase tracking-wider font-black text-muted-foreground/60">Cargo / Função</label>
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

              {/* Action Buttons */}
              <div className="flex gap-3 w-full mt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 rounded-xl border border-white/10 bg-white/5 py-2.5 text-xs font-bold text-muted-foreground hover:bg-white/10 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 rounded-xl bg-primary py-2.5 text-xs font-black uppercase tracking-wider text-primary-foreground shadow-glow-sm hover:opacity-90 transition flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Salvando...</span>
                    </>
                  ) : (
                    <>
                      <Save className="h-3.5 w-3.5" />
                      <span>Salvar</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
