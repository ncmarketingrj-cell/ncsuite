import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { Activity, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase-external/client";
import { UserAvatar } from "@/components/UserAvatar";
import { isUserOnlineNow } from "@/lib/activityPixelService";

interface TeamPresenceTopBarProps {
  canManageUsers?: boolean;
}

export function TeamPresenceTopBar({ canManageUsers = false }: TeamPresenceTopBarProps) {
  const [open, setOpen] = useState(false);

  const { data: members = [] } = useQuery({
    queryKey: ["team_avatars_directory"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("profiles")
        .select("id, full_name, email, avatar_url, position, status, last_seen_at")
        .neq("status", "inativo")
        .order("full_name", { ascending: true });

      if (error && /last_seen_at/i.test(error.message || "")) {
        const fallback = await (supabase as any)
          .from("profiles")
          .select("id, full_name, email, avatar_url, position, status")
          .order("full_name", { ascending: true });
        return (fallback.data || []).filter((m: any) => m.status !== "inativo");
      }
      return data || [];
    },
    staleTime: 25_000,
    refetchInterval: 30_000,
  });

  if (!members || members.length === 0) return null;

  const sorted = [...members].sort((a: any, b: any) => {
    const aOn = isUserOnlineNow(a.last_seen_at, a.status) ? 1 : 0;
    const bOn = isUserOnlineNow(b.last_seen_at, b.status) ? 1 : 0;
    if (aOn !== bOn) return bOn - aOn;
    const aPhoto = a.avatar_url ? 1 : 0;
    const bPhoto = b.avatar_url ? 1 : 0;
    return bPhoto - aPhoto;
  });

  const onlineCount = sorted.filter((m: any) => isUserOnlineNow(m.last_seen_at, m.status)).length;
  const preview = sorted.slice(0, 4);
  const extraCount = Math.max(0, sorted.length - preview.length);

  return (
    <div className="relative hidden xl:flex items-center">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-full border border-border/80 bg-card/60 hover:border-primary/40 hover:bg-card px-2 py-1 transition-all active:scale-95"
        title="Equipe & Status Online"
      >
        <div className="flex items-center -space-x-2">
          {preview.map((m: any) => {
            const online = isUserOnlineNow(m.last_seen_at, m.status);
            return (
              <div key={m.id} className="ring-2 ring-background rounded-full">
                <UserAvatar
                  src={m.avatar_url}
                  name={m.full_name}
                  email={m.email}
                  size="xs"
                  onlineStatus={online ? "online" : null}
                />
              </div>
            );
          })}
        </div>
        {extraCount > 0 && (
          <span className="text-[10px] font-mono font-bold text-muted-foreground pl-0.5">
            +{extraCount}
          </span>
        )}
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse ml-0.5" />
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96 }}
              className="absolute right-0 top-full z-50 mt-2 w-72 rounded-2xl border border-border bg-card p-3 shadow-2xl space-y-2.5"
            >
              <div className="flex items-center justify-between border-b border-border/60 pb-2">
                <div className="flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 text-primary" />
                  <span className="text-[11px] font-black uppercase tracking-wider text-foreground">
                    Equipe ({sorted.length})
                  </span>
                </div>
                <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[9px] font-bold text-emerald-400">
                  {onlineCount} online
                </span>
              </div>

              <div className="max-h-64 overflow-y-auto custom-scrollbar space-y-1.5 pr-0.5">
                {sorted.map((m: any) => {
                  const online = isUserOnlineNow(m.last_seen_at, m.status);
                  return (
                    <div
                      key={m.id}
                      className="flex items-center justify-between gap-2.5 rounded-xl px-2 py-1.5 hover:bg-muted/40 transition"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <UserAvatar
                          src={m.avatar_url}
                          name={m.full_name}
                          email={m.email}
                          size="sm"
                          onlineStatus={online ? "online" : "offline"}
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-foreground truncate">
                            {m.full_name || m.email}
                          </p>
                          <p className="text-[10px] text-muted-foreground truncate">
                            {m.position || "Equipe NC"}
                          </p>
                        </div>
                      </div>
                      <span
                        className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0 ${
                          online
                            ? "text-emerald-400 bg-emerald-500/10"
                            : "text-muted-foreground/70 bg-white/5"
                        }`}
                      >
                        {online ? "Online" : "Offline"}
                      </span>
                    </div>
                  );
                })}
              </div>

              {canManageUsers && (
                <Link
                  to="/perfil"
                  search={{ tab: "equipe", view: "pixel" } as any}
                  onClick={() => setOpen(false)}
                  className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-primary/10 border border-primary/25 hover:bg-primary/20 text-[11px] font-black uppercase tracking-wider text-primary py-2 transition"
                >
                  <Activity className="h-3.5 w-3.5" /> Abrir Pixel de Monitoramento
                </Link>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

