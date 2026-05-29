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
        { title: "NC Performance Suite — Motor de tráfego pago automotivo" },
        { name: "description", content: "Suite SaaS para gestão e relatórios de performance Meta Ads no segmento automotivo." },
        { name: "theme-color", content: "#DC2626" },
        { property: "og:title", content: "NC Performance Suite — Motor de tráfego pago automotivo" },
        { property: "og:description", content: "Suite SaaS para gestão e relatórios de performance Meta Ads no segmento automotivo." },
        { property: "og:type", content: "website" },
        { name: "twitter:title", content: "NC Performance Suite — Motor de tráfego pago automotivo" },
        { name: "twitter:description", content: "Suite SaaS para gestão e relatórios de performance Meta Ads no segmento automotivo." },
        { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/7cd3254f-040f-43e5-97e1-471846f1d21c/id-preview-fa213812--77b0eaf2-9183-45a2-a6bd-af190dc9de8c.lovable.app-1778846697148.png" },
        { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/7cd3254f-040f-43e5-97e1-471846f1d21c/id-preview-fa213812--77b0eaf2-9183-45a2-a6bd-af190dc9de8c.lovable.app-1778846697148.png" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
      links: [
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
      <head><HeadContent /></head>
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
