import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase-external/client";
import { toast } from "sonner";

export type RuleSeverity = "critica" | "alerta" | "diretriz" | "boa_pratica";
export type RuleType = "Escala" | "Pausamento" | "Criativos" | "Atendimento" | "Orçamento" | "Geral";

export interface AccountRule {
  id: string;
  ad_account_id: string;
  campaign_id?: string | null;
  campaign_name?: string | null;
  title: string;
  description: string;
  type: string;
  severity: RuleSeverity;
  is_active: boolean;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AccountNote {
  id: string;
  ad_account_id: string;
  campaign_id?: string | null;
  campaign_name?: string | null;
  title: string;
  content: string;
  category: string;
  tags: string[];
  is_pinned: boolean;
  note_date: string;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

const LOCAL_RULES_KEY_PREFIX = "nc_account_rules_";
const LOCAL_NOTES_KEY_PREFIX = "nc_account_notes_";

function getLocalRules(accountId: string): AccountRule[] {
  try {
    const raw = localStorage.getItem(`${LOCAL_RULES_KEY_PREFIX}${accountId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setLocalRules(accountId: string, rules: AccountRule[]) {
  try {
    localStorage.setItem(`${LOCAL_RULES_KEY_PREFIX}${accountId}`, JSON.stringify(rules));
  } catch {}
}

function getLocalNotes(accountId: string): AccountNote[] {
  try {
    const raw = localStorage.getItem(`${LOCAL_NOTES_KEY_PREFIX}${accountId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setLocalNotes(accountId: string, notes: AccountNote[]) {
  try {
    localStorage.setItem(`${LOCAL_NOTES_KEY_PREFIX}${accountId}`, JSON.stringify(notes));
  } catch {}
}

/**
 * Hook para gerenciar as regras de uma conta de anúncio
 */
export function useAccountRules(adAccountId?: string | null) {
  const qc = useQueryClient();
  const accountId = adAccountId || "all";

  const {
    data: rules = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["ad_account_rules", accountId],
    queryFn: async (): Promise<AccountRule[]> => {
      if (!adAccountId || adAccountId === "all") {
        // Se all, busca todas as regras
        try {
          const { data, error } = await (supabase as any)
            .from("ad_account_rules")
            .select("*")
            .order("created_at", { ascending: false });

          if (!error && Array.isArray(data)) {
            return data as AccountRule[];
          }
        } catch {}
        return [];
      }

      try {
        const { data, error } = await (supabase as any)
          .from("ad_account_rules")
          .select("*")
          .eq("ad_account_id", adAccountId)
          .order("created_at", { ascending: false });

        if (!error && Array.isArray(data)) {
          setLocalRules(adAccountId, data);
          return data as AccountRule[];
        }
      } catch (err) {
        console.warn("[useAccountRules] Fallback local para regras:", err);
      }

      return getLocalRules(adAccountId);
    },
    enabled: true,
    staleTime: 1000 * 30, // 30s
  });

  const createRule = useMutation({
    mutationFn: async (input: {
      ad_account_id: string;
      campaign_id?: string | null;
      campaign_name?: string | null;
      title: string;
      description: string;
      type?: string;
      severity?: RuleSeverity;
      is_active?: boolean;
    }) => {
      const { data: authData } = await supabase.auth.getUser();
      const newRule: Partial<AccountRule> = {
        ad_account_id: input.ad_account_id,
        campaign_id: input.campaign_id || null,
        campaign_name: input.campaign_name || null,
        title: input.title.trim(),
        description: input.description.trim(),
        type: input.type || "Geral",
        severity: input.severity || "alerta",
        is_active: input.is_active !== undefined ? input.is_active : true,
        created_by: authData?.user?.id || null,
      };

      try {
        const { data, error } = await (supabase as any)
          .from("ad_account_rules")
          .insert(newRule)
          .select()
          .single();

        if (error) throw error;
        return data as AccountRule;
      } catch (err) {
        console.warn("[useAccountRules] Falha no Supabase ao inserir regra, salvando local:", err);
        const fallbackRule: AccountRule = {
          id: `rule_${Date.now()}`,
          ad_account_id: input.ad_account_id,
          campaign_id: input.campaign_id || null,
          campaign_name: input.campaign_name || null,
          title: input.title.trim(),
          description: input.description.trim(),
          type: input.type || "Geral",
          severity: input.severity || "alerta",
          is_active: input.is_active !== undefined ? input.is_active : true,
          created_by: authData?.user?.id || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        const current = getLocalRules(input.ad_account_id);
        setLocalRules(input.ad_account_id, [fallbackRule, ...current]);
        return fallbackRule;
      }
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["ad_account_rules"] });
      qc.invalidateQueries({ queryKey: ["ad_account_rules", vars.ad_account_id] });
      toast.success("Regra operacional criada com sucesso!");
    },
    onError: (e: any) => {
      toast.error("Erro ao salvar regra: " + (e?.message || "Tente novamente"));
    },
  });

  const updateRule = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<AccountRule> }) => {
      try {
        const { data, error } = await (supabase as any)
          .from("ad_account_rules")
          .update({ ...updates, updated_at: new Date().toISOString() })
          .eq("id", id)
          .select()
          .single();

        if (error) throw error;
        return data as AccountRule;
      } catch (err) {
        console.warn("[useAccountRules] Fallback update local:", err);
        if (adAccountId) {
          const current = getLocalRules(adAccountId);
          const updated = current.map((r) => (r.id === id ? { ...r, ...updates, updated_at: new Date().toISOString() } : r));
          setLocalRules(adAccountId, updated);
        }
        return updates as any;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ad_account_rules"] });
      toast.success("Regra atualizada com sucesso!");
    },
    onError: (e: any) => {
      toast.error("Erro ao atualizar regra: " + (e?.message || "Tente novamente"));
    },
  });

  const toggleRule = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      try {
        const { error } = await (supabase as any)
          .from("ad_account_rules")
          .update({ is_active, updated_at: new Date().toISOString() })
          .eq("id", id);
        if (error) throw error;
      } catch (err) {
        if (adAccountId) {
          const current = getLocalRules(adAccountId);
          const updated = current.map((r) => (r.id === id ? { ...r, is_active } : r));
          setLocalRules(adAccountId, updated);
        }
      }
      return { id, is_active };
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["ad_account_rules"] });
      toast.success(vars.is_active ? "Regra ativada" : "Regra pausada");
    },
  });

  const deleteRule = useMutation({
    mutationFn: async (id: string) => {
      try {
        const { error } = await (supabase as any).from("ad_account_rules").delete().eq("id", id);
        if (error) throw error;
      } catch (err) {
        if (adAccountId) {
          const current = getLocalRules(adAccountId);
          setLocalRules(adAccountId, current.filter((r) => r.id !== id));
        }
      }
      return id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ad_account_rules"] });
      toast.success("Regra removida");
    },
    onError: (e: any) => {
      toast.error("Erro ao excluir regra: " + (e?.message || ""));
    },
  });

  return {
    rules,
    isLoading,
    refetch,
    createRule,
    updateRule,
    toggleRule,
    deleteRule,
  };
}

/**
 * Hook para gerenciar as notas e timeline de uma conta de anúncio
 */
export function useAccountNotes(adAccountId?: string | null) {
  const qc = useQueryClient();
  const accountId = adAccountId || "all";

  const {
    data: notes = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["ad_account_notes", accountId],
    queryFn: async (): Promise<AccountNote[]> => {
      if (!adAccountId || adAccountId === "all") {
        try {
          const { data, error } = await (supabase as any)
            .from("ad_account_notes")
            .select("*")
            .order("is_pinned", { ascending: false })
            .order("note_date", { ascending: false })
            .order("created_at", { ascending: false });

          if (!error && Array.isArray(data)) {
            return data as AccountNote[];
          }
        } catch {}
        return [];
      }

      try {
        const { data, error } = await (supabase as any)
          .from("ad_account_notes")
          .select("*")
          .eq("ad_account_id", adAccountId)
          .order("is_pinned", { ascending: false })
          .order("note_date", { ascending: false })
          .order("created_at", { ascending: false });

        if (!error && Array.isArray(data)) {
          setLocalNotes(adAccountId, data);
          return data as AccountNote[];
        }
      } catch (err) {
        console.warn("[useAccountNotes] Fallback local para notas:", err);
      }

      return getLocalNotes(adAccountId);
    },
    enabled: true,
    staleTime: 1000 * 30,
  });

  const createNote = useMutation({
    mutationFn: async (input: {
      ad_account_id: string;
      campaign_id?: string | null;
      campaign_name?: string | null;
      title: string;
      content: string;
      category?: string;
      tags?: string[];
      is_pinned?: boolean;
      note_date?: string;
    }) => {
      const { data: authData } = await supabase.auth.getUser();
      const newNote: Partial<AccountNote> = {
        ad_account_id: input.ad_account_id,
        campaign_id: input.campaign_id || null,
        campaign_name: input.campaign_name || null,
        title: input.title.trim(),
        content: input.content.trim(),
        category: input.category || "Geral",
        tags: input.tags || [],
        is_pinned: input.is_pinned || false,
        note_date: input.note_date || new Date().toISOString().split("T")[0],
        created_by: authData?.user?.id || null,
      };

      try {
        const { data, error } = await (supabase as any)
          .from("ad_account_notes")
          .insert(newNote)
          .select()
          .single();

        if (error) throw error;
        return data as AccountNote;
      } catch (err) {
        console.warn("[useAccountNotes] Falha no Supabase ao inserir nota, salvando local:", err);
        const fallbackNote: AccountNote = {
          id: `note_${Date.now()}`,
          ad_account_id: input.ad_account_id,
          campaign_id: input.campaign_id || null,
          campaign_name: input.campaign_name || null,
          title: input.title.trim(),
          content: input.content.trim(),
          category: input.category || "Geral",
          tags: input.tags || [],
          is_pinned: input.is_pinned || false,
          note_date: input.note_date || new Date().toISOString().split("T")[0],
          created_by: authData?.user?.id || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        const current = getLocalNotes(input.ad_account_id);
        setLocalNotes(input.ad_account_id, [fallbackNote, ...current]);
        return fallbackNote;
      }
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["ad_account_notes"] });
      qc.invalidateQueries({ queryKey: ["ad_account_notes", vars.ad_account_id] });
      toast.success("Nota registrada na timeline!");
    },
    onError: (e: any) => {
      toast.error("Erro ao registrar nota: " + (e?.message || "Tente novamente"));
    },
  });

  const updateNote = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<AccountNote> }) => {
      try {
        const { data, error } = await (supabase as any)
          .from("ad_account_notes")
          .update({ ...updates, updated_at: new Date().toISOString() })
          .eq("id", id)
          .select()
          .single();

        if (error) throw error;
        return data as AccountNote;
      } catch (err) {
        if (adAccountId) {
          const current = getLocalNotes(adAccountId);
          const updated = current.map((n) => (n.id === id ? { ...n, ...updates, updated_at: new Date().toISOString() } : n));
          setLocalNotes(adAccountId, updated);
        }
        return updates as any;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ad_account_notes"] });
      toast.success("Nota atualizada!");
    },
    onError: (e: any) => {
      toast.error("Erro ao atualizar nota: " + (e?.message || ""));
    },
  });

  const togglePinNote = useMutation({
    mutationFn: async ({ id, is_pinned }: { id: string; is_pinned: boolean }) => {
      try {
        const { error } = await (supabase as any)
          .from("ad_account_notes")
          .update({ is_pinned, updated_at: new Date().toISOString() })
          .eq("id", id);
        if (error) throw error;
      } catch (err) {
        if (adAccountId) {
          const current = getLocalNotes(adAccountId);
          const updated = current.map((n) => (n.id === id ? { ...n, is_pinned } : n));
          setLocalNotes(adAccountId, updated);
        }
      }
      return { id, is_pinned };
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["ad_account_notes"] });
      toast.success(vars.is_pinned ? "Nota fixada no topo" : "Nota desfixada");
    },
  });

  const deleteNote = useMutation({
    mutationFn: async (id: string) => {
      try {
        const { error } = await (supabase as any).from("ad_account_notes").delete().eq("id", id);
        if (error) throw error;
      } catch (err) {
        if (adAccountId) {
          const current = getLocalNotes(adAccountId);
          setLocalNotes(adAccountId, current.filter((n) => n.id !== id));
        }
      }
      return id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ad_account_notes"] });
      toast.success("Nota excluída da timeline");
    },
    onError: (e: any) => {
      toast.error("Erro ao excluir nota: " + (e?.message || ""));
    },
  });

  return {
    notes,
    isLoading,
    refetch,
    createNote,
    updateNote,
    togglePinNote,
    deleteNote,
  };
}
