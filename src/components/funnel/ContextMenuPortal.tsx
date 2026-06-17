import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Copy, Trash2, Palette, Edit3, Settings } from "lucide-react";

interface ContextMenuProps {
  x: number;
  y: number;
  nodeId: string | null;
  onClose: () => void;
  onDuplicate?: (id: string) => void;
  onDelete?: (id: string) => void;
  onChangeColor?: (id: string, color: string) => void;
  onEdit?: (id: string) => void;
}

const COLORS = [
  "bg-indigo-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-red-500",
  "bg-pink-500",
  "bg-cyan-500"
];

export const ContextMenuPortal = ({
  x,
  y,
  nodeId,
  onClose,
  onDuplicate,
  onDelete,
  onChangeColor,
  onEdit,
}: ContextMenuProps) => {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    
    // Slight delay to avoid immediately closing from the trigger click
    setTimeout(() => {
      document.addEventListener("click", handleClickOutside);
    }, 10);
    
    return () => document.removeEventListener("click", handleClickOutside);
  }, [onClose]);

  if (!nodeId) return null;

  // Render using portal to escape any overflow: hidden or z-index issues from React Flow
  return createPortal(
    <AnimatePresence>
      <motion.div
        ref={menuRef}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.15 }}
        className="fixed z-[9999] w-48 rounded-xl border border-white/10 bg-background/95 backdrop-blur-xl shadow-2xl p-1"
        style={{ top: y, left: x }}
      >
        <div className="p-2 pb-1 text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">
          Ações do Nó
        </div>
        
        <div className="flex gap-1 p-1 mb-1">
          {COLORS.map(color => (
            <button
              key={color}
              onClick={() => {
                if (onChangeColor) onChangeColor(nodeId, color);
                onClose();
              }}
              className={`w-6 h-6 rounded-full ${color} hover:ring-2 hover:ring-white/50 transition-all`}
            />
          ))}
        </div>

        <button 
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm hover:bg-white/5 transition-colors"
          onClick={() => {
            if (onEdit) onEdit(nodeId);
            onClose();
          }}
        >
          <Edit3 className="w-4 h-4 text-muted-foreground" />
          <span>Editar Payload</span>
        </button>

        <button 
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm hover:bg-white/5 transition-colors"
          onClick={() => {
            if (onDuplicate) onDuplicate(nodeId);
            onClose();
          }}
        >
          <Copy className="w-4 h-4 text-muted-foreground" />
          <span>Duplicar</span>
        </button>

        <button 
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm hover:bg-white/5 transition-colors"
          onClick={() => {
            // Settings trigger
            onClose();
          }}
        >
          <Settings className="w-4 h-4 text-muted-foreground" />
          <span>Configurações</span>
        </button>

        <div className="h-px bg-white/10 my-1 mx-2" />

        <button 
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm hover:bg-red-500/10 text-red-500 transition-colors"
          onClick={() => {
            if (onDelete) onDelete(nodeId);
            onClose();
          }}
        >
          <Trash2 className="w-4 h-4" />
          <span>Excluir Nó</span>
        </button>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
};
