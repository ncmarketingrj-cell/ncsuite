import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY não configurada");

    const { prompt, context, layout = "radial", maxDepth = 3, maxBranches = 5 } = await req.json();
    if (!prompt) return new Response(JSON.stringify({ error: "prompt é obrigatório" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const systemPrompt = `Você é um especialista em criação de mapas mentais para agências de marketing e tráfego pago.
Dado um tema, crie uma estrutura hierárquica de mapa mental em JSON.

REGRAS:
- O nó raiz (id: "root") é o tema central
- Profundidade máxima: ${maxDepth} níveis
- Máximo ${maxBranches} filhos por nó
- Labels curtos e objetivos (máx 6 palavras)
- Use emojis relevantes em cada nó
- Cores: vermelho (#e11d48) para raiz, laranja (#f97316) para nível 1, amarelo (#eab308) para nível 2, verde (#22c55e) para nível 3
- Contexto adicional: ${context || "Agência de marketing digital automotivo"}

FORMATO DE SAÍDA (JSON puro, sem markdown):
{
  "title": "Título do mapa",
  "nodes": [
    { "id": "root", "label": "Tema Central", "emoji": "🎯", "color": "#e11d48", "parentId": null },
    { "id": "n1", "label": "Ramo 1", "emoji": "📊", "color": "#f97316", "parentId": "root" },
    { "id": "n1_1", "label": "Sub-tópico", "emoji": "✅", "color": "#eab308", "parentId": "n1" }
  ]
}`;

    const res = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${GEMINI_API_KEY}` },
        body: JSON.stringify({
          model: "gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Crie um mapa mental sobre: ${prompt}` }
          ],
          temperature: 0.7,
          max_tokens: 2048
        })
      }
    );

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Gemini error: ${err}`);
    }

    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content || "";

    // Extrai JSON da resposta
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Resposta do Gemini não contém JSON válido");

    const parsed = JSON.parse(jsonMatch[0]);
    const nodes: any[] = parsed.nodes || [];

    // Calcula posições baseadas no layout escolhido
    const positioned = calculatePositions(nodes, layout);

    return new Response(JSON.stringify({
      success: true,
      title: parsed.title || prompt,
      nodes: positioned,
      edges: buildEdges(nodes)
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err: any) {
    console.error("[ai-mind-map-generator]", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});

function calculatePositions(nodes: any[], layout: string) {
  const nodeMap = new Map(nodes.map(n => [n.id, { ...n, children: [] as string[] }]));

  // Mapeia filhos
  nodes.forEach(n => {
    if (n.parentId && nodeMap.has(n.parentId)) {
      nodeMap.get(n.parentId)!.children.push(n.id);
    }
  });

  const W = 220, H = 80, GAP_X = 80, GAP_Y = 60;

  if (layout === "radial") {
    // Layout radial: posição trigonométrica por nível
    const root = nodeMap.get("root");
    if (root) { root.pos_x = 0; root.pos_y = 0; }

    const levelNodes = new Map<number, string[]>();
    const getLevel = (id: string, lvl = 0): void => {
      const n = nodeMap.get(id);
      if (!n) return;
      if (!levelNodes.has(lvl)) levelNodes.set(lvl, []);
      levelNodes.get(lvl)!.push(id);
      n.children.forEach((cid: string) => getLevel(cid, lvl + 1));
    };
    getLevel("root");

    levelNodes.forEach((ids, level) => {
      if (level === 0) return;
      const radius = level * (W + GAP_X);
      ids.forEach((id, i) => {
        const angle = (2 * Math.PI * i) / ids.length - Math.PI / 2;
        const n = nodeMap.get(id)!;
        n.pos_x = Math.cos(angle) * radius;
        n.pos_y = Math.sin(angle) * radius;
      });
    });

  } else if (layout === "tree") {
    // Layout árvore: organograma vertical
    let col = 0;
    const assignPos = (id: string, depth: number) => {
      const n = nodeMap.get(id);
      if (!n) return;
      if (n.children.length === 0) {
        n.pos_x = col * (W + GAP_X);
        n.pos_y = depth * (H + GAP_Y);
        col++;
      } else {
        const startCol = col;
        n.children.forEach((cid: string) => assignPos(cid, depth + 1));
        const endCol = col - 1;
        n.pos_x = ((startCol + endCol) / 2) * (W + GAP_X);
        n.pos_y = depth * (H + GAP_Y);
      }
    };
    assignPos("root", 0);

  } else {
    // Layout livre: grade simples
    nodes.forEach((n, i) => {
      const node = nodeMap.get(n.id)!;
      node.pos_x = (i % 4) * (W + GAP_X);
      node.pos_y = Math.floor(i / 4) * (H + GAP_Y);
    });
  }

  return Array.from(nodeMap.values());
}

function buildEdges(nodes: any[]) {
  return nodes
    .filter(n => n.parentId)
    .map(n => ({
      id: `e_${n.parentId}_${n.id}`,
      source_id: n.parentId,
      target_id: n.id,
      style: "bezier",
      color: "#6b7280",
      animated: false
    }));
}
