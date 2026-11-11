export function Logo({ size = 32, showText = true }: { size?: number; showText?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <img
        src="/assets/nc-logo.png"
        alt="NC Performance"
        className="w-auto object-contain transition-transform duration-300 drop-shadow-[0_0_12px_rgba(220,38,38,0.35)] flex-shrink-0"
        style={{ height: size }}
      />
      {showText && (
        <div className="flex flex-col leading-none gap-[5px]">
          <span className="font-display text-sm font-black tracking-normal leading-none">NC Performance</span>
          <div className="flex items-center gap-[5px]">
            <div className="h-px w-2.5 bg-primary/65 rounded-full" />
            <span className="text-[7px] font-mono font-bold uppercase tracking-[0.28em] text-primary leading-none">
              Suite Automotiva
            </span>
            <div className="h-px w-2.5 bg-primary/65 rounded-full" />
          </div>
        </div>
      )}
    </div>
  );
}
