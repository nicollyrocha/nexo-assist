import { getActiveSession } from "@nexo/db";
import type { SessionUser } from "@nexo/shared";
import { getDeps, type Deps } from "./deps";
import { ApiFailure } from "./http";
import { SESSION_COOKIE, readCookie, verifySessionToken } from "./session-token";

/**
 * Usuário de um token de sessão: assinatura válida + sessão ainda ativa no banco (logout e
 * expiração valem lá) + mesmo usuário e papel. Qualquer divergência = sem sessão.
 */
export async function sessionFromToken(
  deps: Deps,
  token: string | null | undefined,
): Promise<{ user: SessionUser; startedAt: Date } | null> {
  const claimed = verifySessionToken(token, deps.sessionSecret, deps.now().getTime());
  if (!claimed) return null;
  const session = await getActiveSession(deps.db, claimed.sessionId);
  if (!session || session.userId !== claimed.userId || session.role !== claimed.role) return null;
  return { user: claimed, startedAt: session.createdAt };
}

export async function userFromToken(deps: Deps, token: string | null | undefined): Promise<SessionUser | null> {
  return (await sessionFromToken(deps, token))?.user ?? null;
}

export type Authed = { user: SessionUser; deps: Deps; sessionStartedAt: Date };

async function authenticate(req: Request): Promise<Authed> {
  const deps = getDeps();
  const session = await sessionFromToken(deps, readCookie(req, SESSION_COOKIE));
  if (!session) throw new ApiFailure("unauthorized", "Sua sessão expirou. Entre de novo.");
  return { user: session.user, deps, sessionStartedAt: session.startedAt };
}

/** Exige sessão de funcionário: 401 sem sessão, 403 se for analista. */
export async function requireEmployee(req: Request): Promise<Authed> {
  const authed = await authenticate(req);
  if (authed.user.role !== "funcionario") throw new ApiFailure("forbidden", "Esta área é do chat do funcionário.");
  return authed;
}

/** Exige sessão de analista: 401 sem sessão, 403 se for funcionário. */
export async function requireAnalyst(req: Request): Promise<Authed> {
  const authed = await authenticate(req);
  if (authed.user.role !== "analista") throw new ApiFailure("forbidden", "Esta área é do console do analista.");
  return authed;
}
