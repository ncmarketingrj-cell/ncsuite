# Remix of NC Traffic Insights

# PROMPT TÉCNICO — NC Performance Suite (Lovable)

> Copie tudo abaixo e cole no Lovable como prompt inicial.

---

```
Crie o app "NC Performance Suite" — plataforma SaaS de gestão de performance de tráfego pago Meta Ads, segmento automotivo BR.

═══════════════════════════════════════
STACK
═══════════════════════════════════════
React 18 · TypeScript · Vite · Tailwind CSS 3.4 · shadcn/ui (Radix) · Framer Motion 11 · Recharts · React Router DOM 6 · @tanstack/react-query · Supabase (Auth + Postgres + Edge Functions + Storage) · lucide-react · react-markdown · rehype-raw · @dnd-kit/core + @dnd-kit/sortable · @tiptap/react + @tiptap/starter-kit + @tiptap/extension-text-style + @tiptap/extension-color + @tiptap/extension-text-align + @tiptap/extension-placeholder · date-fns · sonner · zod

REGRA CRÍTICA DE IMPORTS:
- Tiptap: SEMPRE named exports → import { TextStyle } from '@tiptap/extension-text-style' (NUNCA default)
- react-markdown: default export → import Markdown from 'react-markdown'
- Lucide: todo ícone usado no JSX DEVE estar no import {} do topo do arquivo

═══════════════════════════════════════
DESIGN SYSTEM
═══════════════════════════════════════
Tema: dark mode exclusivo (sem light mode).
Fontes Google: "Outfit" (display/headings, font-display), "Inter" (body, font-body).

Paleta HSL (tailwind.config.ts → cssVariables):
  --background: 222 47% 6%
  --foreground: 210 40% 98%
  --card: 222 47% 8%
  --primary: 190 100% 50%  (#00d4ff cyan)
  --secondary: 258 75% 75% (#9b87f5 roxo)
  --accent: 24 95% 53%     (#f97316 laranja)
  --success: 142 71% 45%
  --destructive: 0 84% 60%
  --muted-foreground: 215 20% 55%
  --border: 215 20% 15%
  --sidebar: 222 47% 7%

Utilitários CSS globais:
  .glass-panel { @apply rounded-2xl border border-white/5 bg-white/[0.02] backdrop-blur-md; }
  .bg-card-gradient { @apply bg-gradient-to-br from-card to-background; }
  .text-gradient { @apply bg-gradient-to-r from-primary via-secondary to-primary bg-clip-text text-transparent; }
  .shadow-glow { box-shadow: 0 0 20px rgba(0,212,255,0.3); }
  .custom-scrollbar::-webkit-scrollbar { width: 4px; }
  .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }

Padrões de UI:
- Cards: rounded-2xl border border-white/[0.05] bg-white/[0.02] backdrop-blur-md
- Inputs: bg-background/50 border-white/10 focus:ring-primary
- Badges: text-[10px] font-mono uppercase tracking-[0.2em]
- Labels de seção: font-mono text-[11px] uppercase tracking-widest text-primary
- Animações: motion.div initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }}
- Stagger: variants hidden/show com staggerChildren: 0.08

═══════════════════════════════════════
AUTENTICAÇÃO
═══════════════════════════════════════
Supabase Auth com email/senha.
Login padrão: nc.marketingrj@gmail.com / ncmarketing2026

Tabela profiles (auto-criada via trigger on auth.users insert):
  id uuid PK (= auth.users.id)
  full_name text
  agency_name text default 'NC AGÊNCIA'
  role text default 'employee' CHECK (role IN ('admin','employee'))
  position text
  avatar_url text
  created_at timestamptz default now()
  updated_at timestamptz default now()

Página /login:
- Toggle login/cadastro
- Cadastro: email, senha, nome completo, cargo (select com 9 opções), role
- Pós-login → navigate('/dashboard')
- Design: glassmorphism card centralizado, logo NC no topo, gradiente de fundo

Proteção de rotas:
- AppLayout verifica supabase.auth.getUser()
- Se não autenticado → redirect /login
- Lazy loading com React.lazy + Suspense em TODAS as páginas

═══════════════════════════════════════
SCHEMA SQL COMPLETO (14 tabelas)
═══════════════════════════════════════

-- clients
CREATE TABLE clients (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  type text DEFAULT 'automotivo',
  monthly_budget numeric,
  created_at timestamptz DEFAULT now()
);

-- campaigns
CREATE TABLE campaigns (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  client_id uuid REFERENCES clients(id),
  platform text DEFAULT 'Meta Ads',
  status text DEFAULT 'active',
  budget numeric,
  link text,
  created_at timestamptz DEFAULT now()
);

-- metrics
CREATE TABLE metrics (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id uuid REFERENCES campaigns(id),
  client_id uuid REFERENCES clients(id),
  date date DEFAULT current_date,
  impressions integer,
  clicks integer,
  conversions integer,
  cost numeric,
  reach integer,
  result_type text,
  created_at timestamptz DEFAULT now()
);

-- reports
CREATE TABLE reports (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid REFERENCES clients(id),
  client_name text,
  period text,
  markdown text,
  raw_data jsonb,
  total_investment numeric,
  total_campaigns integer,
  created_at timestamptz DEFAULT now()
);

-- report_templates
CREATE TABLE report_templates (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  footer_text text DEFAULT '',
  is_default boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- meta_ads_configs
CREATE TABLE meta_ads_configs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  access_token text,
  ad_account_id text,
  app_id text,
  app_secret text,
  is_connected boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- swipe_files
CREATE TABLE swipe_files (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  title text NOT NULL,
  media_url text NOT NULL,
  notes text,
  tags text[],
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- quizzes
CREATE TABLE quizzes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  slug text UNIQUE NOT NULL,
  description text,
  theme_color text DEFAULT '#00d4ff',
  bg_color text DEFAULT '#0a0a1a',
  text_color text DEFAULT '#ffffff',
  is_active boolean DEFAULT true,
  user_id uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- quiz_steps
CREATE TABLE quiz_steps (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  quiz_id uuid REFERENCES quizzes(id) ON DELETE CASCADE,
  title text DEFAULT '',
  content text DEFAULT '',
  type text DEFAULT 'question',
  options jsonb DEFAULT '[]',
  order_index integer DEFAULT 0,
  button_text text DEFAULT 'Continuar',
  media_url text,
  media_type text,
  created_at timestamptz DEFAULT now()
);

-- quiz_submissions
CREATE TABLE quiz_submissions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  quiz_id uuid REFERENCES quizzes(id),
  answers jsonb,
  lead_data jsonb,
  completed boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- link_pages
CREATE TABLE link_pages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  slug text UNIQUE NOT NULL,
  title text NOT NULL,
  bio text,
  avatar text DEFAULT '🔗',
  theme text DEFAULT 'dark',
  accent_color text DEFAULT '#00d4ff',
  bg_color text DEFAULT '#0a0a1a',
  bg_image text,
  bg_overlay_opacity numeric DEFAULT 0.5,
  button_style text DEFAULT 'rounded',
  client_name text,
  config jsonb,
  font text DEFAULT 'Inter',
  logo_url text,
  vsl_video_url text,
  views_count integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- link_items
CREATE TABLE link_items (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  page_id uuid REFERENCES link_pages(id) ON DELETE CASCADE,
  title text DEFAULT 'Novo Link',
  url text,
  icon text DEFAULT '🔗',
  type text DEFAULT 'link',
  order_index integer DEFAULT 0,
  is_active boolean DEFAULT true,
  clicks_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- link_analytics
CREATE TABLE link_analytics (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  page_id uuid REFERENCES link_pages(id),
  item_id uuid REFERENCES link_items(id),
  event_type text NOT NULL,
  referrer text,
  user_agent text,
  created_at timestamptz DEFAULT now()
);

-- background_jobs
CREATE TABLE background_jobs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  type text NOT NULL,
  status text DEFAULT 'pending',
  progress integer DEFAULT 0,
  payload jsonb,
  result jsonb,
  user_id uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- RPC
CREATE OR REPLACE FUNCTION increment_views(page_id_param uuid)
RETURNS void AS $$
  UPDATE link_pages SET views_count = views_count + 1 WHERE id = page_id_param;
$$ LANGUAGE sql;

-- RLS: habilitar em todas as tabelas, policies permissivas para authenticated

═══════════════════════════════════════
ROTAS E PÁGINAS (24 rotas)
═══════════════════════════════════════

PÚBLICAS (sem AppLayout):
  /             → Landing (página de vendas premium full-screen)
  /login        → Login/Cadastro
  /p/:slug      → Link Page pública (renderiza link_pages)
  /q/:slug      → Quiz público (renderiza quiz interativo)
  /privacy      → Política de privacidade
  /deletion     → Instrução de exclusão de dados

PROTEGIDAS (dentro de AppLayout com sidebar):
  /dashboard           → Hub central com hero, grid de módulos, guia de operação
  /multicanal          → Dashboard de Performance com KPIs e gráficos Recharts
  /upload              → Upload de print → OCR → ReportBuilder
  /relatorios          → Lista de relatórios + preview markdown + tabs (Relatórios | Automações)
  /automations         → Automações de envio de relatórios
  /campanhas           → CRUD campanhas com filtros e bulk actions
  /metricas            → Dashboard de métricas com gráficos temporais
  /criativos           → SwipeFile + análise de criativos
  /integrations        → Card de integração Meta Ads (status + conectar)
  /organizador         → Lista de link pages criadas
  /organizador/:id     → Page Builder visual com preview ao vivo
  /utms                → Gerador de UTMs
  /quiz                → Lista de quizzes
  /quiz/novo           → Quiz Builder com steps drag-and-drop
  /quiz/edit/:id       → Editar quiz
  /quiz/analytics/:id  → Analytics de submissões
  /config              → Settings (5 tabs: Conta, Clientes, Integrações, Tutorial, Sistema)
  /config/clientes     → Settings na tab Clientes

═══════════════════════════════════════
LAYOUT (AppLayout.tsx)
═══════════════════════════════════════
- SidebarProvider do shadcn/ui wrapping tudo
- Sidebar colapsável à esquerda (AppSidebar)
- Main content com Outlet do React Router
- NavigationDock flutuante no bottom (4 ícones: Dashboard, Upload, Relatórios, Config)

AppSidebar: 5 grupos de menu:
  Geral: Dashboard
  Performance: Relatórios, Dashboard Métricas, Extração de Dados
  Conversão: Link Pages, Quizzes de Lead, Hub de UTMs
  Operação: Campanhas, Métricas, Criativos
  Sistema: Clientes, Configurações

Cada item ativo: barra lateral cyan animada com motion.div layoutId="active-bar"
Items com highlight (Performance): ponto cyan pulsante quando inativo

═══════════════════════════════════════
FUNCIONALIDADES CORE
═══════════════════════════════════════

1. REPORT BUILDER (componente central):
   - Props: campaigns[], initialGroups[], suggestedGroups[], meta{clientName,period}, onSave()
   - Drag-and-drop de campanhas em grupos com @dnd-kit
   - 8 formatos de relatório (gerar markdown via função generateReport)
   - Preview Markdown em tempo real (react-markdown + rehype-raw)
   - Rich text editor Tiptap para análise custom
   - Configuração de capa (título público, subtítulo, logo URL, modo A4)
   - Templates de assinatura CRUD (tabela report_templates)
   - Botões: copiar para clipboard, salvar no Supabase

2. META ADS SYNC:
   - Settings → tab Integrações: formulário access_token + ad_account_id
   - Salvar em meta_ads_configs
   - Botão "Sincronizar" chama Edge Function sync-meta-ads
   - Edge Function: GET graph.facebook.com/v21.0/{act}/campaigns + /insights
   - Upsert em campaigns e metrics
   - Dashboard e Métricas consomem dados reais

3. UPLOAD + OCR:
   - Upload imagem do gerenciador de anúncios
   - Edge Function extract-print processa OCR
   - Retorna campanhas extraídas → abre ReportBuilder
   - Ao salvar → grava na tabela reports

4. LINK PAGES:
   - Builder visual com preview ao vivo
   - Drag-and-drop para reordenar items
   - 100% customizável (cores, fontes, logo, vídeo VSL)
   - Página pública /p/:slug com tracking de views/cliques

5. QUIZ BUILDER:
   - Steps com tipos: question, info, lead_capture
   - Opções múltipla escolha
   - Webhook URL para integração externa (Zapier, Make)
   - Página pública /q/:slug com animações de transição
   - Analytics com gráficos de respostas

═══════════════════════════════════════
HOOKS CUSTOMIZADOS
═══════════════════════════════════════
- useClients(): { clients, loading, addClient, removeClient, updateClient } — CRUD tabela clients
- useAutomations(): { automations, loading, addAutomation, toggleAutomation, deleteAutomation } — automações de relatório
- useReportTemplates(): { templates, createTemplate, updateTemplate, deleteTemplate } — templates de assinatura
- useCreatives(): { files, loading, upload, remove } — CRUD swipe_files
- useLinkPages(): CRUD completo link_pages + link_items + analytics
- useQuizzes(): CRUD quizzes + steps + submissions
- useTimeline(): eventos de timeline do cliente
- useAlerts(): alertas do dashboard
- useBackgroundJobs(): polling de jobs assíncronos

═══════════════════════════════════════
EDGE FUNCTIONS (Supabase)
═══════════════════════════════════════
1. sync-meta-ads: sincroniza campanhas e métricas do Meta Graph API v21.0
2. extract-print: OCR em prints do gerenciador de anúncios
3. run-automations: executa envios agendados de relatórios
4. analyze-creative: análise técnica de criativos
5. track-link: tracking de cliques/views de link pages
6. meta-ads-monitor: monitor de alertas Meta Ads

═══════════════════════════════════════
LANDING PAGE (/)
═══════════════════════════════════════
Full-screen sem sidebar. Seções:
1. Navbar fixa: logo + botão "Acessar Suite" → /login
2. Barra de scroll progress (motion.div scaleX vinculado ao scrollYProgress)
3. Hero: título gigante "NC Performance Suite" com text-gradient, subtítulo, 2 CTAs
4. Stats: 4 blocos (10x Produtividade, 60s Setup, 99.9% Precisão, 24/7 Engine)
5. Marquee infinito: palavras-chave animadas
6. Features grid: 6 cards com ícones e descrições
7. Process timeline: 4 passos numerados (Captura → Processa → Insights → Escala)
8. FAQ accordion: 5 perguntas
9. CTA final
10. Footer com badges

IMPORTANTE: Sem menção a "IA", "Neural", "Bot", "Agente". Foco em "Performance Engine", "Motor de Extração", "Sistema de Dados".

Crie o app completo com TODAS estas funcionalidades implementadas e funcionais.
```

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://ncsuite.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/2102034d-ca6d-4829-8971-30ab97e8d764).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
