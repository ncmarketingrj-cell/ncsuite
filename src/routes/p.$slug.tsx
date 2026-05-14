import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ExternalLink, Loader2 } from "lucide-react";

export const Route = createFileRoute("/p/$slug")({
  head: () => ({ meta: [{ title: "Link Page — NC Performance Suite" }] }),
  component: PublicLinkPage,
});

function PublicLinkPage() {
  const { slug } = Route.useParams();

  const { data: page, isLoading, error } = useQuery({
    queryKey: ["public-link-page", slug],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("link_pages").select("*").eq("slug", slug).eq("is_active", true).single();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: items = [] } = useQuery({
    queryKey: ["public-link-items", page?.id],
    enabled: !!page?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("link_items").select("*").eq("page_id", page.id).eq("is_active", true).order("order_index", { ascending: true });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  if (isLoading) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (error || !page) return (
    <div className="flex min-h-screen items-center justify-center text-center">
      <div><h1 className="font-display text-2xl font-bold">Página não encontrada</h1><p className="mt-2 text-sm text-muted-foreground">Este link não existe ou foi desativado.</p></div>
    </div>
  );

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12" style={{ background: page.bg_color || "hsl(222 47% 6%)" }}>
      <div className="w-full max-w-md text-center">
        {page.avatar && <img src={page.avatar} alt="" className="mx-auto h-20 w-20 rounded-full object-cover ring-2 ring-white/10" />}
        <h1 className="mt-4 font-display text-2xl font-bold" style={{ color: page.accent_color || "#00d4ff" }}>{page.title}</h1>
        {page.bio && <p className="mt-2 text-sm text-muted-foreground">{page.bio}</p>}
        <div className="mt-8 space-y-3">
          {items.map((item: any) => (
            <a key={item.id} href={item.url} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-6 py-3.5 text-sm font-medium transition hover:bg-white/[0.1]">
              {item.title} <ExternalLink className="h-3.5 w-3.5 opacity-50" />
            </a>
          ))}
        </div>
        <p className="mt-12 text-[10px] text-muted-foreground/50">NC Performance Suite</p>
      </div>
    </div>
  );
}
