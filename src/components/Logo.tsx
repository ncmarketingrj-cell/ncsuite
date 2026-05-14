export function Logo({ size = 32 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <div
        className="relative flex items-center justify-center rounded-lg shadow-glow-sm"
        style={{ width: size, height: size, background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--secondary)))" }}
      >
        <span className="font-display font-bold text-background" style={{ fontSize: size * 0.5 }}>NC</span>
      </div>
      <div className="flex flex-col leading-none">
        <span className="font-display text-sm font-semibold tracking-tight">Performance</span>
        <span className="label-mono text-[9px] text-primary">SUITE</span>
      </div>
    </div>
  );
}
