/** Fallback estático enquanto a sessão é lida (entra no static shell). */
export function AppShellSkeleton({ variant }: { variant: "chat" | "console" }) {
  return (
    <div aria-busy="true" aria-label="Carregando" className="flex h-dvh overflow-clip bg-surface">
      {variant === "chat" ? (
        <div className="hidden shrink-0 border-r border-border-subtle md:block md:w-16 lg:w-sidebar" />
      ) : (
        <>
          <div className="hidden w-rail shrink-0 border-r border-border-subtle bg-surface-subtle md:block" />
          <div className="hidden w-conv-list shrink-0 border-r border-border-subtle md:block" />
        </>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="h-14 shrink-0 border-b border-border-subtle md:h-topbar" />
        <div className={`flex-1 ${variant === "console" ? "bg-surface-thread" : ""}`} />
      </div>
    </div>
  );
}
