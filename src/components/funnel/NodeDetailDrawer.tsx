import { useEffect, useState } from "react";
import { useFunnelState } from "@/hooks/useFunnelState";
import {
  X, Megaphone, Globe, MessageCircle, ShoppingCart,
  Bot, Target, FileText, Sparkles, Bold, Italic,
  List, Quote, AlignLeft, ChevronDown, Palette, Trash2
} from "lucide-react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";

const NODE_KINDS = [
  { label: "Anúncio",          icon: Megaphone,     color: "#3b82f6" },
  { label: "Landing Page",     icon: Globe,         color: "#8b5cf6" },
  { label: "WhatsApp",         icon: MessageCircle, color: "#10b981" },
  { label: "Checkout",         icon: ShoppingCart,  color: "#f59e0b" },
  { label: "Agente IA",        icon: Bot,           color: "#a855f7" },
  { label: "Captura de Lead",  icon: Target,        color: "#f97316" },
  { label: "Outro",            icon: FileText,      color: "#64748b" },
];

const PRESET_COLORS = [
  "#3b82f6", "#8b5cf6", "#10b981", "#f59e0b",
  "#a855f7", "#f97316", "#ec4899", "#0ea5e9",
  "#14b8a6", "#ef4444", "#64748b", "#84cc16",
];

const CUSTOM_VALUES = [
  { label: "Primeiro Nome",   value: "{{contact.first_name}}" },
  { label: "E-mail",          value: "{{contact.email}}" },
  { label: "Telefone",        value: "{{contact.phone}}" },
  { label: "Nome da Loja",    value: "{{tenant.name}}" },
  { label: "Modelo do Carro", value: "{{car.model}}" },
];

export const NodeDetailDrawer = () => {
  const { selectedNodeId, setSelectedNodeId, nodes, updateNodeLabel, updateNodePayload, setNodes } =
    useFunnelState();
  const [showKindPicker, setShowKindPicker] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [customColor, setCustomColor] = useState("");

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: "Escreva a copy, script ou descrição desta etapa do funil..." }),
    ],
    content: (selectedNode?.data?.payload as any)?.markdown || "",
    onUpdate: ({ editor }) => {
      if (selectedNodeId) updateNodePayload(selectedNodeId, { markdown: editor.getHTML() });
    },
  });

  useEffect(() => {
    if (editor && selectedNode) {
      const current = (selectedNode.data?.payload as any)?.markdown || "";
      if (editor.getHTML() !== current) editor.commands.setContent(current);
    }
  }, [selectedNodeId, editor]);

  if (!selectedNodeId || !selectedNode) return null;

  const data = selectedNode.data as any;
  const currentKind = NODE_KINDS.find((k) => k.label === data.nodeKind) || NODE_KINDS[0];
  const currentColor = data.color || currentKind.color;

  const handleKindChange = (kind: typeof NODE_KINDS[0]) => {
    setNodes(
      nodes.map((n) =>
        n.id === selectedNodeId
          ? { ...n, data: { ...n.data, nodeKind: kind.label } }
          : n
      )
    );
    setShowKindPicker(false);
  };

  const handleColorChange = (color: string) => {
    setNodes(
      nodes.map((n) =>
        n.id === selectedNodeId ? { ...n, data: { ...n.data, color } } : n
      )
    );
  };

  const handleDelete = () => {
    setNodes(nodes.filter((n) => n.id !== selectedNodeId));
    setSelectedNodeId(null);
  };

  const insertVariable = (value: string) => editor?.chain().focus().insertContent(value).run();

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[100]" onClick={() => setSelectedNodeId(null)} />

      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 z-[101] w-full max-w-[440px] bg-background border-l border-border shadow-2xl flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: `${currentColor}18` }}
            >
              <currentKind.icon className="w-4.5 h-4.5" style={{ color: currentColor }} />
            </div>
            <div>
              <h2 className="text-sm font-black leading-none">Configurar Etapa</h2>
              <p className="text-[10px] text-muted-foreground mt-0.5">{data.nodeKind || "Padrão"}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={handleDelete}
              className="p-2 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
              title="Excluir etapa"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setSelectedNodeId(null)}
              className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto scrollbar-none p-5 space-y-5">

          {/* 1. Título */}
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-2">
              Título da Etapa
            </label>
            <input
              type="text"
              value={data.label as string}
              onChange={(e) => updateNodeLabel(selectedNodeId, e.target.value)}
              placeholder="Ex: Landing Page do Corolla"
              className="w-full bg-muted/40 border border-border rounded-xl px-4 py-2.5 text-sm font-semibold text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
            />
          </div>

          {/* 2. Tipo de Etapa */}
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-2">
              Tipo de Etapa
            </label>
            <div className="relative">
              <button
                onClick={() => { setShowKindPicker(!showKindPicker); setShowColorPicker(false); }}
                className="w-full flex items-center justify-between bg-muted/40 border border-border rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-muted/60 transition-all"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: `${currentColor}20` }}>
                    <currentKind.icon className="w-3.5 h-3.5" style={{ color: currentColor }} />
                  </div>
                  {currentKind.label}
                </div>
                <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${showKindPicker ? "rotate-180" : ""}`} />
              </button>

              {showKindPicker && (
                <div className="absolute top-full left-0 right-0 mt-1 z-20 bg-background border border-border rounded-xl shadow-xl overflow-hidden">
                  {NODE_KINDS.map((kind) => (
                    <button
                      key={kind.label}
                      onClick={() => handleKindChange(kind)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium hover:bg-muted transition-colors text-left ${currentKind.label === kind.label ? "bg-muted" : ""}`}
                    >
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${kind.color}18` }}>
                        <kind.icon className="w-3.5 h-3.5" style={{ color: kind.color }} />
                      </div>
                      {kind.label}
                      {currentKind.label === kind.label && (
                        <span className="ml-auto text-[9px] font-black text-primary uppercase">Atual</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 3. Cor do Card */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                <Palette className="w-3 h-3" />
                Cor do Card
              </label>
              <button
                onClick={() => { setShowColorPicker(!showColorPicker); setShowKindPicker(false); }}
                className="text-[9px] font-bold text-primary hover:text-primary/80 transition-colors"
              >
                {showColorPicker ? "Fechar" : "Personalizar"}
              </button>
            </div>

            {/* Current color preview */}
            <div
              className="h-2 w-full rounded-full mb-2 transition-all"
              style={{ background: currentColor }}
            />

            {/* Color grid */}
            {showColorPicker && (
              <div className="bg-muted/30 border border-border rounded-xl p-3 space-y-3">
                <div className="grid grid-cols-6 gap-1.5">
                  {PRESET_COLORS.map((color) => (
                    <button
                      key={color}
                      onClick={() => handleColorChange(color)}
                      className="w-full aspect-square rounded-lg border-2 transition-all hover:scale-110 active:scale-95"
                      style={{
                        background: color,
                        borderColor: currentColor === color ? "white" : "transparent",
                        boxShadow: currentColor === color ? `0 0 0 1px ${color}` : "none",
                      }}
                      title={color}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={customColor || currentColor}
                    onChange={(e) => {
                      setCustomColor(e.target.value);
                      handleColorChange(e.target.value);
                    }}
                    className="w-8 h-8 rounded-lg border border-border cursor-pointer bg-transparent"
                  />
                  <input
                    type="text"
                    value={customColor || currentColor}
                    onChange={(e) => {
                      setCustomColor(e.target.value);
                      if (/^#[0-9A-Fa-f]{6}$/.test(e.target.value)) handleColorChange(e.target.value);
                    }}
                    placeholder="#3b82f6"
                    className="flex-1 bg-background border border-border rounded-lg px-3 py-1.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                  <button
                    onClick={() => handleColorChange(currentKind.color)}
                    className="text-[10px] font-bold text-muted-foreground hover:text-foreground border border-border rounded-lg px-2 py-1.5 hover:bg-muted transition-all"
                  >
                    Reset
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 4. Variáveis Dinâmicas */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Variáveis Dinâmicas
              </label>
            </div>
            <p className="text-[10px] text-muted-foreground/60 mb-2">Clique para inserir na copy abaixo.</p>
            <div className="flex flex-wrap gap-1.5">
              {CUSTOM_VALUES.map((cv) => (
                <button
                  key={cv.value}
                  onClick={() => insertVariable(cv.value)}
                  className="px-2.5 py-1 bg-muted/60 hover:bg-muted border border-border rounded-lg text-[10px] font-mono text-primary hover:text-primary transition-colors"
                >
                  {cv.label}
                </button>
              ))}
            </div>
          </div>

          {/* 5. Editor de Copy */}
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-2">
              Copy / Roteiro / Descrição
            </label>
            <div className="border border-border rounded-xl overflow-hidden bg-muted/20 focus-within:ring-2 focus-within:ring-primary/40 transition-all">
              {/* Toolbar */}
              <div className="flex items-center gap-0.5 p-2 border-b border-border/60 bg-muted/30">
                {[
                  { action: () => editor?.chain().focus().toggleBold().run(),       icon: Bold,      active: editor?.isActive("bold"),       title: "Negrito" },
                  { action: () => editor?.chain().focus().toggleItalic().run(),     icon: Italic,    active: editor?.isActive("italic"),     title: "Itálico" },
                  { action: () => editor?.chain().focus().toggleBulletList().run(), icon: List,      active: editor?.isActive("bulletList"), title: "Lista" },
                  { action: () => editor?.chain().focus().toggleBlockquote().run(), icon: Quote,     active: editor?.isActive("blockquote"), title: "Citação" },
                  { action: () => editor?.chain().focus().setParagraph().run(),     icon: AlignLeft, active: editor?.isActive("paragraph"),  title: "Parágrafo" },
                ].map(({ action, icon: Icon, active, title }, i) => (
                  <button
                    key={i}
                    onClick={action}
                    title={title}
                    className={`p-1.5 rounded-md transition-colors ${
                      active ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </button>
                ))}
              </div>
              <div className="p-3 min-h-[160px] prose prose-sm dark:prose-invert max-w-none [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[120px] [&_.ProseMirror_p.is-editor-empty:first-child::before]:text-muted-foreground/40">
                <EditorContent editor={editor} />
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground/60 mt-1.5">
              Descreva o objetivo desta etapa, o script de vendas ou a copy do anúncio.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 border-t border-border px-5 py-3 flex items-center justify-between">
          <p className="text-[10px] text-muted-foreground">Alterações salvas automaticamente</p>
          <button
            onClick={() => setSelectedNodeId(null)}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-xl text-xs font-bold hover:bg-primary/90 transition-colors"
          >
            Concluir
          </button>
        </div>
      </div>
    </>
  );
};
