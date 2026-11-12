// ──────────────────────────────────────────────────────────────────────────────
// mindMapService.ts — Serviço de Gestão e Persistência Completa de Mapas Mentais
// ──────────────────────────────────────────────────────────────────────────────

import { supabase } from "@/integrations/supabase-external/client";
import type { Node, Edge } from "@xyflow/react";
import type { MindMapTemplate } from "./mindMapTemplates";

export interface MindMapRecord {
  id: string;
  user_id?: string;
  title: string;
  description?: string;
  layout: "radial" | "tree" | "list" | "free";
  theme?: string;
  bg_color?: string;
  created_at: string;
  updated_at: string;
  node_count?: number;
}

const LOCAL_STORAGE_KEY_PREFIX = "nc_mind_map_backup_";
const LOCAL_STORAGE_ALL_MAPS_KEY = "nc_mind_maps_manifest";

/**
 * Carrega a lista completa de mapas do usuário (Supabase com fallback LocalStorage)
 */
export async function listUserMindMaps(): Promise<MindMapRecord[]> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data, error } = await (supabase as any)
        .from("mind_maps")
        .select("*, mind_map_nodes(id)")
        .order("updated_at", { ascending: false });

      if (!error && Array.isArray(data)) {
        const mapped = data.map((m: any) => ({
          ...m,
          node_count: Array.isArray(m.mind_map_nodes) ? m.mind_map_nodes.length : 0,
        }));
        // Salva cópia de segurança no localStorage
        try {
          localStorage.setItem(LOCAL_STORAGE_ALL_MAPS_KEY, JSON.stringify(mapped));
        } catch {}
        return mapped;
      }
    }
  } catch (err) {
    console.warn("[mindMapService] Erro ao buscar mapas no Supabase, usando cache:", err);
  }

  // Fallback cache local
  try {
    const cached = localStorage.getItem(LOCAL_STORAGE_ALL_MAPS_KEY);
    if (cached) return JSON.parse(cached);
  } catch {}

  return [];
}

/**
 * Cria um novo mapa em branco ou a partir de um template
 */
export async function createNewMindMap(
  title = "Novo Mapa Mental",
  template?: MindMapTemplate | null,
  layout: "radial" | "tree" | "list" | "free" = "radial"
): Promise<{ map: MindMapRecord; nodes: Node[]; edges: Edge[] }> {
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id || "anonymous";
  const now = new Date().toISOString();

  const newMapRecord: Partial<MindMapRecord> = {
    title,
    description: template ? template.description : undefined,
    layout,
    theme: "mindmeister_dark",
    updated_at: now,
  };

  let createdId = `map_${Date.now()}`;

  if (user) {
    try {
      const { data, error } = await (supabase as any)
        .from("mind_maps")
        .insert({
          user_id: user.id,
          title,
          description: template?.description,
          layout,
          theme: "mindmeister_dark",
        })
        .select()
        .single();

      if (!error && data?.id) {
        createdId = data.id;
      }
    } catch (e) {
      console.warn("[mindMapService] Erro ao criar mapa no Supabase, usando ID local:", e);
    }
  }

  // Prepara nós e arestas (do template ou nó central em branco)
  const rootId = `root_${Date.now()}`;
  const rootNode: Node = {
    id: rootId,
    type: "mind",
    position: { x: 0, y: 0 },
    data: {
      label: template ? template.rootLabel : "Ideia Central",
      emoji: template ? template.rootEmoji : "🎯",
      color: "#e11d48",
      fontSize: 16,
      bold: true,
      isRoot: true,
      branchColor: "#e11d48",
      links: [],
    },
  };

  const initialNodes: Node[] = [rootNode];
  const initialEdges: Edge[] = [];

  if (template && template.nodes.length > 0) {
    const idMap = new Map<string, string>();
    idMap.set("root", rootId);

    template.nodes.forEach((tn) => {
      const realId = `n_${tn.id}_${Date.now()}`;
      idMap.set(tn.id, realId);

      const parentRealId = tn.parentId ? idMap.get(tn.parentId) || rootId : rootId;

      initialNodes.push({
        id: realId,
        type: "mind",
        position: { x: tn.offsetX, y: tn.offsetY },
        data: {
          label: tn.label,
          emoji: tn.emoji || "💡",
          color: tn.color,
          bgColor: tn.bgColor,
          note: tn.note,
          status: tn.status,
          parentId: parentRealId,
          branchColor: tn.color,
          fontSize: 13,
          links: [],
        },
      });

      initialEdges.push({
        id: `e_${parentRealId}_${realId}`,
        source: parentRealId,
        target: realId,
        type: "smoothstep",
        markerEnd: { type: "arrowclosed" as any, color: tn.color },
        style: { stroke: tn.color, strokeWidth: 2.5 },
      });
    });
  }

  const mapResult: MindMapRecord = {
    id: createdId,
    user_id: userId,
    title,
    layout,
    theme: "mindmeister_dark",
    created_at: now,
    updated_at: now,
    node_count: initialNodes.length,
  };

  // Salva cópia imediata no Supabase se logado
  if (user && createdId.indexOf("map_") === -1) {
    saveMindMapContent(createdId, title, layout, initialNodes, initialEdges).catch(() => {});
  }

  // Backup LocalStorage
  try {
    localStorage.setItem(`${LOCAL_STORAGE_KEY_PREFIX}${createdId}`, JSON.stringify({ nodes: initialNodes, edges: initialEdges, title, layout }));
  } catch {}

  return {
    map: mapResult,
    nodes: initialNodes,
    edges: initialEdges,
  };
}

/**
 * Salva nós e arestas de um mapa no Supabase e no LocalStorage
 */
export async function saveMindMapContent(
  mapId: string,
  title: string,
  layout: string,
  nodes: Node[],
  edges: Edge[]
): Promise<boolean> {
  // Salva no LocalStorage imediatamente como garantia
  try {
    localStorage.setItem(
      `${LOCAL_STORAGE_KEY_PREFIX}${mapId}`,
      JSON.stringify({ nodes, edges, title, layout, updated_at: new Date().toISOString() })
    );
  } catch {}

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return true;

    // Atualiza metadados do mapa
    await (supabase as any)
      .from("mind_maps")
      .update({
        title,
        layout,
        updated_at: new Date().toISOString(),
      })
      .eq("id", mapId);

    // Substitui nós e arestas de forma atômica
    await (supabase as any).from("mind_map_nodes").delete().eq("map_id", mapId);
    await (supabase as any).from("mind_map_edges").delete().eq("map_id", mapId);

    if (nodes.length > 0) {
      const nodeInserts = nodes.map((n) => ({
        id: n.id,
        map_id: mapId,
        parent_id: (n.data?.parentId as string) || null,
        label: n.data?.label || "Tópico",
        emoji: n.data?.emoji || null,
        note: n.data?.note || null,
        color: n.data?.color || "#e11d48",
        bg_color: n.data?.bgColor || null,
        font_size: n.data?.fontSize || 13,
        bold: n.data?.bold || false,
        pos_x: n.position.x,
        pos_y: n.position.y,
        slide_order: n.data?.slideOrder ?? null,
        metadata: {
          status: n.data?.status || null,
          links: n.data?.links || [],
          isRoot: n.data?.isRoot || false,
          branchColor: n.data?.branchColor || n.data?.color,
          checklist: n.data?.checklist || [],
          shape: n.data?.shape || "pill",
        },
      }));
      await (supabase as any).from("mind_map_nodes").insert(nodeInserts);
    }

    if (edges.length > 0) {
      const edgeInserts = edges.map((e) => ({
        id: e.id,
        map_id: mapId,
        source_id: e.source,
        target_id: e.target,
        label: String(e.label || ""),
        style: e.type || "smoothstep",
        color: (e.style as any)?.stroke || "#6b7280",
        animated: e.animated || false,
        metadata: {
          sourceHandle: e.sourceHandle,
          targetHandle: e.targetHandle,
        },
      }));
      await (supabase as any).from("mind_map_edges").insert(edgeInserts);
    }

    return true;
  } catch (err) {
    console.error("[mindMapService] Erro ao persistir no Supabase:", err);
    return false;
  }
}

/**
 * Carrega nós e arestas de um mapa específico
 */
export async function loadMindMapContent(
  mapId: string
): Promise<{ nodes: Node[]; edges: Edge[]; title?: string; layout?: string }> {
  try {
    const [{ data: dbN }, { data: dbE }] = await Promise.all([
      (supabase as any).from("mind_map_nodes").select("*").eq("map_id", mapId),
      (supabase as any).from("mind_map_edges").select("*").eq("map_id", mapId),
    ]);

    if (Array.isArray(dbN) && dbN.length > 0) {
      const ns: Node[] = dbN.map((n: any) => ({
        id: n.id,
        type: "mind",
        position: { x: Number(n.pos_x || 0), y: Number(n.pos_y || 0) },
        data: {
          label: n.label,
          emoji: n.emoji,
          note: n.note,
          parentId: n.parent_id || undefined,
          color: n.color || "#e11d48",
          bgColor: n.bg_color,
          fontSize: n.font_size || 13,
          bold: n.bold || false,
          slideOrder: n.slide_order,
          status: n.metadata?.status || undefined,
          links: n.metadata?.links || [],
          isRoot: n.metadata?.isRoot || false,
          branchColor: n.metadata?.branchColor || n.color,
          checklist: n.metadata?.checklist || [],
          shape: n.metadata?.shape || "pill",
        },
      }));

      const es: Edge[] = (dbE || []).map((e: any) => ({
        id: e.id,
        source: e.source_id,
        sourceHandle: e.metadata?.sourceHandle || null,
        target: e.target_id,
        targetHandle: e.metadata?.targetHandle || null,
        label: e.label,
        type: "smoothstep",
        animated: e.animated,
        markerEnd: { type: "arrowclosed" as any, color: e.color || "#6b7280" },
        style: { stroke: e.color || "#6b7280", strokeWidth: 2.5 },
      }));

      return { nodes: ns, edges: es };
    }
  } catch (err) {
    console.warn("[mindMapService] Falha ao carregar do banco, buscando do localStorage:", err);
  }

  // Fallback LocalStorage
  try {
    const cached = localStorage.getItem(`${LOCAL_STORAGE_KEY_PREFIX}${mapId}`);
    if (cached) {
      const parsed = JSON.parse(cached);
      return {
        nodes: parsed.nodes || [],
        edges: parsed.edges || [],
        title: parsed.title,
        layout: parsed.layout,
      };
    }
  } catch {}

  return { nodes: [], edges: [] };
}

/**
 * Duplica um mapa mental existente
 */
export async function duplicateMindMap(
  sourceMap: MindMapRecord
): Promise<MindMapRecord | null> {
  const content = await loadMindMapContent(sourceMap.id);
  const newTitle = `${sourceMap.title} (Cópia)`;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  try {
    const { data: created, error } = await (supabase as any)
      .from("mind_maps")
      .insert({
        user_id: user.id,
        title: newTitle,
        description: sourceMap.description,
        layout: sourceMap.layout,
        theme: sourceMap.theme || "mindmeister_dark",
      })
      .select()
      .single();

    if (error || !created) throw error;

    await saveMindMapContent(created.id, newTitle, sourceMap.layout, content.nodes, content.edges);

    return {
      ...created,
      node_count: content.nodes.length,
    };
  } catch (err) {
    console.error("[mindMapService] Erro ao duplicar mapa:", err);
    return null;
  }
}

/**
 * Renomeia um mapa mental
 */
export async function renameMindMap(mapId: string, newTitle: string): Promise<boolean> {
  try {
    await (supabase as any)
      .from("mind_maps")
      .update({ title: newTitle.trim(), updated_at: new Date().toISOString() })
      .eq("id", mapId);
    return true;
  } catch (err) {
    console.error("[mindMapService] Erro ao renomear mapa:", err);
    return false;
  }
}

/**
 * Exclui um mapa mental permanentemente
 */
export async function deleteMindMap(mapId: string): Promise<boolean> {
  try {
    await (supabase as any).from("mind_maps").delete().eq("id", mapId);
    try {
      localStorage.removeItem(`${LOCAL_STORAGE_KEY_PREFIX}${mapId}`);
    } catch {}
    return true;
  } catch (err) {
    console.error("[mindMapService] Erro ao excluir mapa:", err);
    return false;
  }
}

