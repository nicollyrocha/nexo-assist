import { getDeps } from "@/server/deps";
import { handle } from "@/server/http";
import { logout } from "@/server/login";
import { SESSION_COOKIE, clearSessionCookieHeader, readCookie } from "@/server/session-token";

/** POST /api/auth/logout → 204 e cookie apagado (sempre, mesmo sem sessão válida). */
export const POST = handle("auth.logout", async (req: Request) => {
  await logout(getDeps(), readCookie(req, SESSION_COOKIE));
  return new Response(null, { status: 204, headers: { "set-cookie": clearSessionCookieHeader() } });
});
