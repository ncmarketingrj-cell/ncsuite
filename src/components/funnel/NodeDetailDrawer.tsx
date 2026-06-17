import { useEffect } from "react";
import { useFunnelState } from "@/hooks/useFunnelState";
import { X, Type, Heading1, List, Quote, Sparkles } from "lucide-react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";

const CUSTOM_VALUES = [
  { label: "Primeiro Nome", value: "{{contact.first_name}}" },
  { label: "E-mail", value: "{{contact.email}}" },
  { label: "Telefone", value: "{{contact.phone}}" },
  { label: "Nome da Loja", value: "{{tenant.name}}" },
];

export const NodeDetailDrawer = () => {
  const { selectedNodeId, setSelectedNodeId, nodes, updateNodeLabel, updateNodePayload } = useFunnelState();
  
  const selectedNode = nodes.find(n => n.id === selectedNodeId);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: "Escreva a copy da página ou mensagem do WhatsApp aqui... Use as variáveis dinâmicas.",
      }),
    ],
    content: selectedNode?.data?.payload?.markdown || "",
    onUpdate: ({ editor }) => {
      if (selectedNodeId) {
        updateNodePayload(selectedNodeId, { markdown: editor.getHTML() });
      }
    },
  });

  useEffect(() => {
    if (editor && selectedNode) {
      const currentContent = selectedNode.data?.payload?.markdown || "";
      if (editor.getHTML() !== currentContent) {
        editor.commands.setContent(currentContent);
      }
    }
  }, [selectedNodeId, editor]); // Só roda quando muda o nó

  if (!selectedNodeId || !selectedNode) return null;

  const insertVariable = (variable: string) => {
    editor?.chain().focus().insertContent(variable).run();
  };

  return (
    <>
      {/* Backdrop overlay */}
      <div 
        className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm"
        onClick={() => setSelectedNodeId(null)}
      />

      {/* Drawer Panel */}
      <div className="fixed right-0 top-0 bottom-0 z-[101] w-full max-w-md bg-background/95 backdrop-blur-xl border-l border-white/10 shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
        <div className="flex items-center justify-between p-4 border-b border-white/5">
          <div>
            <h2 className="text-base font-black text-white">Configuração do Nó</h2>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-mono">Edição Avançada</p>
          </div>
          <button 
            onClick={() => setSelectedNodeId(null)}
            className="p-2 hover:bg-white/10 rounded-full text-muted-foreground hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 scrollbar-none">
          {/* Label Editor */}
          <div className="space-y-2 mb-6">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Título da Etapa</label>
            <input 
              type="text"
              value={selectedNode.data.label as string}
              onChange={(e) => updateNodeLabel(selectedNodeId, e.target.value)}
              className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
            />
          </div>

          {/* Variables Injector */}
          <div className="space-y-3 mb-6">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Variáveis Dinâmicas</label>
            </div>
            <div className="flex flex-wrap gap-2">
              {CUSTOM_VALUES.map(cv => (
                <button
                  key={cv.value}
                  onClick={() => insertVariable(cv.value)}
                  className="px-2.5 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-[10px] font-mono text-primary transition-colors"
                >
                  {cv.label} <span className="opacity-50 ml-1">{cv.value}</span>
                </button>
              ))}
            </div>
          </div>

          {/* TipTap Rich Text Editor */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Conteúdo / Copy (Markdown)</label>
            
            <div className="border border-white/10 rounded-xl overflow-hidden bg-black/20 focus-within:ring-2 focus-within:ring-primary/50 transition-all">
              {/* Toolbar */}
              <div className="flex items-center gap-1 p-2 border-b border-white/5 bg-white/[0.02]">
                <button onClick={() => editor?.chain().focus().toggleBold().run()} className={`p-1.5 rounded-md hover:bg-white/10 ${editor?.isActive('bold') ? 'bg-white/10 text-white' : 'text-muted-foreground'}`}><Type className="w-4 h-4" /></button>
                <button onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} className={`p-1.5 rounded-md hover:bg-white/10 ${editor?.isActive('heading', { level: 2 }) ? 'bg-white/10 text-white' : 'text-muted-foreground'}`}><Heading1 className="w-4 h-4" /></button>
                <div className="w-px h-4 bg-white/10 mx-1" />
                <button onClick={() => editor?.chain().focus().toggleBulletList().run()} className={`p-1.5 rounded-md hover:bg-white/10 ${editor?.isActive('bulletList') ? 'bg-white/10 text-white' : 'text-muted-foreground'}`}><List className="w-4 h-4" /></button>
                <button onClick={() => editor?.chain().focus().toggleBlockquote().run()} className={`p-1.5 rounded-md hover:bg-white/10 ${editor?.isActive('blockquote') ? 'bg-white/10 text-white' : 'text-muted-foreground'}`}><Quote className="w-4 h-4" /></button>
              </div>
              
              {/* Editor Content */}
              <div className="p-4 min-h-[250px] prose prose-invert prose-sm max-w-none focus:outline-none tiptap-editor">
                <EditorContent editor={editor} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
