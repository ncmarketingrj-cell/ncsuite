import React, { useState, useEffect } from "react";
import { User } from "lucide-react";

export type AvatarPresenceStatus = "online" | "today" | "offline" | "inactive" | null;

interface UserAvatarProps {
  src?: string | null;
  name?: string | null;
  email?: string | null;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  rounded?: "full" | "xl" | "2xl";
  onlineStatus?: AvatarPresenceStatus;
  className?: string;
  showTooltip?: boolean;
}

const SIZE_MAP = {
  xs: "h-6 w-6 text-[9px]",
  sm: "h-8 w-8 text-[11px]",
  md: "h-10 w-10 text-xs",
  lg: "h-12 w-12 text-sm",
  xl: "h-16 w-16 text-lg",
};

const ROUNDED_MAP = {
  full: "rounded-full",
  xl: "rounded-xl",
  "2xl": "rounded-2xl",
};

const DOT_SIZE_MAP = {
  xs: "h-2 w-2 -bottom-0.5 -right-0.5",
  sm: "h-2.5 w-2.5 -bottom-0.5 -right-0.5",
  md: "h-3 w-3 -bottom-0.5 -right-0.5",
  lg: "h-3.5 w-3.5 -bottom-0.5 -right-0.5",
  xl: "h-4 w-4 -bottom-1 -right-1",
};

function getInitials(name?: string | null, email?: string | null): string {
  const cleanName = (name || "").trim();
  if (cleanName) {
    const parts = cleanName.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return cleanName.slice(0, 2).toUpperCase();
  }
  const cleanEmail = (email || "").trim();
  if (cleanEmail) return cleanEmail.slice(0, 2).toUpperCase();
  return "";
}

export function UserAvatar({
  src,
  name,
  email,
  size = "sm",
  rounded = "full",
  onlineStatus = null,
  className = "",
}: UserAvatarProps) {
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [src]);

  const initials = getInitials(name, email);
  const showImage = Boolean(src && src.trim() && !imgError);

  const statusConfig =
    onlineStatus === "online"
      ? { color: "bg-emerald-500", title: "Online agora no sistema", pulse: true }
      : onlineStatus === "today"
      ? { color: "bg-amber-400", title: "Acessou hoje (ausente no momento)", pulse: false }
      : onlineStatus === "inactive"
      ? { color: "bg-red-500", title: "Usuário suspenso", pulse: false }
      : onlineStatus === "offline"
      ? { color: "bg-zinc-500", title: "Offline / Sem acesso recente", pulse: false }
      : null;

  return (
    <div className={`relative inline-flex shrink-0 ${className}`}>
      <div
        className={`${SIZE_MAP[size]} ${ROUNDED_MAP[rounded]} bg-primary/10 border border-primary/25 flex items-center justify-center overflow-hidden font-black text-primary select-none shadow-sm`}
      >
        {showImage ? (
          <img
            src={src!}
            alt={name || email || "Foto de perfil"}
            onError={() => setImgError(true)}
            className="h-full w-full object-cover"
          />
        ) : initials ? (
          <span>{initials}</span>
        ) : (
          <User className="h-1/2 w-1/2 text-primary" />
        )}
      </div>

      {statusConfig && (
        <span
          title={statusConfig.title}
          className={`absolute ${DOT_SIZE_MAP[size]} rounded-full border-2 border-background ${statusConfig.color} ${
            statusConfig.pulse ? "animate-pulse ring-2 ring-emerald-500/30" : ""
          }`}
        />
      )}
    </div>
  );
}

