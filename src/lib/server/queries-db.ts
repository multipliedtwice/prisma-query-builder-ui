import { resolve } from "node:path";
import { PrismaClient } from "../../../generated/queries-client/client.js";

const GLOBAL_KEY = "__prisma_query_builder_queries_db__";
const INIT_KEY = "__prisma_query_builder_queries_db_init__";

type GlobalWithDb = typeof globalThis & {
  [GLOBAL_KEY]?: any;
  [INIT_KEY]?: Promise<void>;
};

const g = globalThis as GlobalWithDb;

async function ensureInitialized(): Promise<void> {
  if (!g[INIT_KEY]) {
    const { ensureQueriesDb } = await import("./init-queries-db.js");
    g[INIT_KEY] = ensureQueriesDb();
  }
  await g[INIT_KEY];
}

async function createQueriesClient(): Promise<any> {
  await ensureInitialized();

  const { PrismaBetterSqlite3 } = await import("@prisma/adapter-better-sqlite3");

  const queriesDbPath = resolve(process.cwd(), "queries.db");
  const adapter = new PrismaBetterSqlite3({ url: `file:${queriesDbPath}` });

  return new PrismaClient({ adapter } as any);
}

let clientPromise: Promise<any> | null = null;

export async function getQueriesDb(): Promise<any> {
  if (g[GLOBAL_KEY]) return g[GLOBAL_KEY];

  if (!clientPromise) {
    clientPromise = createQueriesClient().then(
      (client) => {
        g[GLOBAL_KEY] = client;
        return client;
      },
      (error) => {
        clientPromise = null;
        throw error;
      }
    );
  }

  return clientPromise;
}