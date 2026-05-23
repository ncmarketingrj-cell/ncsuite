export function Logo({ size = 32 }: { size?: number }) {
  return (
    <div className="flex items-center gap-3">
      <div
        className="relative flex items-center justify-center rounded-xl overflow-hidden shadow-glow-sm flex-shrink-0"
        style={{ width: size, height: size, background: "hsl(var(--primary))" }}
      >
        {/* Faixa superior reflexo (cockpit glass) */}
        <div
          className="absolute inset-x-0 top-0 bg-white/26 pointer-events-none"
          style={{ height: size * 0.13 }}
        />
        <span
          className="font-display font-black text-white relative z-10 tracking-tight"
          style={{ fontSize: size * 0.42 }}
        >
          NC
        </span>
        {/* Faixa inferior profundidade */}
        <div
          className="absolute inset-x-0 bottom-0 bg-black/20 pointer-events-none"
          style={{ height: size * 0.1 }}
        />
      </div>
      <div className="flex flex-col leading-none gap-[5px]">
        <span className="font-display text-sm font-black tracking-tight leading-none">NC Performance</span>
        <div className="flex items-center gap-[5px]">
          <div className="h-px w-2.5 bg-primary/65 rounded-full" />
          <span className="text-[7px] font-mono font-bold uppercase tracking-[0.28em] text-primary leading-none">
            Suite Automotiva
          </span>
          <div className="h-px w-2.5 bg-primary/65 rounded-full" />
        </div>
      </div>
    </div>
  );
}
