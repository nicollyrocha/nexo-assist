import { LoginInput, PublicUser, type LoginResponse } from "@nexo/shared";
import { getDeps } from "@/server/deps";
import { handle, json, parseBody } from "@/server/http";
import { login } from "@/server/login";
import { sessionCookieHeader } from "@/server/session-token";

/** POST /api/auth/login → 200 LoginResponse + cookie de sessão; 401 invalid_credentials; 503 unavailable. */
export const POST = handle("auth.login", async (req: Request) => {
  const input = await parseBody(req, LoginInput);
  const result = await login(getDeps(), input);
  // O id da sessão fica só no cookie httpOnly: o schema público descarta o campo.
  const body: LoginResponse = { user: PublicUser.parse(result.user), redirectTo: result.redirectTo };
  return json(body, { headers: { "set-cookie": sessionCookieHeader(result.token, result.maxAgeMs) } });
});
