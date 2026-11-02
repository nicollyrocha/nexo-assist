import type { SessionUser } from "@nexo/shared";

/** O que as telas do cliente precisam saber de quem está logado (sem ids de sessão). */
export type Viewer = Pick<SessionUser, "userId" | "name" | "email" | "detail" | "role">;

export const toViewer = (u: SessionUser): Viewer => ({
  userId: u.userId,
  name: u.name,
  email: u.email,
  detail: u.detail,
  role: u.role,
});
