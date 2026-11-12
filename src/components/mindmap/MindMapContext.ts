import { createContext } from "react";

export type MindMapDir = "top" | "bottom" | "left" | "right";

export interface MindMapActionsCtx {
  addChildNode: (parentId: string, dir?: MindMapDir) => void;
  addSiblingNode: (nodeId: string) => void;
  editNode: (nodeId: string) => void;
  deleteNode: (nodeId: string) => void;
  searchTerm: string;
}

export const MindMapActionsContext = createContext<MindMapActionsCtx>({
  addChildNode: () => {},
  addSiblingNode: () => {},
  editNode: () => {},
  deleteNode: () => {},
  searchTerm: "",
});
