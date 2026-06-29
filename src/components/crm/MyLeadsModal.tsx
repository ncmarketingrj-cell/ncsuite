import React from "react";
import { X, User } from "lucide-react";
import { LeadListView } from "./LeadListView";
import { motion, AnimatePresence } from "framer-motion";

interface MyLeadsModalProps {
  isOpen: boolean;
  onClose: () => void;
  pipelineId?: string;
  clientId?: string;
  currentUserId?: string;
  onClickLead: (lead: any) => void;
  refetchTrigger: number;
}

export function MyLeadsModal({
  isOpen,
  onClose,
  pipelineId,
  clientId,
  currentUserId,
  onClickLead,
  refetchTrigger
}: MyLeadsModalProps) {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
      >
        <motion.div
          initial={{ scale: 0.95, y: 10 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.95, y: 10 }}
          className="bg-background border border-white/10 rounded-2xl w-full max-w-7xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-white/5 bg-black/20 shrink-0">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
                <User className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground">Meus Leads</h2>
                <p className="text-xs text-muted-foreground">Listagem de leads atribuídos a você no funil atual.</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full text-muted-foreground hover:text-foreground transition-all cursor-pointer">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 overflow-hidden relative p-4 bg-background/50">
             <LeadListView 
                pipelineId={pipelineId}
                clientId={clientId}
                searchQuery=""
                myLeadsOnly={true}
                currentUserId={currentUserId}
                onClickLead={onClickLead}
                refetchTrigger={refetchTrigger}
                inModal={true}
             />
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
