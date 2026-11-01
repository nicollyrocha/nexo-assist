/**
 * Simula o sistema de chamados legado, que "de vez em quando fica indisponível por alguns segundos".
 * Cada requisição tem `failureRate` de chance de derrubar o serviço por `outageMs`; durante a queda,
 * todas as requisições recebem 503. Relógio e sorteio são injetáveis para testes determinísticos.
 */
export class LegacySimulator {
  private outageUntil = 0;

  constructor(
    private readonly failureRate: number,
    private readonly outageMs: number,
    private readonly random: () => number = Math.random,
    private readonly now: () => number = Date.now,
  ) {}

  /** Retorna os milissegundos restantes de queda, ou 0 se o serviço está de pé. */
  check(): number {
    const now = this.now();
    if (now < this.outageUntil) return this.outageUntil - now;
    if (this.failureRate > 0 && this.random() < this.failureRate) {
      this.outageUntil = now + this.outageMs;
      return this.outageMs;
    }
    return 0;
  }
}
