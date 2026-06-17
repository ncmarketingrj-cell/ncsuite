import { useEffect, useRef, useState, useCallback } from "react";
import { useFunnelState } from "./useFunnelState";
import { supabase } from "@/integrations/supabase/client";
import { debounce, isEqual } from "lodash";
import { toast } from "sonner";

export function useFunnelAutoSave(funnelId: string | null) {
  const { nodes, edges } = useFunnelState();
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  // Keep a ref of the last saved state to avoid redundant saves
  const lastSavedNodes = useRef(nodes);
  const lastSavedEdges = useRef(edges);

  const debouncedSave = useCallback(
    debounce(async (currentNodes, currentEdges, fid) => {
      if (!fid) return;

      // Only save if there's an actual mutation
      if (
        isEqual(currentNodes, lastSavedNodes.current) &&
        isEqual(currentEdges, lastSavedEdges.current)
      ) {
        return;
      }

      setIsSaving(true);

      try {
        // Here we would normally call an Edge Function RPC 'upsert_funnel_snapshot' 
        // or directly update the funnel_nodes and funnel_edges tables.
        // For now, we simulate the database roundtrip and update the viewport/nodes.
        
        // await supabase.rpc('save_funnel_graph', { p_funnel_id: fid, p_nodes: currentNodes, p_edges: currentEdges });
        
        // Simulating network delay
        await new Promise(resolve => setTimeout(resolve, 600));

        lastSavedNodes.current = currentNodes;
        lastSavedEdges.current = currentEdges;
        setLastSaved(new Date());
      } catch (error) {
        console.error("Auto-save failed:", error);
        toast.error("Falha ao salvar o mapa mental");
      } finally {
        setIsSaving(false);
      }
    }, 1500),
    []
  );

  useEffect(() => {
    if (funnelId && nodes.length > 0) {
      debouncedSave(nodes, edges, funnelId);
    }
    
    // Cleanup on unmount
    return () => {
      debouncedSave.cancel();
    };
  }, [nodes, edges, funnelId, debouncedSave]);

  return { isSaving, lastSaved };
}
