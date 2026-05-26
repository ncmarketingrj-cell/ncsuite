import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.1"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const ADMIN_EMAILS = ["nc.marketingrj@gmail.com", "hc.marketing.dgt@gmail.com"]

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get("Authorization")
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Não autorizado." }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )

    // Valida o token e obtém o usuário chamador
    const { data: { user: caller }, error: authErr } = await adminClient.auth.getUser(
      authHeader.replace("Bearer ", "")
    )
    if (authErr || !caller) {
      return new Response(JSON.stringify({ error: "Não autorizado." }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // Verifica se é admin por email (acesso total)
    const isAdminEmail = ADMIN_EMAILS.includes(caller.email ?? "")

    // Se não for admin por email, consulta o perfil para checar role e permissões
    let isAdminRole = false
    let canCreateUsers = false

    if (!isAdminEmail) {
      const { data: profile } = await adminClient
        .from("profiles")
        .select("role, permissions")
        .eq("id", caller.id)
        .maybeSingle()

      isAdminRole = profile?.role === "admin"
      canCreateUsers = !!(profile?.permissions as any)?.criar_usuarios

      if (!isAdminRole && !canCreateUsers) {
        return new Response(JSON.stringify({ error: "Acesso negado. Você não tem permissão para cadastrar usuários." }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
      }
    }

    const isFullAdmin = isAdminEmail || isAdminRole

    const { new_email, new_password, new_name, new_position, new_role } = await req.json()

    if (!new_email || !new_password || !new_name) {
      return new Response(JSON.stringify({ error: "Campos obrigatórios: email, senha e nome." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }
    if (new_password.length < 6) {
      return new Response(JSON.stringify({ error: "A senha deve ter no mínimo 6 caracteres." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // Quem tem apenas criar_usuarios não pode atribuir role 'admin' a novos usuários
    const assignedRole = new_role ?? "outro"
    if (!isFullAdmin && assignedRole === "admin") {
      return new Response(JSON.stringify({ error: "Sem permissão para criar usuários com nível Administrador." }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // Cria via API Admin do GoTrue (única forma confiável no Supabase cloud)
    const { data: newUser, error: createErr } = await adminClient.auth.admin.createUser({
      email: new_email.trim(),
      password: new_password.trim(),
      email_confirm: true,
      user_metadata: { full_name: new_name.trim(), position: new_position, role: assignedRole },
    })

    if (createErr) {
      const msg = createErr.message.includes("already registered")
        ? "Este e-mail já está cadastrado no sistema."
        : createErr.message
      return new Response(JSON.stringify({ error: msg }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    if (newUser.user) {
      await adminClient.from("profiles").upsert({
        id: newUser.user.id,
        full_name: new_name.trim(),
        position: new_position ?? "Gestor de Tráfego",
        role: assignedRole,
        email: new_email.trim(),
      }, { onConflict: "id" })
    }

    return new Response(JSON.stringify({ success: true, user_id: newUser.user?.id }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message ?? "Erro interno." }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})
