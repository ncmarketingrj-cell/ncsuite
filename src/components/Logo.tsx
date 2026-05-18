export function Logo({ size = 32 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <div
        className="relative flex items-center justify-center rounded-xl shadow-glow-sm"
        style={{ width: size, height: size, background: "hsl(var(--primary))" }}
      >
        <span className="font-display font-black text-primary-foreground" style={{ fontSize: size * 0.45 }}>NC</span>
      </div>
      <div className="flex flex-col leading-none">
        <span className="font-display text-sm font-bold tracking-tight">Performance</span>
        <span className="text-[8px] font-mono font-bold uppercase tracking-[0.25em] text-primary">Suite</span>
      </div>
    </div>
  );
}
