import type { ReactNode } from "react";
import { motion } from "framer-motion";

interface PageHeaderProps {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}

export function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
  return (
    <motion.header
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between"
    >
      <div>
        <p className="label-mono text-primary">{eyebrow}</p>
        <h1 className="mt-2 font-display text-3xl font-bold">{title}</h1>
        {description && (
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="mt-4 flex items-center gap-2 sm:mt-0">{actions}</div>}
    </motion.header>
  );
}
