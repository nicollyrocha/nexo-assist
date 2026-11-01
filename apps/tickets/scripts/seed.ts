import { createTicketsDb } from "../src/db/client";
import { seed } from "../src/db/seed";

const url = process.env.TICKETS_DATABASE_URL_UNPOOLED;
if (!url) throw new Error("Defina TICKETS_DATABASE_URL_UNPOOLED em apps/tickets/.env.local");

const data = await seed(createTicketsDb(url));
console.log(
  `Seed ok: ${data.employees.length} funcionários, ${data.tickets.length} chamados, ${data.articles.length} artigos.`,
);
