import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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
    return value !== undefined && value !== null && value !== "none" && value !== false;
  };

  const canEdit = (key: string): boolean => {
    if (isLoading) return true;
    if (isAdmin) return true;
    
    const value = perms[key];
    return value === "edit";
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
