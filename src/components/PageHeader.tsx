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
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.4, 0, 0.2, 1] }}
      className="relative flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between pb-7"
    >
      {/* Racing stripe inferior */}
      <div className="racing-stripe absolute bottom-0 left-0 right-0" />

      <div>
        {/* Eyebrow com kpi-tag estilo automotivo */}
        <div className="kpi-tag mb-3">{eyebrow}</div>
        {/* Título com barra lateral neon */}
        <h1 className="header-sport font-display text-3xl font-black tracking-tight">{title}</h1>
        {description && (
          <p className="mt-2 max-w-xl text-sm text-muted-foreground leading-relaxed">{description}</p>
        )}
      </div>

      {actions && (
        <div className="mt-4 flex items-center gap-2 sm:mt-0 flex-wrap">{actions}</div>
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
