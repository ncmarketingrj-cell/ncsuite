import { useEffect, useState, createContext, useContext } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { Toaster } from "sonner";

import appCss from "../styles.css?url";

// ═══════════════════════════════════════
// THEME CONTEXT — Dark/Light Toggle
// ═══════════════════════════════════════
type Theme = "dark" | "light";
type ThemeContextType = { theme: Theme; toggleTheme: () => void };

export const ThemeContext = createContext<ThemeContextType>({
  theme: "dark",
  toggleTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

function NotFoundComponent() {
  useEffect(() => {
    const path = window.location.pathname;
    if (path.startsWith("/_app/")) {
      const cleanPath = path.replace("/_app/", "/");
      const search = window.location.search;
      window.location.replace(cleanPath + search);
    }
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <p className="label-mono text-primary">404</p>
        <h1 className="mt-3 font-display text-4xl font-semibold">Página não encontrada</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Esse endereço não existe na suite. Volte para o painel principal.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition hover:shadow-glow"
          >
            Voltar
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <p className="label-mono text-destructive">Erro</p>
        <h1 className="mt-3 font-display text-2xl font-semibold">Algo travou no carregamento</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <div className="mt-6 flex justify-center gap-2">
          <button
            onClick={() => { router.invalidate(); reset(); }}
            className="rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:shadow-glow"
          >
            Tentar novamente
          </button>
          <a href="/" className="rounded-full border border-border px-5 py-2.5 text-sm font-medium hover:bg-muted">
            Início
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
  {
    head: () => ({
      meta: [
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
        { title: "NC Performance | Gestão de Tráfego Automotivo" },
        { name: "description", content: "Suite SaaS para gestão e relatórios de performance Meta Ads no segmento automotivo." },
        { name: "theme-color", content: "#DC2626" },
        { property: "og:title", content: "NC Performance | Gestão de Tráfego Automotivo" },
        { property: "og:description", content: "Suite SaaS para gestão e relatórios de performance Meta Ads no segmento automotivo." },
        { property: "og:type", content: "website" },
        { property: "og:url", content: "https://ncperformance.com.br" },
        { name: "twitter:title", content: "NC Performance | Gestão de Tráfego Automotivo" },
        { name: "twitter:description", content: "Suite SaaS para gestão e relatórios de performance Meta Ads no segmento automotivo." },
        { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/PXYT2fHT8Zd2UVh923EaGv29ll22/social-images/social-1780411155727-Captura_de_tela_2026-06-02_113859.webp" },
        { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/PXYT2fHT8Zd2UVh923EaGv29ll22/social-images/social-1780411155727-Captura_de_tela_2026-06-02_113859.webp" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
      links: [
        { rel: "canonical", href: "https://ncperformance.com.br" },
        { rel: "stylesheet", href: appCss },
        { rel: "preconnect", href: "https://fonts.googleapis.com" },
        { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
        {
          rel: "stylesheet",
          href: "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=DM+Sans:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600;700&display=swap",
        },
      ],
    }),
    shellComponent: RootShell,
    component: RootComponent,
    notFoundComponent: NotFoundComponent,
    errorComponent: ErrorComponent,
  }
);

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <meta charSet="utf-8" />
        <HeadContent />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          "name": "NC Performance Suite",
          "applicationCategory": "BusinessApplication",
          "operatingSystem": "All"
        }) }} />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    // Recupera tema salvo no localStorage
    const saved = localStorage.getItem("nc-theme") as Theme | null;
    const initial = saved || "dark";
    setTheme(initial);
    document.documentElement.className = initial;
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    // 1. Adiciona theme-transition ANTES da mudança para o browser já estar pronto
    document.documentElement.classList.add("theme-transition");
    // 2. requestAnimationFrame garante que a classe é pintada ANTES de trocar o tema
    requestAnimationFrame(() => {
      setTheme(next);
      document.documentElement.className = `${next} theme-transition`;
      localStorage.setItem("nc-theme", next);
      // 3. Remove a classe após a transição (280ms = duração do CSS)
      setTimeout(() => {
        document.documentElement.classList.remove("theme-transition");
      }, 300);
    });
  };

  useEffect(() => {
    const path = window.location.pathname;
    if (path.startsWith("/_app/")) {
      const cleanPath = path.replace("/_app/", "/");
      const search = window.location.search;
      window.location.replace(cleanPath + search);
    }
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      <QueryClientProvider client={queryClient}>
        <Outlet />
        <Toaster
          theme={theme}
          position="bottom-right"
          richColors
          offset={{ bottom: 80, right: 16 }}
          toastOptions={{
            style: { zIndex: 99999 },
          }}
        />
      </QueryClientProvider>
    </ThemeContext.Provider>
  );
}
