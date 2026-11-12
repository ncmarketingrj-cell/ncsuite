import React, { useState, useRef } from "react";
import { Camera, UploadCloud, Trash2, Loader2, User } from "lucide-react";
import { supabase } from "@/integrations/supabase-external/client";
import { toast } from "sonner";

interface AvatarUploadProps {
  value: string | null | undefined;
  onChange: (url: string) => void;
  userId?: string;
  label?: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  disabled?: boolean;
}

const SIZE_CLASSES = {
  sm: "h-14 w-14",
  md: "h-20 w-20",
  lg: "h-24 w-24",
  xl: "h-32 w-32",
};

export function AvatarUpload({
  value,
  onChange,
  userId,
  label = "Foto de Perfil",
  size = "lg",
  className = "",
  disabled = false,
}: AvatarUploadProps) {
  const [loading, setLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = async (file: File) => {
    if (!file) return;

    // Validar tipo de arquivo
    const validTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
    if (!validTypes.includes(file.type)) {
      toast.error("Formato inválido. Envie uma imagem PNG, JPG ou WEBP.");
      return;
    }

    // Validar tamanho (máx 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("A imagem deve ter no máximo 5MB.");
      return;
    }

    setLoading(true);
    try {
      const fileExt = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const userPrefix = userId ? userId.replace(/[^a-zA-Z0-9_-]/g, "") : "user";
      const fileName = `${userPrefix}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${fileExt}`;
      const filePath = `avatars/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("media")
        .upload(filePath, file, { cacheControl: "3600", upsert: true });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from("media").getPublicUrl(filePath);
      if (!data?.publicUrl) throw new Error("Não foi possível gerar o link público da foto.");

      onChange(data.publicUrl);
      toast.success("Foto de perfil carregada com sucesso!");
    } catch (err: any) {
      console.error("[AvatarUpload] Erro:", err);
      toast.error(`Falha no upload da foto: ${err?.message || "Erro desconhecido"}`);
    } finally {
      setLoading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled || loading) return;
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const sizeClass = SIZE_CLASSES[size] || SIZE_CLASSES.lg;

  return (
    <div className={`space-y-2 ${className}`}>
      {label && (
        <label className="label-mono text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">
          {label}
        </label>
      )}

      <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4">
        {/* Círculo Interativo do Avatar */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            if (!disabled && !loading) setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => {
            if (!disabled && !loading) fileInputRef.current?.click();
          }}
          className={`relative group shrink-0 rounded-full border-2 cursor-pointer overflow-hidden transition-all duration-300 shadow-xl ${sizeClass} ${
            isDragging
              ? "border-primary scale-105 shadow-glow"
              : "border-white/15 hover:border-primary/60 bg-muted/20"
          } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
          title="Clique ou arraste uma foto para fazer upload"
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/png, image/jpeg, image/jpg, image/webp"
            disabled={disabled || loading}
            className="hidden"
          />

          {value ? (
            <img
              src={value}
              alt="Avatar do Usuário"
              className="h-full w-full object-cover rounded-full"
            />
          ) : (
            <div className="h-full w-full flex items-center justify-center bg-primary/10 text-primary">
              <User className="h-2/5 w-2/5" />
            </div>
          )}

          {/* Overlay de Hover com Ícone de Câmera */}
          {!loading && !disabled && (
            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white p-1">
              <Camera className="h-4 w-4 drop-shadow" />
              <span className="text-[9px] font-bold uppercase mt-0.5 tracking-wider">
                {value ? "Trocar" : "Enviar"}
              </span>
            </div>
          )}

          {/* Overlay de Carregamento */}
          {loading && (
            <div className="absolute inset-0 bg-background/85 flex flex-col items-center justify-center gap-1">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          )}
        </div>

        {/* Botões e Orientações */}
        <div className="flex-1 space-y-2 text-center sm:text-left">
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || loading}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 px-3.5 py-2 text-xs font-bold text-foreground transition-all hover:border-primary/40 active:scale-95 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                  <span>Enviando foto...</span>
                </>
              ) : (
                <>
                  <UploadCloud className="h-3.5 w-3.5 text-primary" />
                  <span>{value ? "Alterar Foto" : "Fazer Upload de Foto"}</span>
                </>
              )}
            </button>

            {value && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange("");
                  toast.info("Foto de perfil removida.");
                }}
                disabled={disabled || loading}
                className="inline-flex items-center gap-1.5 rounded-xl border border-red-500/20 bg-red-500/5 hover:bg-red-500/15 px-3 py-2 text-xs font-semibold text-red-400 transition active:scale-95 disabled:opacity-50"
                title="Remover foto atual"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Remover</span>
              </button>
            )}
          </div>

          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Formatos suportados: <strong>PNG, JPG ou WEBP</strong> de até <strong>5MB</strong>. Você também pode arrastar o arquivo diretamente para o círculo.
          </p>
        </div>
      </div>
    </div>
  );
}

