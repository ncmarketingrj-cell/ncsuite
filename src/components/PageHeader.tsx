import type { ReactNode } from "react";
import { motion } from "framer-motion";

interface PageHeaderProps {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  compact?: boolean;
}

export function PageHeader({ eyebrow, title, description, actions, compact }: PageHeaderProps) {
  return (
    <motion.header
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.4, 0, 0.2, 1] }}
      className={`relative flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between ${compact ? "pb-2 sm:pb-5" : "pb-7"}`}
    >
      {/* Racing stripe inferior */}
      <div className="racing-stripe absolute bottom-0 left-0 right-0" />

      <div>
        <div className={`kpi-tag ${compact ? "mb-1 sm:mb-3" : "mb-3"}`}>{eyebrow}</div>
        <h1 className={`header-sport font-display font-black tracking-tight ${compact ? "text-xl sm:text-2xl lg:text-3xl" : "text-2xl sm:text-3xl"}`}>{title}</h1>
        {description && (
          <p className={`mt-1.5 max-w-xl text-sm text-muted-foreground leading-relaxed ${compact ? "hidden sm:block" : "hidden sm:block"}`}>{description}</p>
        )}
      </div>

      {actions && (
        <div className="mt-2 sm:mt-0 flex items-center gap-2 flex-wrap sm:flex-nowrap">{actions}</div>
      )}

      {/* NC watermark discreta no canto — só desktop */}
      <div
        className="pointer-events-none absolute top-0 right-0 hidden sm:block select-none"
        aria-hidden="true"
      >
        <span className="font-display font-black text-[10px] tracking-wider" style={{ color: "hsl(var(--primary) / 0.18)" }}>NC</span>
      </div>
    </motion.header>
  );
}
