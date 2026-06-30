import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Loader2, Mail, Lock, ArrowRight, ArrowLeft, Sun, Moon, Eye, EyeOff,
  Target, Shield, Zap, Sparkles, Building2, UserCheck, ShieldAlert
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase-external/client";
import { useTheme } from "./__root";

export const Route = createFileRoute("/crm-login")({
  head: () => ({ meta: [{ title: "Portal CRM — NC Performance" }] }),
  validateSearch: (_: Record<string, unknown>) => ({}),
  component: CrmLoginPage,
});

const CRM_BENEFITS = [
  { 
    title: "SDR Engine", 
    desc: "Distribuição instantânea de leads vindos de Meta Ads direto para o operador.",
    icon: UserCheck
  },
  { 
    title: "Kanban Automotivo", 
    desc: "Pipeline configurado para o funil comercial de concessionárias e lojas.",
    icon: Target
  },
  { 
    title: "Métricas de Conversão", 
    desc: "Painel integrado de agendamentos, visitas presenciais e vendas concluídas.",
    icon: Zap
  }
];

function CrmLoginPage() {
  const nav = useNavigate();
  const { theme, toggleTheme } = useTheme();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        localStorage.setItem("nc_active_module", "crm");
        nav({ to: "/crm", replace: true });
      }
    });
  }, [nav]);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      toast.error("Por favor, preencha todos os campos.");
      return;
    }

    setLoading(true);
    try {
      const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password: password.trim(),
      });

      if (authErr) throw authErr;

      // Fetch user profile role to show a custom welcome
      const { data: profile } = await supabase
        .from("profiles")
        .select("role, status, full_name")
        .eq("id", authData.user.id)
        .maybeSingle();

      if (profile?.status === "inativo") {
        await supabase.auth.signOut();
        toast.error("Este usuário está inativo. Entre em contato com o administrador.");
        setLoading(false);
        return;
      }

      localStorage.setItem("nc_active_module", "crm");
      
      const role = profile?.role;
      if (role === "admin" || role === "gerente" || role === "ceo") {
        toast.success(`Bem-vindo, Gestor ${profile?.full_name || ""}! Entrando no painel CRM...`);
      } else if (role === "agency_sdr") {
        toast.success(`Bem-vindo, SDR ${profile?.full_name || ""}! Boas vendas.`);
      } else if (role === "client_store") {
        toast.success(`Bem-vindo ao seu portal comercial!`);
      } else {
        toast.success("Login efetuado com sucesso.");
      }

      nav({ to: "/crm", replace: true });
    } catch (err: any) {
      toast.error(err.message || "Erro de login. Verifique suas credenciais.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-background text-foreground flex flex-col items-center justify-between p-4 overflow-hidden transition-colors duration-300">
      
      {/* Background Neon Effects */}
      <div className="pointer-events-none absolute inset-0 select-none" aria-hidden="true">
        <div
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, hsl(var(--primary) / 0.08) 1px, transparent 0)",
            backgroundSize: "40px 40px",
          }}
        />
        <div className="absolute right-[10%] top-[10%] h-[500px] w-[500px] rounded-full blur-[140px] opacity-15"
          style={{ background: "hsl(var(--primary))" }} />
        <div className="absolute left-[5%] bottom-[10%] h-[400px] w-[400px] rounded-full blur-[120px] opacity-10"
          style={{ background: "blue" }} />
      </div>

      {/* Header Top Bar */}
      <header className="w-full max-w-6xl flex items-center justify-between py-4 z-10">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 bg-primary rounded-xl flex items-center justify-center shadow-glow overflow-hidden">
            <span className="font-display font-black text-white text-sm">NC</span>
          </div>
          <div>
            <h1 className="text-sm font-black uppercase tracking-widest leading-none">NC Performance</h1>
            <span className="text-[9px] font-mono tracking-widest text-primary font-bold">CRM PORTAL</span>
          </div>
        </div>

        <button
          onClick={toggleTheme}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-muted-foreground hover:text-foreground transition-all active:scale-95 cursor-pointer"
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </header>

      {/* Main Split Section */}
      <main className="w-full max-w-5xl my-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-center z-10 py-6">
        
        {/* Left Side: Pitch / Features */}
        <section className="lg:col-span-7 space-y-6 text-left">
          <div className="space-y-4">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest bg-primary/10 border border-primary/20 text-primary">
              <Sparkles className="h-3.5 w-3.5" /> Motor Comercial Automotivo
            </span>
            <h2 className="text-3xl sm:text-5xl font-black tracking-tight leading-[1.05] uppercase">
              Acelere as <br />
              <span className="text-gradient">Conversões</span> de Leads
            </h2>
            <p className="text-sm text-muted-foreground max-w-lg leading-relaxed">
              O portal exclusivo para SDRs operarem em alta performance e clientes acompanharem em tempo real o andamento de cada lead qualificado pela NC Performance.
            </p>
          </div>

          {/* Benefits Grid */}
          <div className="space-y-4 pt-2">
            {CRM_BENEFITS.map((item, idx) => (
              <div key={idx} className="flex gap-4 p-4 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-white/10 transition-all max-w-lg">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
                  <item.icon className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-foreground">{item.title}</h4>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Right Side: Interactive Card & Login form */}
        <section className="lg:col-span-5 w-full flex justify-center">
          <div className="w-full max-w-sm glass-panel p-6 sm:p-8 border border-white/10 hover:border-white/15 transition-all relative overflow-hidden flex flex-col justify-between min-h-[360px]">
            {/* Top design strip */}
            <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-primary to-transparent" />
            
            <AnimatePresence mode="wait">
              {!showForm ? (
                // Landing state card
                <motion.div
                  key="landing-card"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-6 text-center my-auto flex flex-col items-center"
                >
                  <div className="h-16 w-16 bg-primary/10 rounded-2xl flex items-center justify-center text-primary mb-2 shadow-glow-sm">
                    <Target className="h-8 w-8" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-foreground">Acesso ao Pipeline</h3>
                    <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
                      Área reservada para operadores SDRs comerciais e clientes lojistas autorizados.
                    </p>
                  </div>

                  <button
                    onClick={() => setShowForm(true)}
                    className="flex w-full items-center justify-center gap-2 bg-primary text-primary-foreground font-bold text-xs py-3.5 rounded-xl hover:bg-primary/95 transition-all shadow-glow cursor-pointer uppercase tracking-wider"
                  >
                    Entrar no CRM <ArrowRight className="h-4 w-4" />
                  </button>
                </motion.div>
              ) : (
                // Login state form
                <motion.form
                  key="login-form"
                  onSubmit={handleLogin}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-4 my-auto"
                >
                  <div className="text-center pb-2">
                    <h3 className="text-base font-bold text-foreground">Identificação Comercial</h3>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Use suas credenciais de vendas.</p>
                  </div>

                  {/* Email */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Email</label>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                      <input 
                        type="email" 
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="sdr@agencia.com"
                        className="w-full bg-black/40 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                  </div>

                  {/* Password */}
                  <div className="space-y-1">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Senha</label>
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                      <input 
                        type={showPassword ? "text" : "password"} 
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full bg-black/40 border border-white/10 rounded-xl pl-10 pr-10 py-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Submit button */}
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex w-full items-center justify-center gap-2 bg-primary text-primary-foreground font-bold text-xs py-3.5 rounded-xl hover:bg-primary/95 transition-all shadow-glow disabled:opacity-50 cursor-pointer uppercase tracking-wider mt-2"
                  >
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        Entrar no Painel <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="text-[10px] text-muted-foreground hover:text-foreground text-center block w-full mt-2 transition-colors flex items-center justify-center gap-1"
                  >
                    <ArrowLeft className="h-3 w-3" /> Voltar
                  </button>
                </motion.form>
              )}
            </AnimatePresence>
          </div>
        </section>
      </main>

      {/* Footer bar */}
      <footer className="w-full max-w-6xl border-t border-white/5 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 z-10 text-xs text-muted-foreground/50 font-medium">
        <div>
          <span>NC Performance Suite — Portal CRM</span>
        </div>
        <div className="flex items-center gap-4">
          <Link to="/privacy" className="hover:text-primary transition-colors">POLÍTICA DE PRIVACIDADE</Link>
          <span>•</span>
          <Link to="/terms" className="hover:text-primary transition-colors">TERMOS DE SERVIÇO</Link>
        </div>
      </footer>
    </div>
  );
}
