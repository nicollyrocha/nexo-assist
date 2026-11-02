import { BrandMark } from "@/components/ui/brand-mark";

const STATS = [
  { value: "1 h", label: "prazo para casos críticos" },
  { value: "4 h úteis", label: "resposta para prioridade alta" },
  { value: "Seg–sex, 8h–18h", label: "horário do service desk" },
];

/** Painel de apresentação do login (Tela 1). Texto legível; o preview de conversa é ilustração. */
export function Showcase() {
  return (
    <aside className="hidden w-1/2 shrink-0 flex-col justify-between bg-ink px-12 pt-10 pb-12 lg:flex 2xl:w-showcase 2xl:px-16">
      <div className="flex items-center gap-2.5">
        <BrandMark className="h-5 w-6 fill-white" />
        <span className="text-[17px] font-bold tracking-[-0.2px] text-white">Nexo Assist</span>
      </div>

      <div className="flex flex-col gap-9">
        <div className="flex flex-col gap-4.5">
          <p className="text-ui font-medium text-white/55">Service desk de TI da Nexo</p>
          <h2 className="font-serif text-[44px]/12 font-normal text-white 2xl:text-display">
            Seu problema de TI, resolvido em uma conversa.
          </h2>
          <p className="max-w-[520px] text-lead text-white/65">
            Descreva o que está acontecendo. O assistente consulta seus chamados, busca na central de ajuda e chama um analista quando precisa.
          </p>
        </div>

        <div aria-hidden="true" className="2xl:pl-24">
          <div className="flex w-full max-w-[500px] flex-col gap-2.5 rounded-card bg-white/4 p-4.5 outline-1 -outline-offset-1 outline-white/8">
            <div className="self-end rounded-bubble rounded-br-tail bg-white px-3.5 py-2.25 text-ui text-ink">
              Meu notebook não conecta na VPN. Erro 809.
            </div>
            <div className="flex flex-col items-start gap-1.5">
              <p className="flex flex-wrap gap-x-1.5 text-meta">
                <span className="font-semibold text-white/80">Nexo Assist</span>
                <span className="text-white/45">consultou seus chamados · montou o rascunho</span>
              </p>
              <div className="max-w-[380px] rounded-bubble rounded-tl-tail bg-white/8 px-3.5 py-2.5 text-ui text-white">
                Montei o chamado com prioridade alta. Confira e confirme para eu criar.
              </div>
              <div className="flex items-center gap-2 rounded-bubble bg-white px-3 py-1.75">
                <span className="size-1.75 rounded-full bg-prioridade-alta" />
                <span className="text-meta font-semibold text-ink">Rascunho</span>
                <span className="text-meta text-muted">Rede e VPN · Alta · resposta em até 4 h úteis</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <dl className="flex border-t border-white/10 pt-6">
        {STATS.map((s, i) => (
          <div key={s.label} className={`flex flex-1 flex-col-reverse gap-1.5 ${i > 0 ? "border-l border-white/10 pl-6" : ""}`}>
            <dt className="text-ui text-white/55">{s.label}</dt>
            <dd className="font-serif text-[28px] tracking-[-0.6px] whitespace-nowrap text-white 2xl:text-stat">{s.value}</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}
