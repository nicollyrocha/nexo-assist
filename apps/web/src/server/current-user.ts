import type { SessionUser } from "@nexo/shared";
import { cookies } from "next/headers";
import { cache } from "react";
import { userFromToken } from "./auth";
import { getDeps } from "./deps";
import { SESSION_COOKIE } from "./session-token";

/**
 * Usuário da sessão para Server Components (e Route Handlers, se preferirem `cookies()`).
 * Lê cookie: com Cache Components, use dentro de um <Suspense>. Deduplicado por requisição.
 * null quando não há sessão válida (cookie ausente/adulterado, logout ou expirada).
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return userFromToken(getDeps(), token);
});
