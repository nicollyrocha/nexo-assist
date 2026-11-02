import { createSession, deleteSession } from "@nexo/db";
import type { LoginInput, SessionUser } from "@nexo/shared";
import type { Deps } from "./deps";
import { ApiFailure } from "./http";
import { homeFor } from "./mappers";
import { SESSION_TTL_MS, signSessionToken, verifySessionToken } from "./session-token";

/**
 * Login dos dados de exemplo: e-mail corporativo de funcionário ou analista, qualquer senha
 * (nenhuma senha é verificada nem guardada). Devolve o usuário, o destino e o token do cookie.
 */
export async function login(deps: Deps, input: LoginInput) {
  const email = input.email.trim().toLowerCase();
  const [employee, analyst] = await Promise.all([
    deps.tickets.findEmployeeByEmail(email),
    deps.tickets.findAnalystByEmail(email),
  ]);

  let identity: Pick<SessionUser, "userId" | "role" | "name" | "email" | "detail"> | null = null;
  if (employee.ok && employee.data) {
    deps.directory.remember({ kind: "employee", value: employee.data });
    const e = employee.data;
    identity = { userId: e.id, role: "funcionario", name: e.name, email: e.email, detail: e.department };
  } else if (analyst.ok && analyst.data) {
    deps.directory.remember({ kind: "analyst", value: analyst.data });
    const a = analyst.data;
    identity = { userId: a.id, role: "analista", name: a.name, email: a.email, detail: a.tier };
  } else if (!employee.ok || !analyst.ok) {
    throw new ApiFailure("unavailable", "Não conseguimos confirmar seu acesso agora: o sistema de chamados não respondeu. Tente de novo em instantes.");
  }
  if (!identity) throw new ApiFailure("invalid_credentials", "E-mail não encontrado. Use seu e-mail corporativo da Nexo.");

  const session = await createSession(deps.db, { userId: identity.userId, role: identity.role, ttlMs: SESSION_TTL_MS });
  const user: SessionUser = { sessionId: session.id, ...identity };
  return {
    user,
    redirectTo: homeFor(user.role),
    token: signSessionToken(user, deps.sessionSecret, session.expiresAt),
    maxAgeMs: session.expiresAt.getTime() - deps.now().getTime(),
  };
}

/** Logout: apaga a sessão do banco (o cookie vira lixo mesmo se alguém o tiver copiado). */
export async function logout(deps: Deps, token: string | null) {
  const user = verifySessionToken(token, deps.sessionSecret, deps.now().getTime());
  if (user) await deleteSession(deps.db, user.sessionId);
}
