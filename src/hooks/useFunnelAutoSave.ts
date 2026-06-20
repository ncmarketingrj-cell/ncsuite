import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFunnelState } from "./useFunnelState";
import { supabase } from "@/integrations/supabase/client";
import { debounce, isEqual } from "lodash";
import { toast } from "sonner";

export function useFunnelAutoSave(funnelId: string | null) {
  const { nodes, edges } = useFunnelState();

  // Always-current refs (no stale closure risk)
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  nodesRef.current = nodes;
  edgesRef.current = edges;

  const lastSavedNodes = useRef(nodes);
  const lastSavedEdges = useRef(edges);

  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  const doSave = useCallback(async (fid: string, silent = true) => {
    const ns = nodesRef.current;
    const es = edgesRef.current;
    setIsSaving(true);
    try {
      const { error } = await (supabase as any)
        .from("funnels")
        .update({ global_settings: { nodes: ns, edges: es } })
        .eq("id", fid);

      if (error) throw error;

      lastSavedNodes.current = ns;
      lastSavedEdges.current = es;
      setLastSaved(new Date());
      if (!silent) toast.success("Funil salvo!");
    } catch (err) {
      console.error("Save failed:", err);
      if (!silent) toast.error("Erro ao salvar o funil");
    } finally {
      setIsSaving(false);
    }
  }, []);

  // Debounced auto-save (fires 2s after last change)
  const debouncedSave = useMemo(() => debounce((fid: string) => {
    const hasChanges =
      !isEqual(nodesRef.current, lastSavedNodes.current) ||
      !isEqual(edgesRef.current, lastSavedEdges.current);
    if (hasChanges) doSave(fid, true);
  }, 2000), [doSave]);

  useEffect(() => {
    if (!funnelId) return;
    debouncedSave(funnelId);
    return () => { debouncedSave.cancel(); };
  }, [nodes, edges, funnelId, debouncedSave]);

  // Manual save (immediate, shows toast)
  const saveNow = useCallback(async () => {
    if (!funnelId) return;
    debouncedSave.cancel();
    await doSave(funnelId, false);
  }, [funnelId, doSave, debouncedSave]);

  return { isSaving, lastSaved, saveNow };
}
