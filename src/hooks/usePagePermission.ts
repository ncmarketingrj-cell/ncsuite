import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase-external/client";
import { getCargoDefinition, hasPermissionAccess, hasPermissionEdit, isMasterAdmin } from "@/lib/userHierarchy";
import { resolveUserAvatar } from "@/lib/userService";

const RESTRICTED_BY_DEFAULT = new Set(["criar_usuarios", "gestao_victoria"]);

export function usePagePermission() {
  const { user } = useAuth();

  const { data: profile, isLoading } = useQuery({
    queryKey: ["current_user_profile", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;

      let { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

      // Se o perfil não foi encontrado por ID (ex: login novo ou ID desalinhado), tenta auto-reparar via RPC ou e-mail
      if (!data) {
        try {
          const { data: repaired } = await (supabase as any).rpc("ensure_user_session_ready");
          if (repaired && typeof repaired === "object") {
            data = repaired;
          }
        } catch {
          // ignore if RPC not yet available
        }
      }

      if (!data && user.email) {
        const byEmail = await supabase
          .from("profiles")
          .select("*")
          .ilike("email", user.email.trim())
          .maybeSingle();
        if (byEmail.data) {
          data = byEmail.data;
        }
      }

      if (error && !data) return null;
      if (!data) return null;

      const cargoDefaults = getCargoDefinition((data as any).position)?.defaultPermissions || {};
      const mergedPermissions = {
        ...cargoDefaults,
        ...((data as any).permissions && typeof (data as any).permissions === "object"
          ? (data as any).permissions
          : {}),
      };

      const resolvedAvatar = resolveUserAvatar({
        ...data,
        permissions: mergedPermissions,
        email: (data as any).email || user.email,
        user_metadata: user.user_metadata,
      });

      return {
        ...data,
        permissions: mergedPermissions,
        avatar_url: resolvedAvatar || (data as any).avatar_url || null,
      };
    },
    enabled: !!user?.id,
  });

  const isAdmin =
    isMasterAdmin({ email: user?.email, id: user?.id }) ||
    profile?.role === "admin" ||
    profile?.role === "master_admin";
  const perms = (profile as any)?.permissions ?? {};

  const hasAccess = (key: string): boolean => {
    if (isLoading) return true; // Otimista durante o carregamento inicial
    if (isAdmin) return true;

    const value = perms[key];
    if (value === undefined || value === null) {
      return !RESTRICTED_BY_DEFAULT.has(key);
    }
    return hasPermissionAccess(perms, key);
  };

  const canEdit = (key: string): boolean => {
    if (isLoading) return true;
    if (isAdmin) return true;

    const value = perms[key];
    if (value === undefined || value === null) {
      return !RESTRICTED_BY_DEFAULT.has(key);
    }
    return hasPermissionEdit(perms, key);
  };

  return {
    profile,
    isAdmin,
    isLoading,
    perms,
    hasAccess,
    canEdit,
  };
}
