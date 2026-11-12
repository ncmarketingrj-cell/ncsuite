import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.1"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const MASTER_ADMIN_EMAILS = [
  "nc.marketingrj@gmail.com",
  "hc.marketing.dgt@gmail.com",
]

function getLevel(email?: string, role?: string, position?: string): number {
  const e = (email || "").toLowerCase().trim()
  if (MASTER_ADMIN_EMAILS.includes(e)) return 100

  const r = (role || "").toLowerCase()
  const p = (position || "").toLowerCase()

  if (r === "admin" || r === "ceo" || /ceo|sócio|socio|proprietário|dono|administrador master/i.test(p)) {
    return 90
  }
  if (r === "diretor" || /diretor|diretora/i.test(p)) return 80
  if (r === "gerente" || /gerente|head/i.test(p)) return 70
  if (r === "coordenador" || /coordenador|coordenadora|líder|team lead/i.test(p)) return 60
  if (r === "gestor_trafego" || r === "gestor_projetos" || r === "desenvolvedor" || /gestor|media buyer|desenvolvedor/i.test(p)) return 50
  if (r === "social_media" || r === "designer" || r === "videomaker" || /social|designer|filmmaker|videomaker/i.test(p)) return 20
  if (r === "sdr" || r === "agency_sdr" || /sdr|comercial|vendas/i.test(p)) return 15
  return 10
}

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

    // Busca o perfil do chamador
    const { data: callerProfile } = await adminClient
      .from("profiles")
      .select("role, position, permissions, email")
      .eq("id", caller.id)
      .maybeSingle()

    const callerEmail = (caller.email || callerProfile?.email || "").toLowerCase().trim()
    const isCallerMaster = MASTER_ADMIN_EMAILS.includes(callerEmail)
    const callerLevel = getLevel(callerEmail, callerProfile?.role, callerProfile?.position)
    const hasPerm = isCallerMaster || callerLevel >= 70 || !!callerProfile?.permissions?.criar_usuarios

    if (!hasPerm) {
      return new Response(JSON.stringify({ error: "Acesso negado. Hierarquia ou permissões insuficientes para gerenciar usuários." }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const body = await req.json()
    const action = body.action || (body.target_user_id ? "update" : "create")

    // ──────────────────────────────────────────────────────────────────────────
    // AÇÃO: EXCLUIR USUÁRIO
    // ──────────────────────────────────────────────────────────────────────────
    if (action === "delete") {
      const targetUserId = body.target_user_id
      if (!targetUserId) {
        return new Response(JSON.stringify({ error: "ID de usuário ausente." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
      }

      const { data: targetProfile } = await adminClient
        .from("profiles")
        .select("role, position, email")
        .eq("id", targetUserId)
        .maybeSingle()

      const targetEmail = (targetProfile?.email || "").toLowerCase().trim()
      if (MASTER_ADMIN_EMAILS.includes(targetEmail)) {
        return new Response(JSON.stringify({ error: "O Administrador Master é protegido e nunca pode ser excluído." }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
      }

      const targetLevel = getLevel(targetEmail, targetProfile?.role, targetProfile?.position)
      if (!isCallerMaster && callerLevel <= targetLevel) {
        return new Response(JSON.stringify({ error: "Hierarquia insuficiente. Você só pode excluir usuários subordinados ao seu nível." }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
      }

      await adminClient.auth.admin.deleteUser(targetUserId)
      await adminClient.from("profiles").delete().eq("id", targetUserId)

      return new Response(JSON.stringify({ success: true, message: "Usuário excluído com sucesso." }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // ──────────────────────────────────────────────────────────────────────────
    // AÇÃO: ATUALIZAR USUÁRIO (LOGIN, SENHA, CARGO, ROLE, PERMISSÕES, STATUS)
    // ──────────────────────────────────────────────────────────────────────────
    if (action === "update") {
      const targetUserId = body.target_user_id
      if (!targetUserId) {
        return new Response(JSON.stringify({ error: "ID de usuário ausente para atualização." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
      }

      const { data: targetProfile } = await adminClient
        .from("profiles")
        .select("role, position, email")
        .eq("id", targetUserId)
        .maybeSingle()

      const targetEmail = (targetProfile?.email || "").toLowerCase().trim()

      // Proteção estrita do Master Admin
      if (MASTER_ADMIN_EMAILS.includes(targetEmail)) {
        if (!isCallerMaster || caller.id !== targetUserId) {
          return new Response(JSON.stringify({ error: "O Administrador Master possui proteção absoluta e não pode ser editado por terceiros." }), {
            status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
          })
        }
      }

      const targetLevel = getLevel(targetEmail, targetProfile?.role, targetProfile?.position)
      if (!isCallerMaster && caller.id !== targetUserId && callerLevel <= targetLevel) {
        return new Response(JSON.stringify({ error: "Hierarquia insuficiente. Você só pode gerenciar usuários subordinados ao seu nível." }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
      }

      // Validar nova role / position
      if (body.new_role && !isCallerMaster) {
        const assignedLevel = getLevel("", body.new_role, body.new_position)
        if (assignedLevel >= callerLevel) {
          return new Response(JSON.stringify({ error: "Você não tem autoridade para promover usuários a um nível igual ou superior ao seu." }), {
            status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
          })
        }
      }

      // Atualiza credenciais no GoTrue Auth
      const authUpdates: Record<string, any> = {}
      if (body.new_email && body.new_email.trim().toLowerCase() !== targetEmail) {
        authUpdates.email = body.new_email.trim().toLowerCase()
        authUpdates.email_confirm = true
      }
      if (body.new_password && body.new_password.trim().length >= 6) {
        authUpdates.password = body.new_password.trim()
      }
      if (body.new_name || body.new_position || body.new_role) {
        authUpdates.user_metadata = {
          full_name: body.new_name?.trim(),
          position: body.new_position,
          role: body.new_role,
        }
      }

      if (Object.keys(authUpdates).length > 0) {
        const { error: updateAuthErr } = await adminClient.auth.admin.updateUserById(targetUserId, authUpdates)
        if (updateAuthErr) {
          return new Response(JSON.stringify({ error: `Falha ao atualizar credenciais de login: ${updateAuthErr.message}` }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          })
        }
      }

      // Atualiza tabela profiles
      const profileUpdates: Record<string, any> = {
        updated_at: new Date().toISOString(),
      }
      if (body.new_name) profileUpdates.full_name = body.new_name.trim()
      if (body.new_position) profileUpdates.position = body.new_position
      if (body.new_role) profileUpdates.role = body.new_role
      if (body.new_email) profileUpdates.email = body.new_email.trim().toLowerCase()
      if (body.status) profileUpdates.status = body.status
      if (body.new_permissions) profileUpdates.permissions = body.new_permissions

      await adminClient.from("profiles").update(profileUpdates).eq("id", targetUserId)

      return new Response(JSON.stringify({ success: true, message: "Usuário e credenciais atualizados com sucesso." }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // ──────────────────────────────────────────────────────────────────────────
    // AÇÃO: CRIAR NOVO USUÁRIO
    // ──────────────────────────────────────────────────────────────────────────
    const { new_email, new_password, new_name, new_position, new_role, new_permissions, status } = body

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

    const assignedRole = new_role ?? "outro"
    const assignedLevel = getLevel("", assignedRole, new_position)

    if (!isCallerMaster && assignedLevel >= callerLevel) {
      return new Response(JSON.stringify({ error: "Hierarquia insuficiente. Você só pode cadastrar usuários com nível inferior ao seu." }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // Cria via API Admin do GoTrue
    const { data: newUser, error: createErr } = await adminClient.auth.admin.createUser({
      email: new_email.trim().toLowerCase(),
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
        email: new_email.trim().toLowerCase(),
        status: status || "ativo",
        permissions: new_permissions || {},
        updated_at: new Date().toISOString(),
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
