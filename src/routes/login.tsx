import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { Loader2, Mail, Lock, User as UserIcon, Briefcase, ArrowRight, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Entrar — NC Performance Suite" }] }),
  component: LoginPage,
});

const POSITIONS = [
  "Gestor de Tráfego", "Analista de Performance", "Designer de Criativos",
  "Account Manager", "Diretor de Marketing", "Estrategista", "SDR/Vendas",
  "Editor de Vídeo", "Outro",
];

function LoginPage() {
  const nav = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [position, setPosition] = useState(POSITIONS[0]);
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Bem-vindo de volta");
        nav({ to: "/dashboard" });
      } else {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: fullName, position, role: "employee" },
          },
        });
        if (error) throw error;
        toast.success("Conta criada. Você já pode entrar.");
        setMode("login");
      }
    } catch (err: any) {
      toast.error(err.message ?? "Falha na autenticação");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4 py-12 bg-[#0A0A0A]">
      {/* Background effects */}
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute left-1/2 top-1/3 -translate-x-1/2 h-[600px] w-[600px] rounded-full bg-red-600/10 blur-[120px]" />
        <div className="absolute inset-0 opacity-[0.02]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '64px 64px' }} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-10"
      >
        <div className="flex flex-col items-center gap-5">
          <div className="h-14 w-14 rounded-2xl bg-red-600 flex items-center justify-center shadow-[0_0_30px_rgba(220,38,38,0.3)]">
            <span className="font-display font-black text-white text-xl">NC</span>
          </div>
          <div className="text-center">
            <p className="text-[11px] font-mono font-bold uppercase tracking-[0.3em] text-red-500">Acesso da Equipe</p>
            <h1 className="mt-3 font-display text-2xl font-bold text-white">
              {mode === "login" ? "Entrar na Suite" : "Criar conta"}
            </h1>
          </div>
        </div>

        <form onSubmit={submit} className="mt-10 space-y-4">
          {mode === "signup" && (
            <>
              <Field icon={UserIcon} type="text" placeholder="Nome completo" value={fullName} onChange={setFullName} required />
              <div className="relative">
                <Briefcase className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
                <select
                  value={position} onChange={(e) => setPosition(e.target.value)}
                  className="w-full appearance-none rounded-xl border border-white/10 bg-white/5 py-3 pl-12 pr-4 text-sm text-white focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600"
                >
                  {POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </>
          )}
          <Field icon={Mail} type="email" placeholder="email@agencia.com" value={email} onChange={setEmail} required />
          <Field icon={Lock} type="password" placeholder="Senha" value={password} onChange={setPassword} required />

          <button
            type="submit" disabled={loading}
            className="group flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 py-3.5 text-sm font-bold text-white transition-all hover:bg-red-500 hover:shadow-[0_0_30px_rgba(220,38,38,0.3)] disabled:opacity-50 active:scale-[0.98]"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>
              {mode === "login" ? "Entrar" : "Criar conta"}
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </>}
          </button>
        </form>

        <div className="mt-8 text-center text-xs text-white/40">
          {mode === "login" ? "Sem conta?" : "Já tem conta?"}{" "}
          <button
            type="button" onClick={() => setMode(mode === "login" ? "signup" : "login")}
            className="font-semibold text-red-500 hover:text-red-400 transition-colors"
          >
            {mode === "login" ? "Cadastre-se" : "Entrar"}
          </button>
        </div>

        <div className="mt-6 border-t border-white/5 pt-5 text-center">
          <Link to="/" className="inline-flex items-center gap-1.5 text-[11px] font-mono font-bold uppercase tracking-widest text-white/30 hover:text-red-500 transition-colors">
            <ArrowLeft className="h-3 w-3" /> Voltar
          </Link>
        </div>
      </motion.div>
    </div>
  );
}

function Field({ icon: Icon, type, placeholder, value, onChange, required }: {
  icon: any; type: string; placeholder: string; value: string; onChange: (v: string) => void; required?: boolean;
}) {
  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
      <input
        type={type} value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder} required={required}
        className="w-full rounded-xl border border-white/10 bg-white/5 py-3 pl-12 pr-4 text-sm text-white placeholder:text-white/20 focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600 transition-colors"
      />
    </div>
  );
}
