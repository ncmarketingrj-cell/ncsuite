import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { Loader2, Mail, Lock, User as UserIcon, Briefcase, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/Logo";

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
    <div className="relative flex min-h-screen items-center justify-center px-4 py-12">
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-40 top-20 h-96 w-96 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute -right-40 bottom-20 h-96 w-96 rounded-full bg-secondary/20 blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
        className="glass-panel w-full max-w-md p-8"
      >
        <div className="flex flex-col items-center gap-4">
          <Logo size={40} />
          <div className="text-center">
            <p className="label-mono text-primary">Acesso da Equipe</p>
            <h1 className="mt-2 font-display text-2xl font-semibold">
              {mode === "login" ? "Entrar na Suite" : "Criar conta"}
            </h1>
          </div>
        </div>

        <form onSubmit={submit} className="mt-8 space-y-4">
          {mode === "signup" && (
            <>
              <Field icon={UserIcon} type="text" placeholder="Nome completo" value={fullName} onChange={setFullName} required />
              <div className="relative">
                <Briefcase className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <select
                  value={position} onChange={(e) => setPosition(e.target.value)}
                  className="w-full appearance-none rounded-lg border border-white/10 bg-background/50 py-2.5 pl-10 pr-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
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
            className="group flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-primary to-secondary py-3 text-sm font-semibold text-background transition hover:shadow-glow disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>
              {mode === "login" ? "Entrar" : "Criar conta"}
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </>}
          </button>
        </form>

        <div className="mt-6 text-center text-xs text-muted-foreground">
          {mode === "login" ? "Sem conta?" : "Já tem conta?"}{" "}
          <button
            type="button" onClick={() => setMode(mode === "login" ? "signup" : "login")}
            className="font-medium text-primary hover:underline"
          >
            {mode === "login" ? "Cadastre-se" : "Entrar"}
          </button>
        </div>

        <div className="mt-6 border-t border-white/5 pt-4 text-center">
          <Link to="/" className="label-mono text-muted-foreground hover:text-primary">← Voltar à landing</Link>
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
      <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type={type} value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder} required={required}
        className="w-full rounded-lg border border-white/10 bg-background/50 py-2.5 pl-10 pr-3 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
      />
    </div>
  );
}
