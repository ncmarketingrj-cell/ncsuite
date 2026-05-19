import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { Loader2, Mail, Lock, User as UserIcon, Briefcase, ArrowRight, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Entrar — NC Performance Suite" }] }),
  validateSearch: (search: Record<string, unknown>) => ({
    signup: search.signup === "true" || search.signup === true,
  }),
  component: LoginPage,
});

const POSITIONS = [
  "Gestor de Tráfego",
  "Social Media",
  "Gerente",
  "Diretor",
  "Videomaker",
  "Designer",
  "Outros",
];

function LoginPage() {
  const { signup: allowSignup } = Route.useSearch();
  const nav = useNavigate();
  
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) nav({ to: "/dashboard", replace: true });
    });
  }, [nav]);
  const [mode, setMode] = useState<"login" | "signup" | "forgot">("login");
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
      } else if (mode === "signup") {
        const isSuperAdmin = ["nc.marketingrj@gmail.com", "hc.marketing.dgt@gmail.com"].includes(email.trim().toLowerCase());
        const { error } = await supabase.auth.signUp({
          email, password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { 
              full_name: fullName, 
              position, 
              role: isSuperAdmin ? "admin" : "employee" 
            },
          },
        });
        if (error) throw error;
        toast.success("Conta criada. Você já pode entrar.");
        setMode("login");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin + "/login",
        });
        if (error) throw error;
        toast.success("E-mail de recuperação enviado com sucesso!");
        setMode("login");
      }
    } catch (err: any) {
      toast.error(err.message ?? "Falha na autenticação");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4 py-12 bg-background transition-colors duration-300">
      {/* Background effects */}
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute left-1/2 top-1/3 -translate-x-1/2 h-[600px] w-[600px] rounded-full bg-red-600/10 blur-[120px] pointer-events-none" />
        <div className="absolute inset-0 opacity-[0.02] dark:opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '64px 64px' }} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md glass-panel p-10 bg-card border-border shadow-2xl transition-all duration-300"
      >
        <div className="flex flex-col items-center gap-5">
          <div className="flex items-center justify-center">
            <img src="/assets/nc-logo.png" alt="NC Performance Logo" className="h-20 w-20 object-contain drop-shadow-[0_0_20px_rgba(220,38,38,0.3)]" />
          </div>
          <div className="text-center">
            <p className="text-[11px] font-mono font-bold uppercase tracking-[0.3em] text-red-500">Acesso da Equipe</p>
            <h1 className="mt-3 font-display text-2xl font-black text-foreground">
              {mode === "login" && "Entrar na Suite"}
              {mode === "signup" && "Criar conta"}
              {mode === "forgot" && "Recuperar senha"}
            </h1>
          </div>
        </div>

        <form onSubmit={submit} className="mt-10 space-y-4">
          {mode === "signup" && (
            <>
              <Field icon={UserIcon} type="text" placeholder="Nome completo" value={fullName} onChange={setFullName} required />
              <div className="relative">
                <Briefcase className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
                <select
                  value={position} onChange={(e) => setPosition(e.target.value)}
                  className="w-full appearance-none rounded-xl border border-border bg-muted/40 py-3 pl-12 pr-4 text-sm text-foreground focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600 transition-colors"
                >
                  {POSITIONS.map((p) => (
                     <option key={p} value={p} className="bg-card text-foreground">
                       {p}
                     </option>
                  ))}
                </select>
              </div>
            </>
          )}
          <Field icon={Mail} type="email" placeholder="email@agencia.com" value={email} onChange={setEmail} required />
          
          {mode !== "forgot" && (
            <Field icon={Lock} type="password" placeholder="Senha" value={password} onChange={setPassword} required />
          )}

          {mode === "login" && (
            <div className="flex justify-end pr-1">
              <button
                type="button" onClick={() => setMode("forgot")}
                className="text-[11px] text-muted-foreground hover:text-red-500 transition-colors font-medium"
              >
                Esqueci minha senha
              </button>
            </div>
          )}

          <button
            type="submit" disabled={loading}
            className="group flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 py-3.5 text-sm font-bold text-white transition-all hover:bg-red-500 hover:shadow-[0_0_30px_rgba(220,38,38,0.3)] disabled:opacity-50 active:scale-[0.98]"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>
              {mode === "login" && "Entrar"}
              {mode === "signup" && "Criar conta"}
              {mode === "forgot" && "Enviar link de recuperação"}
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </>}
          </button>
        </form>

        <div className="mt-8 text-center text-xs text-muted-foreground/80">
          {mode === "login" && (
            <>
              Sem conta?{" "}
              <button
                type="button" onClick={() => setMode("signup")}
                className="font-semibold text-red-500 hover:text-red-400 transition-colors"
              >
                Cadastre-se
              </button>
            </>
          )}
          {mode === "signup" && (
            <>
              Já tem conta?{" "}
              <button
                type="button" onClick={() => setMode("login")}
                className="font-semibold text-red-500 hover:text-red-400 transition-colors"
              >
                Entrar
              </button>
            </>
          )}
          {mode === "forgot" && (
            <>
              Lembrou a senha?{" "}
              <button
                type="button" onClick={() => setMode("login")}
                className="font-semibold text-red-500 hover:text-red-400 transition-colors"
              >
                Voltar para o Login
              </button>
            </>
          )}
        </div>

        <div className="mt-6 border-t border-border pt-5 text-center">
          <Link to="/" className="inline-flex items-center gap-1.5 text-[11px] font-mono font-bold uppercase tracking-widest text-muted-foreground/60 hover:text-red-500 transition-colors">
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
      <Icon className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
      <input
        type={type} value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder} required={required}
        className="w-full rounded-xl border border-border bg-muted/40 py-3 pl-12 pr-4 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600 transition-colors"
      />
    </div>
  );
}
