import { useState, useEffect, useRef } from "react";
import { format, subDays, startOfMonth, endOfMonth, startOfYear, endOfYear, isSameDay, isAfter, isBefore, addMonths, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Sparkles, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export type DateRange = {
  startDate: Date;
  endDate: Date;
};

interface DateRangePickerProps {
  startDate: Date;
  endDate: Date;
  onChange: (start: Date, end: Date) => void;
  className?: string;
}

const PRESETS = [
  { label: "Hoje", getValue: () => ({ start: new Date(), end: new Date() }) },
  { label: "Ontem", getValue: () => ({ start: subDays(new Date(), 1), end: subDays(new Date(), 1) }) },
  { label: "Últimos 3 Dias", getValue: () => ({ start: subDays(new Date(), 2), end: new Date() }) },
  { label: "Últimos 7 Dias", getValue: () => ({ start: subDays(new Date(), 6), end: new Date() }) },
  { label: "Últimos 30 Dias", getValue: () => ({ start: subDays(new Date(), 29), end: new Date() }) },
  { label: "Este Mês", getValue: () => ({ start: startOfMonth(new Date()), end: new Date() }) },
  { label: "Este Ano", getValue: () => ({ start: startOfYear(new Date()), end: new Date() }) },
  { label: "Último Ano", getValue: () => ({ start: subDays(new Date(), 365), end: new Date() }) },
];

export function DateRangePicker({ startDate, endDate, onChange, className = "" }: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date(startDate));
  const [tempStart, setTempStart] = useState<Date | null>(startDate);
  const [tempEnd, setTempEnd] = useState<Date | null>(endDate);
  
  const containerRef = useRef<HTMLDivElement>(null);

  // Fecha o popup ao clicar fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Mantém em sincronia se as datas externas mudarem
  useEffect(() => {
    if (isOpen) {
      setTempStart(startDate);
      setTempEnd(endDate);
      setCurrentMonth(new Date(startDate));
    }
  }, [isOpen, startDate, endDate]);

  const handlePresetClick = (preset: typeof PRESETS[0]) => {
    const { start, end } = preset.getValue();
    setTempStart(start);
    setTempEnd(end);
    onChange(start, end);
    setIsOpen(false);
  };

  const handleDayClick = (day: Date) => {
    if (!tempStart || (tempStart && tempEnd)) {
      setTempStart(day);
      setTempEnd(null);
    } else if (tempStart && !tempEnd) {
      if (isBefore(day, tempStart)) {
        setTempStart(day);
        setTempEnd(null);
      } else {
        setTempEnd(day);
        onChange(tempStart, day);
        setIsOpen(false); // Fecha ao escolher o range completo
      }
    }
  };

  // Funções auxiliares de renderização do calendário
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayIndex = new Date(year, month, 1).getDay();
  
  const daysArray = Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1));
  const blanksArray = Array.from({ length: firstDayIndex }, (_, i) => null);

  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));

  const isSelected = (day: Date) => {
    if (tempStart && isSameDay(day, tempStart)) return "start";
    if (tempEnd && isSameDay(day, tempEnd)) return "end";
    if (tempStart && tempEnd && isAfter(day, tempStart) && isBefore(day, tempEnd)) return "middle";
    return null;
  };

  const formattedLabel = () => {
    if (isSameDay(startDate, endDate)) {
      return format(startDate, "dd 'de' MMMM", { locale: ptBR });
    }
    return `${format(startDate, "dd/MM/yyyy")} — ${format(endDate, "dd/MM/yyyy")}`;
  };

  return (
    <div ref={containerRef} className={`relative select-none ${className}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-black uppercase tracking-widest transition hover:border-primary/40 hover:bg-white/10 shadow-inner"
      >
        <CalendarIcon className="h-4 w-4 text-primary" />
        <span>{formattedLabel()}</span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full z-[100] mt-2 flex flex-col md:flex-row rounded-2xl border border-white/10 bg-background/95 p-4 shadow-2xl backdrop-blur-2xl gap-4 w-[300px] sm:w-[350px] md:w-[550px] max-w-[calc(100vw-2rem)] origin-top-right"
          >
            {/* Atalhos Rápidos */}
            <div className="flex flex-col gap-1.5 border-b md:border-b-0 md:border-r border-white/5 pb-3 md:pb-0 md:pr-4 min-w-[130px]">
              <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-2 flex items-center gap-1">
                <Sparkles className="h-2.5 w-2.5 text-primary" /> Atalhos Rápidos
              </p>
              {PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => handlePresetClick(preset)}
                  className="w-full text-left px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:bg-white/5 hover:text-primary transition-all duration-200"
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Calendário */}
            <div className="flex-1 flex flex-col">
              {/* Controles Mês/Ano */}
              <div className="flex items-center justify-between mb-4">
                <button
                  onClick={prevMonth}
                  className="p-1.5 rounded-lg border border-white/5 bg-white/5 hover:bg-white/10 transition"
                >
                  <ChevronLeft className="h-4 w-4 text-muted-foreground" />
                </button>
                <span className="text-xs font-black uppercase tracking-widest text-foreground">
                  {format(currentMonth, "MMMM yyyy", { locale: ptBR })}
                </span>
                <button
                  onClick={nextMonth}
                  className="p-1.5 rounded-lg border border-white/5 bg-white/5 hover:bg-white/10 transition"
                >
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>

              {/* Dias da Semana */}
              <div className="grid grid-cols-7 gap-1 text-center mb-2">
                {["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => (
                  <span key={i} className="text-[9px] font-black text-muted-foreground/60 w-8 py-1">
                    {d}
                  </span>
                ))}
              </div>

              {/* Grid dos Dias */}
              <div className="grid grid-cols-7 gap-1">
                {blanksArray.map((_, i) => (
                  <div key={`blank-${i}`} className="w-8 h-8" />
                ))}

                {daysArray.map((day) => {
                  const selectState = isSelected(day);
                  const isFutureDay = isAfter(day, new Date());
                  
                  return (
                    <button
                      key={day.toISOString()}
                      disabled={isFutureDay}
                      onClick={() => handleDayClick(day)}
                      className={`w-8 h-8 text-[10px] font-bold rounded-lg transition-all duration-150 flex items-center justify-center relative ${
                        isFutureDay
                          ? "opacity-25 cursor-not-allowed text-muted-foreground"
                          : selectState === "start"
                          ? "bg-primary text-background font-black shadow-glow-sm scale-110 z-10"
                          : selectState === "end"
                          ? "bg-secondary text-background font-black shadow-glow-sm scale-110 z-10"
                          : selectState === "middle"
                          ? "bg-primary/15 text-primary rounded-none hover:bg-primary/20"
                          : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                      }`}
                    >
                      {day.getDate()}
                      {isSameDay(day, new Date()) && !selectState && (
                        <span className="absolute bottom-1 h-1 w-1 rounded-full bg-primary" />
                      )}
                    </button>
                  );
                })}
              </div>
              
              <div className="mt-4 border-t border-white/5 pt-3 flex items-center justify-between text-[9px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <AlertCircle className="h-3 w-3 text-muted-foreground/60" /> Sincronize antes para dados de hoje.
                </span>
                <span className="font-bold text-primary/80 uppercase">Victoria AI Engine</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
