// ──────────────────────────────────────────────────────────────────────────────
// userService.ts — Orquestração Segura de Gestão de Usuários da NC Suite
// ──────────────────────────────────────────────────────────────────────────────

import { supabase } from "@/integrations/supabase-external/client";
import { normalizeRoleForDbConstraint } from "@/lib/userHierarchy";

function isRoleConstraintError(msg?: string): boolean {
  return /profiles_role_check|violates check constraint.*role/i.test(msg || "");
}

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

export function translateAuthError(msg?: string): string {
  const raw = (msg || "").trim();
  if (!raw) return "Erro desconhecido na autenticação.";
  if (/already.*registered/i.test(raw) || /already in use/i.test(raw)) {
    return "Este e-mail já está cadastrado em outra conta.";
  }
  if (/invalid login credentials/i.test(raw)) {
    return "E-mail ou senha incorretos.";
  }
  if (/email not confirmed/i.test(raw)) {
    return "Conta ainda não confirmada no Auth. O administrador pode reconfirmar salvando as credenciais.";
  }
  if (/reauthentication/i.test(raw)) {
    return "O Supabase solicitou reautenticação por e-mail. Aplicando atualização direta sem envio de e-mail...";
  }
  if (/gen_salt/i.test(raw)) {
    return "Função de criptografia pendente no banco (execute a migration 20261112180000_fix_auth_credentials_no_email.sql ou publique a Edge Function admin-create-user).";
  }
  return raw;
}

async function extractEdgeError(edgeErr: any, edgeRes?: any): Promise<string> {
  if (edgeRes?.error) return String(edgeRes.error);
  if (!edgeErr) return "";
  try {
    if ("context" in edgeErr && typeof edgeErr.context?.json === "function") {
      const errBody = await edgeErr.context.json();
      if (errBody?.error || errBody?.message) {
        return String(errBody.error || errBody.message);
      }
    }
  } catch {
    // ignore parse failure
  }
  return String(edgeErr.message || "");
}

/**
 * Cria um novo usuário com ativação imediata (SEM envio de e-mail de confirmação).
 * Tenta a Edge Function administrativa primeiro e faz fallback automático via RPC admin_create_user.
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

  let newUserId: string | undefined;
  let edgeErrorMsg = "";

  // 1. Tenta Edge Function admin-create-user (cria com email_confirm: true, zero e-mail enviado)
  let effectiveRole = data.role || "outro";
  try {
    let { data: res, error } = await supabase.functions.invoke("admin-create-user", {
      body: {
        action: "create",
        new_email: email,
        new_password: password,
        new_name: name,
        new_position: data.position,
        new_role: effectiveRole,
        new_permissions: permissionsPayload,
        status: data.status || "ativo",
        avatar_url: data.avatarUrl || null,
      },
    });

    if (!error && !res?.error) {
      newUserId = res?.user_id;
    } else {
      edgeErrorMsg = await extractEdgeError(error, res);
      if (isRoleConstraintError(edgeErrorMsg)) {
        effectiveRole = normalizeRoleForDbConstraint(effectiveRole);
        const retryEdge = await supabase.functions.invoke("admin-create-user", {
          body: {
            action: "create",
            new_email: email,
            new_password: password,
            new_name: name,
            new_position: data.position,
            new_role: effectiveRole,
            new_permissions: permissionsPayload,
            status: data.status || "ativo",
            avatar_url: data.avatarUrl || null,
          },
        });
        if (!retryEdge.error && !retryEdge.data?.error) {
          newUserId = retryEdge.data?.user_id;
          edgeErrorMsg = "";
        } else {
          edgeErrorMsg = await extractEdgeError(retryEdge.error, retryEdge.data);
        }
      }
    }
  } catch (err: any) {
    edgeErrorMsg = err?.message || "";
  }

  // Se erro explícito de validação (e-mail duplicado / hierarquia), interrompe imediatamente
  if (!newUserId && /cadastrado|registered|hierarquia|negado|inválid|obrigatório|mínimo/i.test(edgeErrorMsg)) {
    return { success: false, error: translateAuthError(edgeErrorMsg) };
  }

  // 2. Fallback seguro via RPC admin_create_user (também cria já confirmado em auth.users + auth.identities, SEM envio de e-mail)
  if (!newUserId) {
    try {
      let { data: rpcUserId, error: rpcErr } = await (supabase as any).rpc("admin_create_user", {
        new_email: email,
        new_password: password,
        new_name: name,
        new_position: data.position || "Gestor de Tráfego",
        new_role: effectiveRole,
      });
      if (rpcErr && isRoleConstraintError(rpcErr.message)) {
        effectiveRole = normalizeRoleForDbConstraint(effectiveRole);
        const retryRpc = await (supabase as any).rpc("admin_create_user", {
          new_email: email,
          new_password: password,
          new_name: name,
          new_position: data.position || "Gestor de Tráfego",
          new_role: effectiveRole,
        });
        rpcUserId = retryRpc.data;
        rpcErr = retryRpc.error;
      }
      if (rpcErr) {
        return {
          success: false,
          error: translateAuthError(rpcErr.message || edgeErrorMsg),
        };
      }
      newUserId = rpcUserId;
    } catch (rpcEx: any) {
      return {
        success: false,
        error: translateAuthError(rpcEx?.message || edgeErrorMsg || "Não foi possível criar o usuário."),
      };
    }
  }

  // 3. Garante gravação de permissões, senha legível (_last_password) e avatar no profile
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
      const profPayload: Record<string, any> = {
        permissions: permissionsPayload,
        avatar_url: data.avatarUrl || null,
        updated_at: new Date().toISOString(),
      };
      await (supabase as any).from("profiles").update(profPayload).eq("id", newUserId);
    } catch {
      // ignore
    }
  }

  return {
    success: true,
    userId: newUserId,
    message: "Usuário criado e ativado imediatamente (sem necessidade de confirmação por e-mail)!",
  };
}

/**
 * Atualiza um usuário: permite alterar Login (e-mail), Senha, Nome, Cargo, Role e Permissões
 * com ativação imediata e SEM envio de e-mail de confirmação.
 * IMPORTANTE: nunca grava _last_password em profiles se a troca real de senha no Auth falhar.
 */
export async function updateSystemUser(data: UpdateUserData): Promise<ServiceResult> {
  if (!data.targetUserId) {
    return { success: false, error: "ID de usuário inválido." };
  }

  const newEmail = data.newEmail?.trim().toLowerCase();
  const newPassword = data.newPassword?.trim();
  const newName = data.newName?.trim();
  const hasPasswordChange = Boolean(newPassword && newPassword.length >= 6);

  let permissionsPayload = data.newPermissions;
  if (hasPasswordChange && newPassword) {
    permissionsPayload = {
      ...(permissionsPayload || {}),
      _last_password: newPassword,
    };
  }

  let edgeFunctionSucceeded = false;
  let edgeErrorMsg = "";
  let effectiveRole = data.newRole;

  // 1. Tenta a Edge Function administrativa (GoTrue Admin API com email_confirm: true)
  try {
    const invokeUpdate = async (roleToUse?: string) =>
      supabase.functions.invoke("admin-create-user", {
        body: {
          action: "update",
          target_user_id: data.targetUserId,
          new_email: newEmail || undefined,
          new_password: hasPasswordChange ? newPassword : undefined,
          new_name: newName || undefined,
          new_position: data.newPosition,
          new_role: roleToUse,
          new_permissions: permissionsPayload,
          status: data.status,
          avatar_url: data.avatarUrl,
        },
      });

    const { data: edgeRes, error: edgeErr } = await invokeUpdate(effectiveRole);

    if (!edgeErr && !edgeRes?.error) {
      edgeFunctionSucceeded = true;
    } else {
      edgeErrorMsg = await extractEdgeError(edgeErr, edgeRes);
      if (effectiveRole && isRoleConstraintError(edgeErrorMsg)) {
        effectiveRole = normalizeRoleForDbConstraint(effectiveRole);
        const retryEdge = await invokeUpdate(effectiveRole);
        if (!retryEdge.error && !retryEdge.data?.error) {
          edgeFunctionSucceeded = true;
          edgeErrorMsg = "";
        } else {
          edgeErrorMsg = await extractEdgeError(retryEdge.error, retryEdge.data);
        }
      }
    }
  } catch (err: any) {
    edgeErrorMsg = err?.message || "";
  }

  // 2. Se a Edge Function concluiu com sucesso, já aplicou tudo em Auth + Profiles!
  if (edgeFunctionSucceeded) {
    return {
      success: true,
      userId: data.targetUserId,
      message: "Dados, login e senha atualizados imediatamente (sem envio de e-mail)!",
    };
  }

  // Se erro explícito de permissão/hierarquia/proteção master, aborta
  if (/negado|insuficiente|protegid|absolut/i.test(edgeErrorMsg)) {
    return { success: false, error: translateAuthError(edgeErrorMsg) };
  }

  // 3. Fallback via RPC admin_update_user no banco (tenta 7 parâmetros e faz fallback automático para 5 parâmetros + role constraint)
  let rpcSucceeded = false;
  let rpcErrorMsg = "";
  try {
    const runRpcUpdate = async (roleToUse: string) => {
      const rpc7Payload: any = {
        target_user_id: data.targetUserId,
        new_role: roleToUse,
        new_position: data.newPosition || "Gestor de Tráfego",
        new_name: newName || "",
        new_password: hasPasswordChange ? newPassword : null,
        new_email: newEmail || null,
        new_status: data.status || null,
      };

      const { error: rpc7Err } = await (supabase as any).rpc("admin_update_user", rpc7Payload);
      if (!rpc7Err) return { ok: true, errorMsg: "" };

      if (rpc7Err.message?.includes("schema cache") || rpc7Err.code === "PGRST202") {
        const { error: rpc5Err } = await (supabase as any).rpc("admin_update_user", {
          target_user_id: data.targetUserId,
          new_role: roleToUse,
          new_position: data.newPosition || "Gestor de Tráfego",
          new_name: newName || "",
          new_password: hasPasswordChange ? newPassword : null,
        });
        if (!rpc5Err) return { ok: true, errorMsg: "" };
        return { ok: false, errorMsg: rpc5Err.message || "" };
      }

      return { ok: false, errorMsg: rpc7Err.message || "" };
    };

    let attempt = await runRpcUpdate(effectiveRole || "outro");
    if (!attempt.ok && isRoleConstraintError(attempt.errorMsg)) {
      effectiveRole = normalizeRoleForDbConstraint(effectiveRole || "outro");
      attempt = await runRpcUpdate(effectiveRole);
    }

    rpcSucceeded = attempt.ok;
    rpcErrorMsg = attempt.errorMsg;
  } catch (rpcErr: any) {
    rpcErrorMsg = rpcErr?.message || "";
  }

  // Se admin solicitou alteração real de SENHA, ela PRECISA ter sido aplicada no Auth (via Edge Function ou RPC)!
  // Nunca gravar _last_password em profiles se o login real não foi atualizado.
  if (hasPasswordChange && !rpcSucceeded) {
    return {
      success: false,
      error: translateAuthError(rpcErrorMsg || edgeErrorMsg || "Não foi possível atualizar a senha no servidor de autenticação."),
    };
  }

  // 4. Atualiza dados complementares e _last_password em profiles
  let directProfileSucceeded = false;
  try {
    const updatePayload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };
    if (newName) updatePayload.full_name = newName;
    if (data.newPosition) updatePayload.position = data.newPosition;
    if (effectiveRole) updatePayload.role = effectiveRole;
    if (newEmail) updatePayload.email = newEmail;
    if (data.status) updatePayload.status = data.status;
    if (permissionsPayload) updatePayload.permissions = permissionsPayload;
    if (data.avatarUrl !== undefined) updatePayload.avatar_url = data.avatarUrl;

    let { error: profErr } = await (supabase as any)
      .from("profiles")
      .update(updatePayload)
      .eq("id", data.targetUserId);

    if (profErr && isRoleConstraintError(profErr.message) && updatePayload.role) {
      updatePayload.role = normalizeRoleForDbConstraint(updatePayload.role);
      const retryRole = await (supabase as any)
        .from("profiles")
        .update(updatePayload)
        .eq("id", data.targetUserId);
      profErr = retryRole.error;
    }

    if (profErr && profErr.message?.toLowerCase().includes("status")) {
      delete updatePayload.status;
      const retry = await (supabase as any)
        .from("profiles")
        .update(updatePayload)
        .eq("id", data.targetUserId);
      profErr = retry.error;
    }

    if (!profErr) {
      directProfileSucceeded = true;
    }
  } catch (profErr) {
    console.error("[userService] Erro ao atualizar tabela profiles:", profErr);
  }

  // 5. Se houver permissões, garante a atualização via RPC (somente após Auth bem-sucedido quando houver senha)
  if (permissionsPayload && Object.keys(permissionsPayload).length > 0) {
    try {
      await (supabase as any).rpc("admin_set_user_permissions", {
        target_user_id: data.targetUserId,
        new_permissions: permissionsPayload,
      });
      directProfileSucceeded = true;
    } catch (permErr) {
      console.warn("[userService] Aviso ao definir permissões via RPC:", permErr);
    }
  }

  if (rpcSucceeded || directProfileSucceeded) {
    return {
      success: true,
      userId: data.targetUserId,
      message: "Credenciais, login e permissões atualizados com sucesso (sem envio de e-mail)!",
    };
  }

  return {
    success: false,
    error: translateAuthError(rpcErrorMsg || edgeErrorMsg || "Não foi possível salvar as alterações."),
  };
}

/**
 * Atualiza a própria senha do usuário logado sem disparo de e-mail de confirmação/reautenticação.
 */
export async function updateOwnPassword(
  userId: string,
  newPassword: string,
  existingPermissions: Record<string, any> = {},
  meta?: { role?: string; position?: string; fullName?: string }
): Promise<ServiceResult> {
  const cleanPwd = newPassword.trim();
  if (cleanPwd.length < 6) {
    return { success: false, error: "A nova senha deve ter no mínimo 6 caracteres." };
  }

  let changed = false;
  let lastError = "";

  // 1. Tenta via Admin Edge Function (zero e-mail de confirmação/reautenticação)
  try {
    const { data: res, error } = await supabase.functions.invoke("admin-create-user", {
      body: {
        action: "update_self_password",
        new_password: cleanPwd,
      },
    });
    if (!error && !res?.error) {
      changed = true;
    } else {
      lastError = await extractEdgeError(error, res);
    }
  } catch (e: any) {
    lastError = e?.message || "";
  }

  // 2. Fallback: RPC admin_update_user para próprio ID
  if (!changed) {
    try {
      const { error: rpcErr } = await (supabase as any).rpc("admin_update_user", {
        target_user_id: userId,
        new_role: meta?.role || "outro",
        new_position: meta?.position || "Outros",
        new_name: meta?.fullName || "",
        new_password: cleanPwd,
      });
      if (!rpcErr) {
        changed = true;
      } else {
        lastError = rpcErr.message || lastError;
      }
    } catch (e: any) {
      lastError = e?.message || lastError;
    }
  }

  // 3. Fallback nativo: supabase.auth.updateUser (só se não exigir confirmação de e-mail)
  if (!changed) {
    const { error: authErr } = await supabase.auth.updateUser({ password: cleanPwd });
    if (!authErr) {
      changed = true;
    } else {
      lastError = authErr.message || lastError;
    }
  }

  if (!changed) {
    return { success: false, error: translateAuthError(lastError) };
  }

  // Só atualiza _last_password depois que o Auth realmente aceitou a nova senha
  await (supabase as any)
    .from("profiles")
    .update({
      permissions: {
        ...(existingPermissions || {}),
        _last_password: cleanPwd,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  return { success: true, message: "Sua senha foi alterada com sucesso!" };
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

