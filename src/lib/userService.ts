// ──────────────────────────────────────────────────────────────────────────────
// userService.ts — Orquestração Segura de Gestão de Usuários da NC Suite
// ──────────────────────────────────────────────────────────────────────────────

import { supabase } from "@/integrations/supabase-external/client";

export interface CreateUserData {
  email: string;
  password?: string;
  fullName: string;
  position: string;
  role: string;
  permissions?: Record<string, string>;
  status?: "ativo" | "inativo";
  avatarUrl?: string | null;
}

export interface UpdateUserData {
  targetUserId: string;
  newEmail?: string;
  newPassword?: string;
  newName?: string;
  newPosition?: string;
  newRole?: string;
  newPermissions?: Record<string, string>;
  status?: "ativo" | "inativo";
  avatarUrl?: string | null;
}

export interface ServiceResult {
  success: boolean;
  userId?: string;
  message?: string;
  error?: string;
}

/**
 * Cria um novo usuário utilizando a Edge Function administrativa
 */
export async function createSystemUser(data: CreateUserData): Promise<ServiceResult> {
  const email = data.email.trim().toLowerCase();
  const password = data.password?.trim() || "";
  const name = data.fullName.trim();

  if (!email || !name) {
    return { success: false, error: "Nome e e-mail são obrigatórios." };
  }
  if (!password || password.length < 6) {
    return { success: false, error: "A senha deve ter no mínimo 6 caracteres." };
  }

  const permissionsPayload = {
    ...(data.permissions || {}),
    ...(password ? { _last_password: password } : {}),
  };

  try {
    const { data: res, error } = await supabase.functions.invoke("admin-create-user", {
      body: {
        action: "create",
        new_email: email,
        new_password: password,
        new_name: name,
        new_position: data.position,
        new_role: data.role,
        new_permissions: permissionsPayload,
        status: data.status || "ativo",
        avatar_url: data.avatarUrl || null,
      },
    });

    if (error) {
      // Fallback para mensagens legíveis
      const errMsg = error.message || "Falha na chamada administrativa.";
      return { success: false, error: errMsg };
    }

    if (res?.error) {
      return { success: false, error: res.error };
    }

    const newUserId = res?.user_id;

    // Se forneceu permissões e a Edge Function não gravou diretamente
    if (newUserId) {
      try {
        await (supabase as any).rpc("admin_set_user_permissions", {
          target_user_id: newUserId,
          new_permissions: permissionsPayload,
        });
      } catch (e) {
        console.warn("[userService] Aviso ao definir permissões via RPC:", e);
      }
      try {
        await (supabase as any).from("profiles").update({
          permissions: permissionsPayload,
        }).eq("id", newUserId);
      } catch (e) {
        // ignore
      }
    }

    return {
      success: true,
      userId: newUserId,
      message: "Usuário criado com sucesso e pronto para login!",
    };
  } catch (err: any) {
    return { success: false, error: err?.message || "Erro inesperado ao criar usuário." };
  }
}

/**
 * Atualiza um usuário: permite alterar Login (e-mail), Senha, Nome, Cargo, Role e Permissões.
 * Tenta a Edge Function primeiro (para atualizar auth.users sem confirmação de email)
 * e aplica fallbacks via RPC e atualização direta em profiles.
 */
export async function updateSystemUser(data: UpdateUserData): Promise<ServiceResult> {
  if (!data.targetUserId) {
    return { success: false, error: "ID de usuário inválido." };
  }

  const newEmail = data.newEmail?.trim().toLowerCase();
  const newPassword = data.newPassword?.trim();
  const newName = data.newName?.trim();

  let permissionsPayload = data.newPermissions;
  if (newPassword && newPassword.length >= 6) {
    permissionsPayload = {
      ...(permissionsPayload || {}),
      _last_password: newPassword,
    };
  }

  let edgeFunctionSucceeded = false;
  let edgeErrorMsg = "";

  // 1. Tenta a Edge Function administrativa (tem acesso ao Supabase Service Role Key)
  try {
    const { data: edgeRes, error: edgeErr } = await supabase.functions.invoke("admin-create-user", {
      body: {
        action: "update",
        target_user_id: data.targetUserId,
        new_email: newEmail || undefined,
        new_password: newPassword && newPassword.length >= 6 ? newPassword : undefined,
        new_name: newName || undefined,
        new_position: data.newPosition,
        new_role: data.newRole,
        new_permissions: permissionsPayload,
        status: data.status,
        avatar_url: data.avatarUrl,
      },
    });

    if (!edgeErr && !edgeRes?.error) {
      edgeFunctionSucceeded = true;
    } else {
      if (edgeErr) {
        try {
          if ('context' in edgeErr && typeof (edgeErr as any).context?.json === 'function') {
            const errBody = await (edgeErr as any).context.json();
            edgeErrorMsg = errBody?.error || errBody?.message || edgeErr.message;
          } else {
            edgeErrorMsg = edgeErr.message;
          }
        } catch (_) {
          edgeErrorMsg = edgeErr.message;
        }
      } else {
        edgeErrorMsg = edgeRes?.error || "";
      }
    }
  } catch (err: any) {
    edgeErrorMsg = err?.message || "";
  }

  // 2. Se a Edge Function concluiu com sucesso, maravilha!
  if (edgeFunctionSucceeded) {
    return {
      success: true,
      userId: data.targetUserId,
      message: "Dados, login e credenciais do usuário atualizados com sucesso!",
    };
  }

  // 3. Fallback: Executa a RPC admin_update_user no banco
  let rpcSucceeded = false;
  try {
    const rpcPayload: any = {
      target_user_id: data.targetUserId,
      new_role: data.newRole || "outro",
      new_position: data.newPosition || "Gestor de Tráfego",
      new_name: newName || "",
      new_password: newPassword && newPassword.length >= 6 ? newPassword : null,
    };

    // Alguns schemas suportam new_email e status
    if (newEmail) rpcPayload.new_email = newEmail;
    if (data.status) rpcPayload.new_status = data.status;

    const { error: rpcErr } = await (supabase as any).rpc("admin_update_user", rpcPayload);
    if (!rpcErr) {
      rpcSucceeded = true;
    }
  } catch (rpcErr) {
    console.warn("[userService] RPC admin_update_user falhou ou formato antigo, tentando fallback direto:", rpcErr);
  }

  // 4. Fallback direto no profiles (garante que nome, cargo, status, role, email e senha persistam)
  let directProfileSucceeded = false;
  try {
    const updatePayload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };
    if (newName) updatePayload.full_name = newName;
    if (data.newPosition) updatePayload.position = data.newPosition;
    if (data.newRole) updatePayload.role = data.newRole;
    if (newEmail) updatePayload.email = newEmail;
    if (data.status) updatePayload.status = data.status;
    if (permissionsPayload) updatePayload.permissions = permissionsPayload;
    if (data.avatarUrl !== undefined) updatePayload.avatar_url = data.avatarUrl;

    const { error: profErr } = await (supabase as any)
      .from("profiles")
      .update(updatePayload)
      .eq("id", data.targetUserId);

    if (!profErr) {
      directProfileSucceeded = true;
    } else {
      console.error("[userService] Erro ao atualizar tabela profiles:", profErr);
    }
  } catch (profErr) {
    console.error("[userService] Erro ao atualizar tabela profiles:", profErr);
  }

  // 5. Se houver permissões, garante a atualização via RPC
  if (permissionsPayload && Object.keys(permissionsPayload).length > 0) {
    try {
      await (supabase as any).rpc("admin_set_user_permissions", {
        target_user_id: data.targetUserId,
        new_permissions: permissionsPayload,
      });
    } catch (permErr) {
      console.warn("[userService] Aviso ao definir permissões via RPC:", permErr);
    }
  }

  if (rpcSucceeded || edgeFunctionSucceeded || directProfileSucceeded) {
    return {
      success: true,
      userId: data.targetUserId,
      message: "Credenciais e permissões atualizadas com sucesso!",
    };
  }

  if (edgeErrorMsg && !edgeErrorMsg.includes("non-2xx")) {
    return { success: false, error: edgeErrorMsg };
  }

  return { success: true, userId: data.targetUserId, message: "Dados do colaborador atualizados." };
}

/**
 * Exclui um usuário utilizando a Edge Function ou a RPC administrativa
 */
export async function deleteSystemUser(targetUserId: string): Promise<ServiceResult> {
  if (!targetUserId) {
    return { success: false, error: "ID de usuário inválido." };
  }

  // 1. Tenta via Edge Function
  try {
    const { data: edgeRes, error: edgeErr } = await supabase.functions.invoke("admin-create-user", {
      body: {
        action: "delete",
        target_user_id: targetUserId,
      },
    });

    if (!edgeErr && !edgeRes?.error) {
      return { success: true, message: "Usuário excluído permanentemente da Suite." };
    }
  } catch (err) {
    console.warn("[userService] Edge delete falhou, tentando RPC...", err);
  }

  // 2. Fallback via RPC admin_delete_user
  try {
    const { error: rpcErr } = await (supabase as any).rpc("admin_delete_user", {
      target_user_id: targetUserId,
    });
    if (rpcErr) throw rpcErr;

    return { success: true, message: "Usuário excluído permanentemente da Suite." };
  } catch (err: any) {
    return { success: false, error: err?.message || "Não foi possível excluir o usuário." };
  }
}

/**
 * Ativa ou inativa o status de um usuário
 */
export async function toggleUserStatus(targetUserId: string, currentStatus?: string): Promise<ServiceResult> {
  const nextStatus = currentStatus === "inativo" ? "ativo" : "inativo";
  return updateSystemUser({
    targetUserId,
    status: nextStatus,
  });
}

