import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { Loader2, Mail, Lock, ArrowRight, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

// SVG inline do "G" do Google (sem dependência externa)
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Entrar — NC Performance Suite" }] }),
  validateSearch: (_: Record<string, unknown>) => ({}),
  component: LoginPage,
});

const BRAND_FEATURES = [
  { label: "Victoria AI", desc: "Agente autônomo de otimização" },
  { label: "Meta Ads", desc: "Sincronização em tempo real" },
  { label: "Dashboard", desc: "KPIs automotivos centralizados" },
];

function LoginPage() {
  const nav = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) nav({ to: "/dashboard", replace: true });
    });
  }, [nav]);

  const [mode, setMode] = useState<"login" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  // Captura sessão OAuth ao voltar do redirect do Google
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") {
        nav({ to: "/dashboard", replace: true });
      }
    });
    return () => subscription.unsubscribe();
  }, [nav]);

  const loginWithGoogle = async () => {
    setGoogleLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: window.location.origin + "/login",
          queryParams: { prompt: "select_account" },
        },
      });
      if (error) throw error;
      // O redirect acontece automaticamente — não precisa de nada aqui
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao conectar com Google");
      setGoogleLoading(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Bem-vindo de volta");
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
    <div className="relative flex min-h-screen bg-background overflow-hidden transition-colors duration-300">

      {/* ── Background global ── */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, hsl(var(--primary) / 0.055) 1px, transparent 0)",
            backgroundSize: "32px 32px",
          }}
        />
        <div className="absolute left-[30%] top-1/2 -translate-x-1/2 -translate-y-1/2 h-[700px] w-[700px] rounded-full blur-[150px]"
          style={{ background: "hsl(var(--primary) / 0.09)" }} />
        <div className="absolute right-0 bottom-0 h-[400px] w-[400px] rounded-full blur-[120px]"
          style={{ background: "hsl(228 90% 55% / 0.06)" }} />
      </div>

      {/* ══════════════════════════════════════════
          PAINEL ESQUERDO — Brand Automotivo (desktop)
      ══════════════════════════════════════════ */}
      <div className="hidden lg:flex relative flex-col justify-between w-[460px] xl:w-[540px] flex-shrink-0 p-12 xl:p-14 overflow-hidden">

        {/* NC Watermark de fundo */}
        <div className="pointer-events-none absolute bottom-[-4rem] left-[-3rem] select-none" aria-hidden="true">
          <span className="nc-watermark-text" style={{ fontSize: "19rem" }}>NC</span>
        </div>

        {/* Borda direita degradê */}
        <div className="absolute top-0 right-0 w-px h-full bg-gradient-to-b from-transparent via-primary/35 to-transparent" />

        {/* Racing stripe horizontal topo */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-primary/50 to-transparent" />

        {/* ── Top: Logo ── */}
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-14">
            <div className="relative h-11 w-11 rounded-2xl bg-primary flex items-center justify-center overflow-hidden shadow-glow flex-shrink-0">
              <div className="absolute inset-x-0 top-0 h-[4px] bg-white/28 rounded-t-2xl" />
              <span className="font-display font-black text-white text-base relative z-10 tracking-tight">NC</span>
              <div className="absolute inset-x-0 bottom-0 h-[3px] bg-black/22 rounded-b-2xl" />
            </div>
            <div className="flex flex-col leading-none gap-[5px]">
              <span className="font-display text-[13px] font-black tracking-tight leading-none">NC Performance</span>
              <div className="flex items-center gap-[5px]">
                <div className="h-px w-3 bg-primary/65 rounded-full" />
                <span className="text-[7px] font-mono font-bold uppercase tracking-[0.28em] text-primary leading-none">Suite Automotiva</span>
                <div className="h-px w-3 bg-primary/65 rounded-full" />
              </div>
            </div>
          </div>

          {/* ── Headline ── */}
          <div className="space-y-5">
            <div>
              <p className="label-mono text-primary mb-3">Motor de Tráfego</p>
              <h2 className="font-display text-[2.6rem] xl:text-[3rem] font-black leading-[1.04] tracking-tight">
                Performance<br />
                <span className="text-gradient">Automotiva</span><br />
                em Alta<br />Velocidade
              </h2>
            </div>

            <p className="text-sm text-muted-foreground leading-relaxed max-w-[280px]">
              Plataforma exclusiva da NC Performance para gestão, inteligência e otimização de campanhas no segmento automotivo.
            </p>

            {/* ── Features ── */}
            <div className="space-y-3 pt-1">
              {BRAND_FEATURES.map((item) => (
                <div key={item.label} className="flex items-center gap-3">
                  <div className="h-1.5 w-1.5 rounded-full bg-primary flex-shrink-0 shadow-glow-sm" />
                  <p className="text-[12px]">
                    <span className="font-bold text-foreground">{item.label}</span>
                    <span className="text-muted-foreground"> — {item.desc}</span>
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Bottom: versão ── */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="label-mono text-muted-foreground/45">NC Suite v2.0</span>
        </div>
      </div>

      {/* ══════════════════════════════════════════
          PAINEL DIREITO — Formulário
      ══════════════════════════════════════════ */}
      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <motion.div
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
          className="w-full max-w-md"
        >
          <div className="glass-panel card-sport relative overflow-hidden p-8 sm:p-10">

            {/* Racing stripe topo do card */}
            <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-primary to-transparent pointer-events-none" />

            {/* NC corner mark */}
            <div className="absolute top-3 right-4 font-display font-black text-[9px] tracking-wider text-primary/22 select-none pointer-events-none">NC</div>

            {/* ── Header do card ── */}
            <div className="flex flex-col items-center gap-4 mb-8">
              <div className="relative">
                <img
                  src="/assets/nc-logo.png"
                  alt="NC Performance"
                  className="h-16 w-16 object-contain drop-shadow-[0_0_22px_rgba(220,38,38,0.38)]"
                />
              </div>
              <div className="text-center">
                <p className="label-mono text-primary">Acesso da Equipe</p>
                <h1 className="mt-2 font-display text-2xl font-black text-foreground">
                  {mode === "login" ? "Entrar na Suite" : "Recuperar senha"}
                </h1>
              </div>
            </div>

            {/* ── Google OAuth ── */}
            {mode === "login" && (
              <div className="mb-5">
                <button
                  type="button"
                  onClick={loginWithGoogle}
                  disabled={googleLoading || loading}
                  className="group relative flex w-full items-center justify-center gap-3 rounded-xl border border-border bg-white/[0.04] hover:bg-white/[0.08] hover:border-white/20 py-3 text-sm font-semibold text-foreground transition-all active:scale-[0.98] disabled:opacity-50"
                >
                  {googleLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <GoogleIcon />
                  )}
                  {googleLoading ? "Redirecionando..." : "Continuar com Google"}
                </button>

                {/* Separador */}
                <div className="mt-5 flex items-center gap-3">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-[11px] font-medium text-muted-foreground/50 uppercase tracking-wider">ou</span>
                  <div className="h-px flex-1 bg-border" />
                </div>
              </div>
            )}

            {/* ── Formulário ── */}
            <form onSubmit={submit} className="space-y-3.5">
              <Field icon={Mail} type="email" placeholder="email@agencia.com" value={email} onChange={setEmail} required />

              {mode === "login" && (
                <Field icon={Lock} type="password" placeholder="Senha" value={password} onChange={setPassword} required />
              )}

              {mode === "login" && (
                <div className="flex justify-end pr-1 pt-0.5">
                  <button
                    type="button"
                    onClick={() => setMode("forgot")}
                    className="text-[11px] text-muted-foreground hover:text-primary transition-colors font-medium"
                  >
                    Esqueci minha senha
                  </button>
                </div>
              )}

              {/* ── CTA ── */}
              <button
                type="submit"
                disabled={loading}
                className="group relative mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-sm font-bold text-white overflow-hidden transition-all hover:shadow-glow active:scale-[0.98] disabled:opacity-50"
              >
                <div className="absolute inset-x-0 top-0 h-[3px] bg-white/22 rounded-t-xl pointer-events-none" />
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    {mode === "login" ? "Entrar na Suite" : "Enviar link de recuperação"}
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </>
                )}
              </button>
            </form>

            {/* ── Mode toggle ── */}
            {mode === "forgot" && (
              <div className="mt-6 text-center text-xs text-muted-foreground/80">
                Lembrou a senha?{" "}
                <button
                  type="button"
                  onClick={() => setMode("login")}
                  className="font-semibold text-primary hover:text-primary/80 transition-colors"
                >
                  Voltar para o login
                </button>
              </div>
            )}

            {/* ── Footer do card ── */}
            <div className="mt-5 border-t border-border pt-4 flex items-center justify-between">
              <Link
                to="/"
                className="inline-flex items-center gap-1.5 label-mono text-muted-foreground/55 hover:text-primary transition-colors"
              >
                <ArrowLeft className="h-3 w-3" /> Página inicial
              </Link>
              <span className="label-mono text-muted-foreground/28">v2.0</span>
            </div>
          </div>

          {/* Tagline abaixo do card (mobile) */}
          <p className="mt-5 text-center label-mono text-muted-foreground/40 lg:hidden">
            NC Performance Suite — Motor de Tráfego Automotivo
          </p>
        </motion.div>
      </div>

    </div>
  );
}

function Field({
  icon: Icon, type, placeholder, value, onChange, required,
}: {
  icon: any;
  type: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/55" />
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="w-full rounded-xl border border-border bg-muted/40 py-3 pl-12 pr-4 text-sm text-foreground placeholder:text-muted-foreground/48 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
      />
    </div>
  );
}
