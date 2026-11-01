import { neon } from "@neondatabase/serverless";

// Confere a conexão com o Neon sem imprimir a connection string.
for (const name of ["DATABASE_URL", "DATABASE_URL_UNPOOLED"] as const) {
  const url = process.env[name];
  if (!url) {
    console.error(`✗ ${name} vazio em apps/web/.env.local`);
    process.exitCode = 1;
    continue;
  }
  const [row] = await neon(url)`select current_database() as db,
    (select count(*) from information_schema.tables where table_schema = 'public')::int as tables`;
  console.log(`✓ ${name}: banco ${row?.db}, ${row?.tables} tabelas`);
}
