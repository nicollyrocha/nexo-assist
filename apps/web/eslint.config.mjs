import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Fronteira interface/servidor: componentes e lib/ rodam (ou podem rodar) no navegador e só falam com
  // as rotas via lib/api.ts e os contratos de @nexo/shared. Banco, agent, legado e sessão ficam em server/.
  {
    files: ["src/components/**", "src/lib/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["@/server", "@/server/*", "**/server/*"], message: "Código de servidor: use lib/api.ts e as rotas." },
            { group: ["@nexo/db", "@nexo/agent", "@nexo/tickets-client"], message: "Só o servidor acessa banco, agent e legado." },
          ],
          paths: [{ name: "next/headers", message: "Cookies e headers só no servidor." }],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
