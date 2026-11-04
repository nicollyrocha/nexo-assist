import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "./server/session-token";

/**
 * Checagem otimista de acesso às telas (Next 16: "proxy", antigo middleware).
 * Só confere a assinatura e o papel do cookie, sem banco: /chat e /perfil são de funcionário, /console de
 * analista; sem sessão → login (/). A autorização de verdade acontece em cada Route Handler
 * (requireEmployee/requireAnalyst) e em getSessionUser(), que também consultam a sessão no banco.
 */
export function proxy(req: NextRequest) {
  const secret = process.env.SESSION_SECRET ?? "";
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const user = secret ? verifySessionToken(token, secret) : null;
  const path = req.nextUrl.pathname;
  const area = path.startsWith("/console") ? "analista" : "funcionario";

  // Havia cookie, mas inválido ou vencido: o login mostra o aviso de sessão expirada, como nas páginas.
  if (!user) return NextResponse.redirect(new URL(token ? "/?motivo=sessao" : "/", req.url));
  if (user.role !== area) return NextResponse.redirect(new URL(user.role === "analista" ? "/console" : "/chat", req.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/chat/:path*", "/perfil/:path*", "/console/:path*"],
};
