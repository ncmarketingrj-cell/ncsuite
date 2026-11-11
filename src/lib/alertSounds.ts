// src/lib/alertSounds.ts
// Motor Sintetizador Web Audio API da NC Suite — 10 Toques de Alertas Exclusivos

export interface AlertSoundDef {
  id: string;
  name: string;
  category: "Padrão" | "Executivo" | "Tático" | "Crítico" | "Futurista" | "Suave";
  description: string;
  color: string;
}

export const ALERT_SOUNDS: AlertSoundDef[] = [
  {
    id: "ferrari_pulse",
    name: "Ferrari Pulse (Padrão NC)",
    category: "Padrão",
    description: "Duplo pulso esportivo e dinâmico de alta energia (880Hz → 1100Hz).",
    color: "from-red-500 to-rose-600",
  },
  {
    id: "executive_chime",
    name: "Chime Executivo",
    category: "Executivo",
    description: "Acorde maior tríade refinado (Dó-Mi-Sol) com decaimento suave para escritórios.",
    color: "from-amber-400 to-amber-600",
  },
  {
    id: "radar_ping",
    name: "Radar Ping",
    category: "Tático",
    description: "Pulso tático de sonar naval com pitch descendente de alta frequência.",
    color: "from-cyan-400 to-blue-600",
  },
  {
    id: "critical_siren",
    name: "Sirene de Risco",
    category: "Crítico",
    description: "Alerta oscilante bitonal de urgência para estouro de budget ou CPA crítico.",
    color: "from-red-600 to-rose-700",
  },
  {
    id: "digital_matrix",
    name: "Digital Matrix",
    category: "Futurista",
    description: "Arpeggio cibernético ascendente em 4 notas rápidas estilo interface Sci-Fi.",
    color: "from-emerald-400 to-teal-600",
  },
  {
    id: "zen_crystal",
    name: "Sino Cristalino",
    category: "Suave",
    description: "Harmônico cristalino puro com reverberação natural e tom sereno.",
    color: "from-purple-400 to-indigo-600",
  },
  {
    id: "cyber_glitch",
    name: "Cyber Glitch",
    category: "Futurista",
    description: "Onda dente de serra modulada em pulso de alta tecnologia.",
    color: "from-violet-400 to-fuchsia-600",
  },
  {
    id: "harmonic_harp",
    name: "Harpa Harmônica",
    category: "Suave",
    description: "Sequência harmônica ascendente em 5 notas aconchegantes.",
    color: "from-sky-400 to-blue-500",
  },
  {
    id: "tactical_beep",
    name: "Bipe Tático Militar",
    category: "Tático",
    description: "Três pulsos ultra-curtos e secos de precisão a 1000Hz.",
    color: "from-orange-400 to-amber-600",
  },
  {
    id: "sub_bass_drop",
    name: "Impacto Sub-Grave",
    category: "Executivo",
    description: "Pulso profundo e imersivo a 120Hz com sub-harmônicos de advertência.",
    color: "from-rose-500 to-red-700",
  },
];

const SOUND_PREF_KEY = "nc_alert_sound_type";
const VOLUME_PREF_KEY = "nc_alert_sound_volume";
export const ALERT_SOUND_TYPE_EVENT = "nc:alert-sound-type-changed";

export function getAlertSoundPreference(): string {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return "ferrari_pulse";
  try {
    return localStorage.getItem(SOUND_PREF_KEY) || "ferrari_pulse";
  } catch {
    return "ferrari_pulse";
  }
}

export function setAlertSoundPreference(toneId: string): void {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(SOUND_PREF_KEY, toneId);
  } catch {}
  window.dispatchEvent(new CustomEvent(ALERT_SOUND_TYPE_EVENT, { detail: toneId }));
}

export function getAlertVolumePreference(): number {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return 0.6;
  try {
    const v = localStorage.getItem(VOLUME_PREF_KEY);
    return v !== null ? parseFloat(v) : 0.6;
  } catch {
    return 0.6;
  }
}

export function setAlertVolumePreference(vol: number): void {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(VOLUME_PREF_KEY, vol.toString());
  } catch {}
}

let activeAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return null;
    if (!activeAudioCtx || activeAudioCtx.state === "closed") {
      activeAudioCtx = new Ctx();
    }
    if (activeAudioCtx.state === "suspended") {
      activeAudioCtx.resume();
    }
    return activeAudioCtx;
  } catch {
    return null;
  }
}

/**
 * Sintetizador Web Audio API: reproduz o toque selecionado sem depender de nenhum arquivo MP3 externo.
 */
export function playAlertTone(toneId?: string, overrideVolume?: number): void {
  const selectedTone = toneId || getAlertSoundPreference();
  const volume = overrideVolume !== undefined ? overrideVolume : getAlertVolumePreference();
  if (volume <= 0) return;

  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const masterGain = ctx.createGain();
  masterGain.connect(ctx.destination);
  masterGain.gain.setValueAtTime(volume, now);

  const createBeep = (freq: number, startTime: number, duration: number, type: OscillatorType = "sine", gainVal = 0.4) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);
    osc.connect(g);
    g.connect(masterGain);

    g.gain.setValueAtTime(0, startTime);
    g.gain.linearRampToValueAtTime(gainVal, startTime + 0.015);
    g.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    osc.start(startTime);
    osc.stop(startTime + duration + 0.02);
  };

  switch (selectedTone) {
    case "ferrari_pulse": {
      // 880Hz -> 880Hz -> 1100Hz enérgico
      createBeep(880, now, 0.1, "sine", 0.5);
      createBeep(880, now + 0.15, 0.1, "sine", 0.5);
      createBeep(1100, now + 0.3, 0.22, "triangle", 0.6);
      break;
    }

    case "executive_chime": {
      // Tríade maior elegante: C5 (523Hz), E5 (659Hz), G5 (784Hz)
      createBeep(523.25, now, 0.35, "sine", 0.4);
      createBeep(659.25, now + 0.08, 0.4, "sine", 0.4);
      createBeep(783.99, now + 0.16, 0.55, "sine", 0.45);
      break;
    }

    case "radar_ping": {
      // Sonar tático com pitch descendente
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(1400, now);
      osc.frequency.exponentialRampToValueAtTime(600, now + 0.4);
      osc.connect(g);
      g.connect(masterGain);
      g.gain.setValueAtTime(0.5, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      osc.start(now);
      osc.stop(now + 0.5);
      break;
    }

    case "critical_siren": {
      // Sirene bitonal de urgência
      createBeep(750, now, 0.15, "sawtooth", 0.35);
      createBeep(550, now + 0.16, 0.15, "sawtooth", 0.35);
      createBeep(750, now + 0.32, 0.15, "sawtooth", 0.35);
      createBeep(550, now + 0.48, 0.2, "sawtooth", 0.35);
      break;
    }

    case "digital_matrix": {
      // Arpeggio cibernético de 4 notas rápidas
      const notes = [440, 554.37, 659.25, 880];
      notes.forEach((freq, idx) => {
        createBeep(freq, now + idx * 0.06, 0.12, "triangle", 0.4);
      });
      break;
    }

    case "zen_crystal": {
      // Sino cristalino puro com harmônicos (1200Hz + 2400Hz)
      createBeep(1200, now, 0.6, "sine", 0.5);
      createBeep(2400, now, 0.4, "sine", 0.2);
      break;
    }

    case "cyber_glitch": {
      // Glitch high-tech dente de serra modulado
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(900, now);
      osc.frequency.linearRampToValueAtTime(300, now + 0.08);
      osc.frequency.linearRampToValueAtTime(1200, now + 0.18);
      osc.connect(g);
      g.connect(masterGain);
      g.gain.setValueAtTime(0.35, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.start(now);
      osc.stop(now + 0.28);
      break;
    }

    case "harmonic_harp": {
      // Harpa suave de 5 notas
      const notes = [392, 523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, idx) => {
        createBeep(freq, now + idx * 0.07, 0.3, "sine", 0.35);
      });
      break;
    }

    case "tactical_beep": {
      // Três pulsos curtos e secos
      createBeep(1000, now, 0.05, "square", 0.25);
      createBeep(1000, now + 0.09, 0.05, "square", 0.25);
      createBeep(1000, now + 0.18, 0.07, "square", 0.3);
      break;
    }

    case "sub_bass_drop": {
      // Impacto sub-grave executivo
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.exponentialRampToValueAtTime(45, now + 0.4);
      osc.connect(g);
      g.connect(masterGain);
      g.gain.setValueAtTime(0.65, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      osc.start(now);
      osc.stop(now + 0.48);
      break;
    }

    default: {
      createBeep(880, now, 0.1, "sine", 0.5);
      createBeep(1100, now + 0.15, 0.2, "sine", 0.5);
      break;
    }
  }
}

