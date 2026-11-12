import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase-external/client";
import { hasPermissionAccess, hasPermissionEdit, isMasterAdmin } from "@/lib/userHierarchy";
import { resolveUserAvatar } from "@/lib/userService";

const RESTRICTED_BY_DEFAULT = new Set(["criar_usuarios", "gestao_victoria"]);

export function usePagePermission() {
  const { user } = useAuth();

  const { data: profile, isLoading } = useQuery({
    queryKey: ["current_user_profile", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();
      if (error || !data) return null;
      const resolvedAvatar = resolveUserAvatar({
        ...data,
        email: (data as any).email || user.email,
        user_metadata: user.user_metadata,
      });
      return {
        ...data,
        avatar_url: resolvedAvatar || data.avatar_url || null,
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
