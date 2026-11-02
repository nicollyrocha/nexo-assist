// Cria apps/web/.env.local e apps/tickets/.env.local a partir do modelo, com segredos aleatórios.
// Nunca sobrescreve um arquivo existente e nunca imprime valores. As URLs do Neon ficam em branco
// para você colar. Uso: node scripts/setup-env.mjs
import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const secret = () => randomBytes(32).toString("base64url");
const serviceKey = secret(); // compartilhada: o app web se autentica no serviço de chamados com ela

const files = {
  "apps/web/.env.local": `# Banco da aplicação (Neon, banco nexo_app)
DATABASE_URL=
DATABASE_URL_UNPOOLED=

# LLM do agent (Mastra, formato provedor/modelo). Padrão gratuito: Gemini do Google AI Studio.
AGENT_MODEL=google/gemini-3.6-flash,google/gemini-3.5-flash,google/gemini-3.5-flash-lite,google/gemini-3.1-flash-lite
GOOGLE_GENERATIVE_AI_API_KEY=
SESSION_SECRET=${secret()}

TICKETS_SERVICE_URL=http://localhost:3001
TICKETS_SERVICE_KEY=${serviceKey}
`,
  "apps/tickets/.env.local": `# Banco do serviço de chamados (Neon, banco nexo_tickets)
TICKETS_DATABASE_URL=
TICKETS_DATABASE_URL_UNPOOLED=

TICKETS_SERVICE_KEY=${serviceKey}

# Simulação do legado instável (0 desliga)
TICKETS_FAILURE_RATE=0.1
TICKETS_OUTAGE_MS=3000
`,
};

if (Object.keys(files).some((path) => existsSync(root + path))) {
  console.log("Já existe ao menos um .env.local; nada foi alterado para não desencontrar a TICKETS_SERVICE_KEY.");
  console.log("Apague os dois e rode de novo se quiser recriar.");
  process.exit(0);
}

for (const [path, content] of Object.entries(files)) {
  writeFileSync(root + path, content, { flag: "wx" });
  console.log(`criado ${path}`);
}
console.log("Agora cole as connection strings do Neon nos campos em branco.");
