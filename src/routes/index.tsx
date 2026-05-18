import { createFileRoute, Link } from "@tanstack/react-router";
import { motion, useScroll, useTransform, AnimatePresence } from "framer-motion";
import { ArrowRight, ChevronDown, CheckCircle2, Bot, BarChart3, Database, Workflow, Award, CarFront, Zap } from "lucide-react";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "NC Performance Suite — O Sistema Operacional de Marketing da NC Agência" },
      { name: "description", content: "Nosso ecossistema proprietário de Business Intelligence, automação de dados de mídia e IA para gestão de tráfego pago de alta performance." },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  const { scrollYProgress } = useScroll();
  const opacity = useTransform(scrollYProgress, [0, 0.1], [1, 0]);
  const y = useTransform(scrollYProgress, [0, 0.1], [0, 100]);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="relative min-h-screen bg-[#050508] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#1a0a0a] via-[#050508] to-[#000000] text-white selection:bg-red-600/30 selection:text-red-200 overflow-x-hidden font-sans">
      {/* ══════════════ NAVBAR ══════════════ */}
      <header className={`fixed inset-x-0 top-0 z-50 transition-all duration-500 ${isScrolled ? 'bg-[#030303]/80 backdrop-blur-xl border-b border-white/5 py-4' : 'bg-transparent py-6'}`}>
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <img src="/assets/nc-logo.png" alt="NC Performance Logo" className="h-10 w-10 object-contain drop-shadow-[0_0_15px_rgba(255,255,255,0.1)]" />
            <div className="flex flex-col leading-none">
              <span className="font-display text-lg font-black tracking-tight text-white uppercase">NC Agência</span>
              <span className="text-[9px] font-mono font-bold uppercase tracking-[0.3em] text-red-500">Performance Suite</span>
            </div>
          </div>
          <Link
            to="/login"
            className="group relative overflow-hidden rounded-full border border-red-500/50 bg-red-600/10 px-8 py-3 text-xs font-black uppercase tracking-widest text-red-500 transition-all hover:bg-red-600 hover:text-white hover:shadow-[0_0_40px_rgba(220,38,38,0.4)] backdrop-blur-md"
          >
            <span className="relative z-10 flex items-center gap-2">
              Acessar Portal <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </span>
            <div className="absolute inset-0 z-0 bg-gradient-to-r from-gray-200 to-white opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
          </Link>
        </div>
      </header>

      {/* ══════════════ HERO SECTION ══════════════ */}
      <section className="relative flex min-h-screen flex-col items-center justify-center pt-20">
        {/* Background Ambient */}
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute left-1/2 top-[40%] -translate-x-1/2 -translate-y-1/2 h-[800px] w-[1000px] rounded-[100%] bg-red-600/10 blur-[150px] mix-blend-screen" />
          <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay" />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#030303]/80 to-[#030303]" />
        </div>

        <motion.div 
          style={{ opacity, y }}
          className="mx-auto w-full max-w-5xl px-6 text-center z-10"
        >
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="mb-8 inline-flex items-center gap-2 rounded-full border border-red-500/20 bg-red-500/10 px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-red-400 backdrop-blur-md"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
            </span>
            A Tecnologia Proprietária da NC Agência
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="font-display text-5xl sm:text-7xl lg:text-[80px] font-black leading-[0.9] tracking-tighter"
          >
            O ecossistema interno de<br />
            <span className="bg-gradient-to-r from-white via-gray-300 to-gray-500 bg-clip-text text-transparent">alta performance para </span>
            <span className="text-red-600">nossa agência.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="mx-auto mt-8 max-w-3xl text-base sm:text-lg text-gray-400 font-medium leading-relaxed"
          >
            Apresentamos o NC Performance Suite: nossa plataforma privada de Business Intelligence e Inteligência Artificial projetada para centralizar a operação, gerar relatórios estratégicos e orquestrar tráfego pago de elite para nossa equipe e clientes parceiros.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <button
              onClick={() => {
                document.getElementById('tecnologia')?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="w-full sm:w-auto rounded-full bg-red-600 px-8 py-4 text-sm font-black uppercase tracking-widest text-white transition-all hover:bg-red-500 hover:shadow-[0_0_40px_rgba(220,38,38,0.4)] active:scale-95"
            >
              Explorar Ecossistema
            </button>
            <Link
              to="/login"
              className="group w-full sm:w-auto inline-flex justify-center items-center gap-2 rounded-full border border-red-500/20 bg-black/50 px-8 py-4 text-sm font-black uppercase tracking-widest text-white transition-all hover:border-red-500/50 hover:bg-red-900/20 active:scale-95 backdrop-blur-md shadow-2xl"
            >
              Acesso Restrito <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </motion.div>
        </motion.div>

        {/* 3D Mockup Presentation */}
        <motion.div
          initial={{ opacity: 0, y: 100, rotateX: 20 }}
          animate={{ opacity: 1, y: 0, rotateX: 0 }}
          transition={{ duration: 1.2, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="relative mt-24 w-full max-w-[1200px] px-6 perspective-[2000px] z-20"
        >
          <div className="relative rounded-2xl shadow-[0_0_150px_rgba(220,38,38,0.15)] ring-1 ring-white/10 overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-b from-white/[0.05] to-transparent pointer-events-none z-10" />
            <img 
              src="/assets/mockup-dashboard.png" 
              alt="NC Dashboard Preview" 
              className="w-full h-auto object-cover transform transition-transform duration-700 group-hover:scale-[1.02]"
            />
          </div>
        </motion.div>
      </section>

      {/* ══════════════ TECNOLOGIA & INTELIGÊNCIA ══════════════ */}
      <section id="tecnologia" className="relative py-32 bg-[#050505]">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <motion.div
              initial={{ opacity: 0, x: -50 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.8 }}
            >
              <h2 className="font-display text-4xl sm:text-5xl font-black tracking-tighter mb-6">
                Gestão de tráfego integrada.<br/>
                <span className="text-gray-500">Dados reais em tempo real.</span>
              </h2>
              <p className="text-gray-400 text-base leading-relaxed mb-8">
                Eliminamos a descentralização de informações e planilhas dispersas. A NC Performance Suite unifica o monitoramento de mídia de toda a nossa operação, provendo uma visão cristalina e segura da evolução comercial de cada conta ativa.
              </p>
              
              <ul className="space-y-6">
                {[
                  "Centralização e consolidação automática de investimentos em mídia.",
                  "Governança total de acessos com papéis definidos de time.",
                  "Análise automatizada de breakdowns de campanha com precisão.",
                  "Geração acelerada de relatórios estratégicos para tomada de decisão comercial."
                ].map((item, i) => (
                  <motion.li 
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.1 }}
                    className="flex items-start gap-4"
                  >
                    <div className="mt-1 rounded-full bg-red-600/20 p-1">
                      <CheckCircle2 className="h-4 w-4 text-red-500" />
                    </div>
                    <span className="text-white/80 font-medium">{item}</span>
                  </motion.li>
                ))}
              </ul>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8 }}
              className="relative"
            >
              <div className="absolute inset-0 -z-10 bg-red-600/5 blur-[100px] rounded-full" />
              <img 
                src="/assets/mockup-reports.png" 
                alt="Motor de Relatórios" 
                className="w-full rounded-2xl border border-white/10 shadow-2xl rotate-2 hover:rotate-0 transition-transform duration-700"
              />
            </motion.div>
          </div>
        </div>
      </section>

      {/* ══════════════ THE SUITE (ECOSSISTEMA) ══════════════ */}
      <section className="py-32 relative overflow-hidden border-y border-white/5 bg-[#030303]">
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-10 mix-blend-overlay" />
        
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center max-w-3xl mx-auto mb-20">
            <h2 className="font-display text-4xl sm:text-5xl font-black tracking-tighter mb-6">
              Nosso Hub Tecnológico
            </h2>
            <p className="text-gray-400 text-lg">
              A plataforma interna e exclusiva que conecta nossa equipe operacional aos dados reais dos projetos.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <motion.div 
              whileHover={{ y: -10 }}
              className="rounded-3xl border border-white/10 bg-white/[0.02] p-8 backdrop-blur-sm transition-all"
            >
              <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-red-600 to-red-900 flex items-center justify-center mb-6 shadow-lg shadow-red-900/50">
                <BarChart3 className="h-6 w-6 text-white" />
              </div>
              <h3 className="text-2xl font-black mb-3">Command Center</h3>
              <p className="text-gray-400 leading-relaxed text-sm">
                Dashboard consolidado de investimentos em mídia e KPIs operacionais. Oferece visualização clara de CPA, ROAS, cliques e conversões para Gestores e Diretores.
              </p>
            </motion.div>

            {/* Feature 2 */}
            <motion.div 
              whileHover={{ y: -10 }}
              className="rounded-3xl border border-white/10 bg-white/[0.02] p-8 backdrop-blur-sm transition-all"
            >
              <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-gray-700 to-black flex items-center justify-center mb-6 shadow-lg border border-white/10">
                <Bot className="h-6 w-6 text-white" />
              </div>
              <h3 className="text-2xl font-black mb-3">Victoria AI</h3>
              <p className="text-gray-400 leading-relaxed text-sm">
                Nossa assistente de inteligência artificial de elite integrada. Realiza análises profundas de performance das contas e sugere ajustes estratégicos em tempo real.
              </p>
            </motion.div>

            {/* Feature 3 */}
            <motion.div 
              whileHover={{ y: -10 }}
              className="rounded-3xl border border-white/10 bg-white/[0.02] p-8 backdrop-blur-sm transition-all"
            >
              <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-gray-700 to-black flex items-center justify-center mb-6 shadow-lg border border-white/10">
                <Zap className="h-6 w-6 text-white" />
              </div>
              <h3 className="text-2xl font-black mb-3">Segurança & Controle</h3>
              <p className="text-gray-400 leading-relaxed text-sm">
                Ambiente criptografado e seguro com gestão estrita de cargos. Garante conformidade total de informações do fluxo operacional da NC Agência.
              </p>
            </motion.div>
          </div>
          
          {/* AI Banner Showcase */}
          <div className="mt-16 rounded-3xl border border-white/10 bg-gradient-to-r from-[#0A0A0A] to-[#111] overflow-hidden flex flex-col md:flex-row items-center relative">
            <div className="absolute right-0 top-0 bottom-0 w-1/2 bg-red-600/5 blur-[80px]" />
            <div className="p-10 md:w-1/2 z-10">
              <span className="text-[10px] font-black uppercase tracking-[0.3em] text-red-500 mb-2 block">POWERED BY AI</span>
              <h3 className="text-3xl font-black mb-4">Inteligência Artificial focada em relatórios de growth.</h3>
              <p className="text-gray-400 mb-8">
                A Victoria AI foi treinada com nossa metodologia proprietária para auditar campanhas, identificar criativos vencedores e redigir insights acionáveis com extrema precisão analítica.
              </p>
              <div className="flex items-center gap-3 text-sm font-bold">
                <span className="flex h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                Orquestração via NC Database
              </div>
            </div>
            <div className="md:w-1/2 p-6 md:p-10 flex justify-end z-10">
              <img src="/assets/mockup-victoria.png" alt="Victoria AI Interface" className="rounded-xl shadow-2xl border border-white/10 max-h-[400px] object-cover object-left-top" />
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════ BRANDING STORY ══════════════ */}
      <section className="py-32 bg-[#050505] relative">
        <div className="mx-auto max-w-7xl px-6">
          <div className="flex flex-col lg:flex-row items-center gap-16">
            <motion.div 
              initial={{ opacity: 0, x: -50 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 1 }}
              className="w-full lg:w-1/2 relative"
            >
              <div className="absolute inset-0 bg-red-600/10 blur-[80px] -z-10 rounded-full" />
              <img 
                src="/assets/victoria-maia.png" 
                alt="Victoria Maia - Fundadora NC" 
                className="w-full max-w-[500px] mx-auto rounded-3xl border border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.5)] object-cover grayscale hover:grayscale-0 transition-all duration-700"
              />
              {/* Badge */}
              <div className="absolute bottom-8 left-0 lg:-left-8 rounded-2xl border border-white/10 bg-[#0A0A0A]/90 p-6 backdrop-blur-md shadow-2xl">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-600/20 text-red-500">
                    <Award className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-xs font-mono font-bold uppercase tracking-widest text-gray-400">AGÊNCIA DE ELITE</p>
                    <p className="font-display text-xl font-black">NC Performance</p>
                  </div>
                </div>
              </div>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, x: 50 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 1 }}
              className="w-full lg:w-1/2"
            >
              <h2 className="font-display text-4xl sm:text-5xl font-black tracking-tighter mb-4">
                A Visão Estratégica<br />da <span className="text-red-600">NC Agência</span>
              </h2>
              <p className="text-xl font-medium text-white/90 mb-6">Victoria Maia, fundadora e estrategista chefe.</p>
              
              <div className="space-y-5 text-gray-400 leading-relaxed">
                <p>
                  O que começou como uma visão de escala em mídia de alta performance hoje se materializa como o principal hub operacional e tecnológico para nossa equipe operacional do Rio de Janeiro para todo o Brasil.
                </p>
                <p>
                  Para apoiar nosso time especializado (Gestores de Tráfego, Designers, Social Media, Videomakers e Gerentes de Contas), concebemos a NC Performance Suite. Uma ferramenta desenvolvida sob medida que unifica governança, agilidade na extração de dados e orquestração de mídias pagas com absoluto controle de qualidade.
                </p>
                <p className="border-l-2 border-red-600 pl-4 italic text-white/80">
                  "Nossa plataforma corporativa foi desenhada para a excelência. Não entregamos apenas dados; fornecemos o ecossistema ideal para que nossa equipe opere no mais alto nível de performance comercial."
                </p>
              </div>

              <div className="mt-10 flex items-center gap-4">
                <img src="/assets/nc-logo.png" alt="NC Logo" className="h-12 w-12 object-contain grayscale opacity-50" />
                <div className="h-px bg-white/10 flex-1" />
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ══════════════ CTA FINAL ══════════════ */}
      <section className="relative py-32 overflow-hidden border-t border-white/5">
        <div className="absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-1/2 h-[600px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-700/20 blur-[150px]" />
          <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay" />
        </div>
        
        <div className="mx-auto max-w-4xl px-6 text-center z-10 relative">
          <h2 className="font-display text-5xl sm:text-7xl font-black tracking-tighter mb-8">
            Tecnologia Operacional.
          </h2>
          <p className="text-xl text-gray-400 mb-12 max-w-2xl mx-auto">
            A NC Performance Suite é de uso estrito e exclusivo de colaboradores autorizados e parceiros homologados da NC Agência.
          </p>
          <div className="flex flex-col sm:flex-row justify-center items-center gap-6">
            <Link
              to="/login"
              className="w-full sm:w-auto rounded-full bg-red-600 px-10 py-5 text-sm font-black uppercase tracking-widest text-white transition-all hover:scale-105 hover:bg-red-500 hover:shadow-[0_0_40px_rgba(220,38,38,0.4)] shadow-2xl"
            >
              Acessar Portal Operacional
            </Link>
          </div>
        </div>
      </section>

      {/* ══════════════ FOOTER ══════════════ */}
      <footer className="border-t border-white/10 bg-[#020202] py-12">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-6 sm:flex-row">
          <div className="flex items-center gap-3">
            <img src="/assets/nc-logo.png" alt="NC Agência" className="h-8 w-8 object-contain" />
            <span className="font-display text-sm font-black text-white/60 tracking-widest uppercase">NC Agência</span>
          </div>
          <span className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-white/30">
            © {new Date().getFullYear()} Todos os direitos reservados. NC Performance Suite.
          </span>
        </div>
      </footer>
    </div>
  );
}
