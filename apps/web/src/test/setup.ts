// Setup compartilhado: matchers do jest-dom (inofensivos em node) e limpeza do DOM nos testes jsdom.
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";

if (typeof window !== "undefined") {
  const { cleanup } = await import("@testing-library/react");
  afterEach(() => cleanup());
}
