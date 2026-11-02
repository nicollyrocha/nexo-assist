import { SessionUser } from "@nexo/shared";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

// Cookie de sessão: payload em base64url + HMAC-SHA256 com SESSION_SECRET.
// O payload leva o id da sessão do banco (a fonte da verdade: logout e expiração valem lá) e os
// dados de exibição do usuário, para não consultar o legado instável a cada requisição.
// É assinado, não cifrado: só contém dados do próprio usuário, e o cookie é httpOnly.
// Sem dependências do Next: usado pelo proxy, pelos Route Handlers e pelos testes.

export const SESSION_COOKIE = "nexo_session";
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

const Payload = SessionUser.extend({ exp: z.number().int() });
type Payload = z.infer<typeof Payload>;

const b64 = (value: string | Buffer) => Buffer.from(value).toString("base64url");
const sign = (data: string, secret: string) => createHmac("sha256", secret).update(data).digest("base64url");

export function signSessionToken(user: SessionUser, secret: string, expiresAt: Date): string {
  const payload: Payload = { ...user, exp: expiresAt.getTime() };
  const data = b64(JSON.stringify(payload));
  return `${data}.${sign(data, secret)}`;
}

/** Usuário do token se a assinatura confere e não expirou; null caso contrário. Não consulta o banco. */
export function verifySessionToken(token: string | undefined | null, secret: string, now = Date.now()): SessionUser | null {
  if (!token) return null;
  const [data, signature, extra] = token.split(".");
  if (!data || !signature || extra !== undefined) return null;
  const expected = Buffer.from(sign(data, secret));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const parsed = Payload.safeParse(JSON.parse(Buffer.from(data, "base64url").toString("utf8")));
    if (!parsed.success || parsed.data.exp <= now) return null;
    return SessionUser.parse(parsed.data); // descarta o exp

  } catch {
    return null;
  }
}

/** Lê um cookie do cabeçalho Cookie de uma Request. */
export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

const secureCookies = () => process.env.NODE_ENV === "production";

/** Set-Cookie da sessão: httpOnly, SameSite=Lax, Secure em produção. */
export function sessionCookieHeader(token: string, maxAgeMs: number): string {
  return [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    `Max-Age=${Math.floor(maxAgeMs / 1000)}`,
    "HttpOnly",
    "SameSite=Lax",
    ...(secureCookies() ? ["Secure"] : []),
  ].join("; ");
}

export function clearSessionCookieHeader(): string {
  return [
    `${SESSION_COOKIE}=`,
    "Path=/",
    "Max-Age=0",
    "HttpOnly",
    "SameSite=Lax",
    ...(secureCookies() ? ["Secure"] : []),
  ].join("; ");
}
