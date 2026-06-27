import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase-external/client";

const ADMIN_EMAILS = ["nc.marketingrj@gmail.com", "hc.marketing.dgt@gmail.com"];

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
      if (error) return null;
      return data;
    },
    enabled: !!user?.id,
  });

  const isAdmin = profile?.role === "admin" || (user?.email ? ADMIN_EMAILS.includes(user.email) : false);
  const perms = (profile as any)?.permissions ?? {};

  const hasAccess = (key: string): boolean => {
    if (isLoading) return true; // Otimista durante o carregamento
    if (isAdmin) return true;
    
    const value = perms[key];
    // Block only if explicitly set to "none" or false
    if (value === "none" || value === false) return false;
    
    // Default allow if undefined or view/edit
    return true;
  };

  const canEdit = (key: string): boolean => {
    if (isLoading) return true;
    if (isAdmin) return true;
    
    const value = perms[key];
    // Allow edit only if explicitly 'edit', or if undefined fallback to true (or false depending on strictness)
    // We'll require explicit 'edit' for destructive actions, or true if the module defaults to open
    if (value === "none" || value === "view" || value === false) return false;
    
    return true;
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
