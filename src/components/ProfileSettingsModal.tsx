import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, User, Camera, Loader2 } from "lucide-react";
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

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

      toast.success("Foto de perfil atualizada com sucesso!");
      
      // Invalidate the query so the app navbar picks up the change instantly
      qc.invalidateQueries({ queryKey: ["current_user_profile", userId] });

    } catch (err: any) {
      toast.error(`Falha no upload: ${err.message}`);
    } finally {
      setLoading(false);
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
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-col items-center gap-5">
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

              {/* Profile Info */}
              <div className="text-center w-full">
                <h3 className="text-xl font-bold text-foreground truncate">{profile?.full_name || "Membro NC"}</h3>
                <p className="text-xs text-primary mt-1 uppercase tracking-widest font-black">{profile?.position || profile?.role || "Usuário"}</p>
                
                <div className="mt-5 p-4 rounded-xl bg-muted/20 border border-white/5 space-y-2 text-left">
                  <div>
                    <span className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground/70">ID de Acesso</span>
                    <p className="text-xs font-mono text-foreground truncate opacity-80">{userId}</p>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
