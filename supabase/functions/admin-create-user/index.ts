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
    const body = await req.json()
    const action = body.action || (body.target_user_id ? "update" : "create")

    // ──────────────────────────────────────────────────────────────────────────
    // AÇÃO: ATUALIZAR PRÓPRIA SENHA (ZERO ENVIO DE E-MAIL / REAUTENTICAÇÃO)
    // ──────────────────────────────────────────────────────────────────────────
    if (action === "update_self_password") {
      const newPwd = (body.new_password || "").trim()
      if (newPwd.length < 6) {
        return new Response(JSON.stringify({ error: "A nova senha deve ter no mínimo 6 caracteres." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
      }

      const { error: selfAuthErr } = await adminClient.auth.admin.updateUserById(caller.id, {
        password: newPwd,
        email_confirm: true,
      })
      if (selfAuthErr) {
        return new Response(JSON.stringify({ error: `Erro ao alterar sua senha: ${selfAuthErr.message}` }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
      }

      const nextPerms = {
        ...(callerProfile?.permissions || {}),
        _last_password: newPwd,
      }
      await adminClient.from("profiles").update({
        permissions: nextPerms,
        updated_at: new Date().toISOString(),
      }).eq("id", caller.id)

      return new Response(JSON.stringify({ success: true, message: "Senha atualizada imediatamente sem envio de e-mail." }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const hasPerm = isCallerMaster || callerLevel >= 70 || !!callerProfile?.permissions?.criar_usuarios

    if (!hasPerm) {
      return new Response(JSON.stringify({ error: "Acesso negado. Hierarquia ou permissões insuficientes para gerenciar usuários." }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

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
        .select("role, position, email, permissions")
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
      if (body.new_role && !isCallerMaster && caller.id !== targetUserId) {
        const assignedLevel = getLevel("", body.new_role, body.new_position)
        if (assignedLevel >= callerLevel) {
          return new Response(JSON.stringify({ error: "Você não tem autoridade para promover usuários a um nível igual ou superior ao seu." }), {
            status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
          })
        }
      }

      // Atualiza credenciais no GoTrue Auth (SEMPRE email_confirm: true para ZERO envio de e-mail)
      const cleanNewEmail = body.new_email?.trim().toLowerCase()
      const cleanNewPwd = body.new_password?.trim()
      const authUpdates: Record<string, any> = {}
      if (cleanNewEmail && cleanNewEmail !== targetEmail) {
        authUpdates.email = cleanNewEmail
        authUpdates.email_confirm = true
      }
      if (cleanNewPwd && cleanNewPwd.length >= 6) {
        authUpdates.password = cleanNewPwd
        authUpdates.email_confirm = true
      }
      if (body.new_name || body.new_position || body.new_role || body.avatar_url) {
        authUpdates.user_metadata = {
          full_name: body.new_name?.trim(),
          position: body.new_position,
          role: body.new_role,
          avatar_url: body.avatar_url,
        }
      }

      // Preparar permissões garantindo armazenamento da senha salva para visualização dos superiores
      let finalPermissions = body.new_permissions || targetProfile?.permissions || {}
      if (cleanNewPwd && cleanNewPwd.length >= 6) {
        finalPermissions = {
          ...finalPermissions,
          _last_password: cleanNewPwd,
        }
      }

      if (Object.keys(authUpdates).length > 0) {
        let effectiveAuthId = targetUserId
        const { error: updateAuthErr } = await adminClient.auth.admin.updateUserById(targetUserId, authUpdates)
        if (updateAuthErr) {
          console.warn("[admin-create-user] updateUserById falhou:", updateAuthErr.message)

          // Se o usuário não foi encontrado por ID, tenta localizar por email ou recriar no GoTrue
          if (updateAuthErr.message?.toLowerCase().includes("not found") || (updateAuthErr as any)?.status === 404) {
            const lookupEmail = cleanNewEmail || targetEmail
            const { data: listRes } = await adminClient.auth.admin.listUsers({ perPage: 1000 })
            const existingByEmail = (listRes?.users || []).find(
              (u: any) => (u.email || "").toLowerCase().trim() === lookupEmail
            )

            if (existingByEmail) {
              effectiveAuthId = existingByEmail.id
              const { error: retryErr } = await adminClient.auth.admin.updateUserById(effectiveAuthId, authUpdates)
              if (retryErr) {
                return new Response(JSON.stringify({ error: `Falha ao atualizar login do usuário: ${retryErr.message}` }), {
                  status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
                })
              }
            } else {
              const { error: createAuthErr } = await adminClient.auth.admin.createUser({
                id: targetUserId,
                email: lookupEmail,
                password: cleanNewPwd || "NcSuite@2026",
                email_confirm: true,
                user_metadata: authUpdates.user_metadata,
              })
              if (createAuthErr) {
                return new Response(JSON.stringify({ error: `Falha ao vincular usuário no login: ${createAuthErr.message}` }), {
                  status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
                })
              }
            }
          } else {
            const msg = /already.*registered/i.test(updateAuthErr.message)
              ? "Este e-mail já está em uso por outra conta no sistema."
              : updateAuthErr.message
            return new Response(JSON.stringify({ error: msg }), {
              status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
            })
          }
        }
      }

      // Atualiza tabela profiles (com fallback caso coluna status ainda não exista no banco)
      const profileUpdates: Record<string, any> = {
        updated_at: new Date().toISOString(),
        permissions: finalPermissions,
      }
      if (body.new_name) profileUpdates.full_name = body.new_name.trim()
      if (body.new_position) profileUpdates.position = body.new_position
      if (body.new_role) profileUpdates.role = body.new_role
      if (cleanNewEmail) profileUpdates.email = cleanNewEmail
      if (body.status) profileUpdates.status = body.status
      if (body.avatar_url !== undefined) profileUpdates.avatar_url = body.avatar_url

      let { error: profileErr } = await adminClient
        .from("profiles")
        .update(profileUpdates)
        .eq("id", targetUserId)

      if (profileErr && profileErr.message?.toLowerCase().includes("status")) {
        delete profileUpdates.status
        const retryProfile = await adminClient
          .from("profiles")
          .update(profileUpdates)
          .eq("id", targetUserId)
        profileErr = retryProfile.error
      }

      if (profileErr) {
        return new Response(JSON.stringify({ error: `Erro ao salvar perfil no banco: ${profileErr.message}` }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
      }

      return new Response(JSON.stringify({
        success: true,
        message: "Credenciais, login e permissões atualizados imediatamente (sem envio de e-mail).",
      }), {
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
      user_metadata: {
        full_name: new_name.trim(),
        position: new_position,
        role: assignedRole,
        avatar_url: body.avatar_url || null,
      },
    })

    if (createErr) {
      const msg = /already.*registered/i.test(createErr.message)
        ? "Este e-mail já está cadastrado no sistema."
        : createErr.message
      return new Response(JSON.stringify({ error: msg }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    if (newUser.user) {
      const createdPerms = {
        ...(new_permissions || {}),
        _last_password: new_password.trim(),
      }
      const upsertPayload: Record<string, any> = {
        id: newUser.user.id,
        full_name: new_name.trim(),
        position: new_position ?? "Gestor de Tráfego",
        role: assignedRole,
        email: new_email.trim().toLowerCase(),
        status: status || "ativo",
        permissions: createdPerms,
        avatar_url: body.avatar_url || null,
        updated_at: new Date().toISOString(),
      }
      const { error: upErr } = await adminClient.from("profiles").upsert(upsertPayload, { onConflict: "id" })
      if (upErr && upErr.message?.toLowerCase().includes("status")) {
        delete upsertPayload.status
        await adminClient.from("profiles").upsert(upsertPayload, { onConflict: "id" })
      }
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
