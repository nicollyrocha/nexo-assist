import { productionDeps } from "@/server/deps";
import { createHandler } from "@/server/router";

const handle = createHandler(productionDeps);

export const GET = handle;
export const POST = handle;
