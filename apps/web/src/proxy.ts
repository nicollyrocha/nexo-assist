import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "./server/session-token";

/**
 * Checagem otimista de acesso às telas (Next 16: "proxy", antigo middleware).
 * Só confere a assinatura e o papel do cookie, sem banco: /chat é de funcionário, /console de
 * analista; sem sessão → login (/). A autorização de verdade acontece em cada Route Handler
 * (requireEmployee/requireAnalyst) e em getSessionUser(), que também consultam a sessão no banco.
 */
export function proxy(req: NextRequest) {
  const secret = process.env.SESSION_SECRET ?? "";
  const user = secret ? verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value, secret) : null;
  const path = req.nextUrl.pathname;
  const area = path.startsWith("/console") ? "analista" : "funcionario";

  if (!user) return NextResponse.redirect(new URL("/", req.url));
  if (user.role !== area) return NextResponse.redirect(new URL(user.role === "analista" ? "/console" : "/chat", req.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/chat/:path*", "/console/:path*"],
};
