import prismaInternals from "@prisma/internals";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { nanoid } from "nanoid";
import {
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync,
  renameSync,
} from "node:fs";
import { spawn } from "node:child_process";
import type { DMMFData } from "../types.js";
import { getQueriesDb } from "./queries-db.js";

const { getDMMF, getGenerators } = prismaInternals;
const require = createRequire(import.meta.url);

// Get package root from env or calculate
const packageRoot = process.env.PRISMA_QUERY_BUILDER_PACKAGE_ROOT 
  || resolve(new URL('.', import.meta.url).pathname, "../../..");

// User data in CWD (persists across npm installs)
const workspacesDir = resolve(process.cwd(), ".workspaces");

const MAX_CACHED_CLIENTS = parseInt(process.env.MAX_CACHED_CLIENTS ?? "50");
const CLIENT_IDLE_TIMEOUT = parseInt(
  process.env.CLIENT_IDLE_TIMEOUT ?? "300000",
);

type Workspace = {
  id: string;
  name: string;
  schemaContent: string;
  databaseUrl: string | null;
  provider: string;
  createdAt: Date;
};

type CachedClient = {
  client: any;
  lastUsed: number;
  activeQueries: number;
  disconnecting: boolean;
};

const clientCache = new Map<string, CachedClient>();
const clientLocks = new Map<string, Promise<any>>();

let cleanupInterval: NodeJS.Timeout | null = null;

function extractProviderFromSchema(schemaContent: string): string {
  const match = schemaContent.match(
    /datasource\s+\w+\s*\{[^}]*provider\s*=\s*"([^"]+)"[^}]*\}/s,
  );
  if (match) {
    const provider = match[1].toLowerCase();
    if (provider === "postgres" || provider === "postgresql")
      return "postgresql";
    if (provider === "mysql") return "mysql";
    if (provider === "sqlite") return "sqlite";
    if (provider === "sqlserver") return "sqlserver";
    if (provider === "mongodb") return "mongodb";
    return provider;
  }
  return "postgresql";
}

function extractProviderFromUrl(url: string): string {
  const protocol = url.split("://")[0].toLowerCase();
  if (protocol === "postgres" || protocol === "postgresql") return "postgresql";
  if (protocol === "mysql") return "mysql";
  if (protocol === "file" || protocol === "sqlite") return "sqlite";
  if (protocol === "sqlserver") return "sqlserver";
  if (protocol === "mongodb") return "mongodb";
  return protocol;
}

function parseMysqlUrl(url: string): {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
} {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parsed.port ? parseInt(parsed.port, 10) : 3306,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, ""),
  };
}

function getWorkspaceDir(workspaceId: string): string {
  if (!/^[a-zA-Z0-9_-]{12,16}$/.test(workspaceId)) {
    throw new Error("Invalid workspace ID format");
  }
  return join(workspacesDir, workspaceId);
}

function ensureWorkspacesDir(): void {
  if (!existsSync(workspacesDir)) {
    mkdirSync(workspacesDir, { recursive: true });
  }
}

function transformSchemaForPrisma7(
  schemaContent: string,
  outputPath: string,
): string {
  let result = schemaContent;

  const provider = extractProviderFromSchema(schemaContent);

  result = result.replace(/datasource\s+\w+\s*\{[\s\S]*?\}\s*/g, "");
  result = result.replace(/generator\s+\w+\s*\{[\s\S]*?\}\s*/g, "");
  result = result.replace(/\n{3,}/g, "\n\n").trim();

  const sqlOutputPath = join(dirname(outputPath), "sql");

  const header = `datasource db {
  provider = "${provider}"
}

generator client {
  provider = "prisma-client"
  output   = "${outputPath.replace(/\\/g, "/")}"
}

generator sql {
  provider = "prisma-sql-generator"
  output   = "${sqlOutputPath.replace(/\\/g, "/")}"
}

`;

  return header + result;
}

async function generateWorkspaceClient(
  workspaceId: string,
  schemaContent: string,
): Promise<void> {
  const workspaceDir = getWorkspaceDir(workspaceId);

  try {
    ensureWorkspacesDir();

    const prismaDir = join(workspaceDir, "prisma");
    const schemaPath = join(prismaDir, "schema.prisma");
    const outputPath = join(workspaceDir, "generated", "client");

    mkdirSync(prismaDir, { recursive: true });

    const transformedSchema = transformSchemaForPrisma7(
      schemaContent,
      outputPath,
    );

    const tempPath = `${schemaPath}.${Date.now()}.tmp`;
    writeFileSync(tempPath, transformedSchema, "utf-8");
    renameSync(tempPath, schemaPath);

    const packageNodeModules = join(packageRoot, "node_modules");
    const generatorPath = join(
      packageNodeModules,
      "@prisma",
      "client",
      "generator-build",
      "index.js",
    );

    if (!existsSync(generatorPath)) {
      throw new Error(
        `Generator not found at ${generatorPath}. Make sure @prisma/client is installed.`,
      );
    }

    const generators = await getGenerators({
      schemaPath,
      printDownloadProgress: false,
      registry: {
        "prisma-client": {
          type: "rpc",
          generatorPath,
          isNode: true,
        },
      },
    });

    for (const generator of generators) {
      await generator.generate();
      generator.stop();
    }
  } catch (error) {
    if (existsSync(workspaceDir)) {
      rmSync(workspaceDir, { recursive: true, force: true });
    }
    throw new Error(
      `Failed to generate Prisma Client: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function clearRequireCache(clientPath: string): void {
  const resolvedPaths = Object.keys(require.cache).filter(
    (key) => key.startsWith(clientPath) || key.includes(clientPath),
  );
  for (const path of resolvedPaths) {
    delete require.cache[path];
  }
}

async function createAdapterForProvider(
  provider: string,
  databaseUrl: string,
): Promise<any> {
  switch (provider) {
    case "postgresql": {
      const { PrismaPg } = await import("@prisma/adapter-pg");
      return new PrismaPg({
        connectionString: databaseUrl,
      });
    }
    case "mysql": {
      const { PrismaMariaDb } = await import("@prisma/adapter-mariadb");
      const config = parseMysqlUrl(databaseUrl);
      return new PrismaMariaDb({
        host: config.host,
        port: config.port,
        user: config.user,
        password: config.password,
        database: config.database,
        connectionLimit: 5,
      });
    }
    case "sqlite": {
      const { PrismaBetterSqlite3 } = await import(
        "@prisma/adapter-better-sqlite3"
      );
      return new PrismaBetterSqlite3({ url: databaseUrl });
    }
    default:
      throw new Error(
        `Unsupported database provider: ${provider}. Supported: postgresql, mysql, sqlite`,
      );
  }
}

async function syncDatabaseSchema(
  workspaceId: string,
  databaseUrl: string,
): Promise<void> {
  const workspaceDir = getWorkspaceDir(workspaceId);
  const isWindows = process.platform === "win32";
  const packageNodeModules = join(packageRoot, "node_modules");
  const prismaBin = join(
    packageNodeModules,
    ".bin",
    isWindows ? "prisma.cmd" : "prisma",
  );

  if (!existsSync(prismaBin)) {
    throw new Error(`Prisma CLI not found at ${prismaBin}`);
  }

  return new Promise((resolve, reject) => {
    const args = ["db", "push", "--url", databaseUrl];

    const child = spawn(prismaBin, args, {
      cwd: workspaceDir,
      stdio: "pipe",
      env: {
        ...process.env,
        PRISMA_HIDE_UPDATE_MESSAGE: "true",
      },
      detached: false,
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    const cleanup = () => {
      if (!child.killed) child.kill();
    };

    process.once("exit", cleanup);

    child.on("close", (code) => {
      process.off("exit", cleanup);
      if (code === 0) resolve();
      else
        reject(
          new Error(`Failed to sync database schema: ${stderr || stdout}`),
        );
    });

    child.on("error", (error) => {
      process.off("exit", cleanup);
      reject(error);
    });
  });
}

async function evictLeastRecentlyUsedClient(): Promise<void> {
  const entries = [...clientCache.entries()];
  if (entries.length === 0) return;

  const candidate = entries
    .filter(([_, entry]) => entry.activeQueries === 0 && !entry.disconnecting)
    .sort((a, b) => a[1].lastUsed - b[1].lastUsed)[0];

  if (!candidate) return;

  const [lruId, lruEntry] = candidate;
  lruEntry.disconnecting = true;

  try {
    await lruEntry.client.$disconnect();
  } catch {}

  clientCache.delete(lruId);
}

function cleanSchemaForPrisma7(schemaContent: string): string {
  let cleaned = schemaContent.replace(
    /(datasource\s+\w+\s*\{[^}]*?)(?:url|directUrl)\s*=\s*[^\n]+\n/g,
    "$1",
  );

  cleaned = cleaned.replace(
    /generator\s+\w+\s*\{\s*provider\s*=\s*"prisma-client-js"/g,
    'generator client {\n  provider = "prisma-client"',
  );

  return cleaned;
}

export async function createWorkspace(
  name: string,
  schemaContent: string,
  databaseUrl: string | null,
): Promise<Workspace> {
  const id = nanoid(12);
  const provider = extractProviderFromSchema(schemaContent);

  if (databaseUrl) {
    const urlProvider = extractProviderFromUrl(databaseUrl);
    if (provider !== urlProvider) {
      throw new Error(
        `Schema provider (${provider}) doesn't match database URL provider (${urlProvider})`,
      );
    }
  }

  const cleanedSchema = cleanSchemaForPrisma7(schemaContent);

  await generateWorkspaceClient(id, cleanedSchema);

  if (databaseUrl) {
    try {
      await syncDatabaseSchema(id, databaseUrl);
    } catch (error) {
      const workspaceDir = getWorkspaceDir(id);
      if (existsSync(workspaceDir)) {
        rmSync(workspaceDir, { recursive: true, force: true });
      }
      throw error;
    }
  }

  const queriesDb = await getQueriesDb();
  const workspace = await queriesDb.workspace.create({
    data: {
      id,
      name,
      schemaContent: cleanedSchema,
      databaseUrl,
      provider,
    },
  });

  return {
    id: workspace.id,
    name: workspace.name,
    schemaContent: workspace.schemaContent,
    databaseUrl: workspace.databaseUrl ?? null,
    provider: workspace.provider,
    createdAt: workspace.createdAt,
  };
}

export async function getWorkspaceById(id: string): Promise<Workspace | null> {
  const queriesDb = await getQueriesDb();
  const workspace = await queriesDb.workspace.findUnique({ where: { id } });
  if (!workspace) return null;

  return {
    id: workspace.id,
    name: workspace.name,
    schemaContent: workspace.schemaContent,
    databaseUrl: workspace.databaseUrl ?? null,
    provider: workspace.provider,
    createdAt: workspace.createdAt,
  };
}

export async function getWorkspaceDmmf(workspaceId: string): Promise<DMMFData> {
  const workspace = await getWorkspaceById(workspaceId);
  if (!workspace) throw new Error(`Workspace ${workspaceId} not found`);

  const transformedSchema = transformSchemaForValidation(workspace.schemaContent);

  const dmmf = await getDMMF({ datamodel: transformedSchema } as any);

  const result: DMMFData = {
    datamodel: dmmf.datamodel as unknown as DMMFData["datamodel"],
    schema: dmmf.schema as unknown as DMMFData["schema"],
    mappings: dmmf.mappings as unknown as DMMFData["mappings"],
  };

  return result;
}

export function transformSchemaForValidation(schemaContent: string): string {
  let result = schemaContent;

  const providerMatch = schemaContent.match(
    /datasource\s+\w+\s*\{[\s\S]*?provider\s*=\s*"([^"]+)"[\s\S]*?\}/,
  );
  const provider = providerMatch
    ? providerMatch[1].toLowerCase()
    : "postgresql";

  result = result.replace(/datasource\s+\w+\s*\{[\s\S]*?\}\s*/g, "");
  result = result.replace(/generator\s+\w+\s*\{[\s\S]*?\}\s*/g, "");
  result = result.replace(/\n{3,}/g, "\n\n").trim();

  const header = `datasource db {
  provider = "${provider}"
}

generator client {
  provider = "prisma-client"
}

`;

  return header + result;
}

async function _getWorkspaceClientImpl(
  workspaceId: string,
  usePrismaSql = false,
): Promise<any> {
  const entry = clientCache.get(workspaceId);

  if (entry && !entry.disconnecting) {
    const updated = { ...entry, lastUsed: Date.now() };
    clientCache.set(workspaceId, updated);
    return updated.client;
  }

  const workspace = await getWorkspaceById(workspaceId);
  if (!workspace) throw new Error(`Workspace ${workspaceId} not found`);

  const databaseUrl = workspace.databaseUrl;
  if (!databaseUrl)
    throw new Error(
      "Workspace has no databaseUrl. Add one to execute queries.",
    );

  if (clientCache.size >= MAX_CACHED_CLIENTS) {
    await evictLeastRecentlyUsedClient();
  }

  const workspaceDir = getWorkspaceDir(workspaceId);
  const clientPath = join(workspaceDir, "generated", "client");
  const sqlPath = join(workspaceDir, "generated", "sql");

  if (!existsSync(clientPath)) {
    await generateWorkspaceClient(workspaceId, workspace.schemaContent);
  }

  clearRequireCache(clientPath);
  clearRequireCache(sqlPath);

  const possibleEntries = [
    join(clientPath, "index.js"),
    join(clientPath, "client.js"),
    join(clientPath, "default.js"),
  ];

  let clientModule: any = null;
  let lastError: Error | null = null;

  for (const entryPath of possibleEntries) {
    try {
      const workspaceRequire = createRequire(import.meta.url);
      clientModule = workspaceRequire(entryPath);
      break;
    } catch (err: any) {
      if (err.code === "MODULE_NOT_FOUND") {
        lastError = err;
        continue;
      }
      throw err;
    }
  }

  if (!clientModule) {
    throw new Error(
      `Generated Prisma Client not found in ${clientPath}. Last error: ${lastError?.message}`,
    );
  }

  const ClientClass =
    clientModule.PrismaClient ?? clientModule.default?.PrismaClient;

  if (!ClientClass) {
    const available = Object.keys(clientModule).join(", ");
    throw new Error(
      `PrismaClient not found in generated client. Available exports: ${available}`,
    );
  }

  const adapter = await createAdapterForProvider(
    workspace.provider,
    databaseUrl,
  );
  let client = new ClientClass({ adapter, log: ["query", "error", "warn"] });

  if (
    usePrismaSql &&
    (workspace.provider === "postgresql" || workspace.provider === "sqlite")
  ) {
    try {
      const sqlIndexPath = join(sqlPath, "index.js");
      if (existsSync(sqlIndexPath)) {
        const workspaceRequire = createRequire(import.meta.url);
        const sqlModule = workspaceRequire(sqlIndexPath);
        const speedExtension =
          sqlModule.speedExtension ?? sqlModule.default?.speedExtension;

        if (speedExtension) {
          if (workspace.provider === "postgresql") {
            const postgres = (await import("postgres")).default;
            const sql = postgres(databaseUrl);
            client = client.$extends(speedExtension({ postgres: sql }));
            console.log(
              "[workspace-manager] Using prisma-sql extension for PostgreSQL",
            );
          } else if (workspace.provider === "sqlite") {
            const Database = (await import("better-sqlite3")).default;
            const dbPath = databaseUrl.replace("file:", "");
            const db = new Database(dbPath);
            client = client.$extends(speedExtension({ sqlite: db }));
            console.log(
              "[workspace-manager] Using prisma-sql extension for SQLite",
            );
          }
        } else {
          console.warn(
            "[workspace-manager] speedExtension not found in generated SQL",
          );
        }
      } else {
        console.warn(
          "[workspace-manager] SQL extension not generated, using standard client",
        );
      }
    } catch (error) {
      console.warn(
        "[workspace-manager] Failed to load prisma-sql extension:",
        error,
      );
    }
  }

  try {
    await client.$connect();
  } catch (error) {
    await client.$disconnect().catch(() => {});
    throw error;
  }

  const newEntry: CachedClient = {
    client,
    lastUsed: Date.now(),
    activeQueries: 0,
    disconnecting: false,
  };

  clientCache.set(workspaceId, newEntry);

  return client;
}

export async function getWorkspaceClient(
  workspaceId: string,
  usePrismaSql = false,
): Promise<any> {
  const existing = clientLocks.get(workspaceId);
  if (existing) return existing;

  const promise = _getWorkspaceClientImpl(workspaceId, usePrismaSql);
  clientLocks.set(workspaceId, promise);

  try {
    return await promise;
  } finally {
    clientLocks.delete(workspaceId);
  }
}

export async function incrementActiveQueries(
  workspaceId: string,
): Promise<void> {
  const entry = clientCache.get(workspaceId);
  if (entry) entry.activeQueries++;
}

export async function decrementActiveQueries(
  workspaceId: string,
): Promise<void> {
  const entry = clientCache.get(workspaceId);
  if (entry && entry.activeQueries > 0) entry.activeQueries--;
}

export async function deleteWorkspace(workspaceId: string): Promise<boolean> {
  const entry = clientCache.get(workspaceId);

  if (entry) {
    if (entry.activeQueries > 0) {
      throw new Error("Cannot delete workspace with active queries");
    }

    entry.disconnecting = true;
    await entry.client.$disconnect().catch(() => {});
    clientCache.delete(workspaceId);
  }

  const workspaceDir = getWorkspaceDir(workspaceId);
  const clientPath = join(workspaceDir, "generated", "client");

  clearRequireCache(clientPath);

  if (existsSync(workspaceDir)) {
    rmSync(workspaceDir, { recursive: true, force: true });
  }

  try {
    const queriesDb = await getQueriesDb();
    await queriesDb.workspace.delete({ where: { id: workspaceId } });
    return true;
  } catch {
    return false;
  }
}

export function clearWorkspaceCache(workspaceId: string): void {
  const entry = clientCache.get(workspaceId);
  if (entry && !entry.disconnecting) {
    entry.disconnecting = true;
    entry.client.$disconnect().catch(() => {});
    clientCache.delete(workspaceId);
  }

  const workspaceDir = getWorkspaceDir(workspaceId);
  const clientPath = join(workspaceDir, "generated", "client");
  clearRequireCache(clientPath);
}

export async function listWorkspaces(): Promise<
  Array<{ id: string; name: string; createdAt: Date }>
> {
  const queriesDb = await getQueriesDb();
  return queriesDb.workspace.findMany({
    select: { id: true, name: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
}

async function cleanupIdleClients(): Promise<void> {
  const now = Date.now();
  const toRemove: string[] = [];

  for (const [id, entry] of clientCache.entries()) {
    if (
      entry.activeQueries === 0 &&
      !entry.disconnecting &&
      now - entry.lastUsed > CLIENT_IDLE_TIMEOUT
    ) {
      toRemove.push(id);
    }
  }

  for (const id of toRemove) {
    const entry = clientCache.get(id);
    if (entry) {
      entry.disconnecting = true;
      await entry.client.$disconnect().catch(() => {});
      clientCache.delete(id);
    }
  }
}

export function startCleanup(): void {
  if (!cleanupInterval) {
    cleanupInterval = setInterval(() => cleanupIdleClients(), 60000);
  }
}

export function stopCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}

startCleanup();

if (import.meta.hot) {
  import.meta.hot.dispose(async () => {
    stopCleanup();

    for (const [id, entry] of clientCache.entries()) {
      entry.disconnecting = true;
      await entry.client.$disconnect().catch(() => {});
    }

    clientCache.clear();
    clientLocks.clear();
  });
}