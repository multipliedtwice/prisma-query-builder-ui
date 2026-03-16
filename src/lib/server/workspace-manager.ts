import prismaInternals from "@prisma/internals";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { createRequire } from "node:module";
import { nanoid } from "nanoid";
import {
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync,
  renameSync
} from "node:fs";
import { spawn } from "node:child_process";
import type { DMMFData } from "../types.js";
import { getQueriesDb } from "./queries-db.js";
import {
  extractProviderFromSchema,
  extractProviderFromUrl,
  isSupportedProvider,
  buildSchemaWithGenerators,
  buildValidationSchema,
  cleanSchemaForPrisma7,
  createAdapterForProvider,
  closeExternalResource
} from "./database-utils.js";
import { debug, debugWarn } from "./debug.js";

const { getDMMF, getGenerators } = prismaInternals;
const require = createRequire(import.meta.url);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const packageRoot =
  process.env.PRISMA_QUERY_BUILDER_PACKAGE_ROOT ||
  resolve(__dirname, "../../..");

const workspacesDir = resolve(process.cwd(), ".workspaces");

const MAX_CACHED_CLIENTS = parseInt(process.env.MAX_CACHED_CLIENTS ?? "50");
const CLIENT_IDLE_TIMEOUT = parseInt(
  process.env.CLIENT_IDLE_TIMEOUT ?? "300000"
);

export type Workspace = {
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
  usePrismaSql: boolean;
  externalResource: any | null;
};

const clientCache = new Map<string, CachedClient>();
const clientLocks = new Map<string, Promise<any>>();
const dmmfCache = new Map<string, DMMFData>();

let cleanupInterval: NodeJS.Timeout | null = null;
let cleanupStarted = false;

function cacheKey(workspaceId: string, usePrismaSql: boolean): string {
  return `${workspaceId}:${usePrismaSql ? "1" : "0"}`;
}

function getCacheEntriesForWorkspace(
  workspaceId: string
): [string, CachedClient][] {
  return [...clientCache.entries()].filter(([key]) =>
    key.startsWith(`${workspaceId}:`)
  );
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

async function closeClientEntry(entry: CachedClient): Promise<void> {
  entry.disconnecting = true;
  await entry.client.$disconnect().catch(() => {});
  await closeExternalResource(entry.externalResource);
}

async function generateWorkspaceClient(
  workspaceId: string,
  schemaContent: string
): Promise<void> {
  const workspaceDir = getWorkspaceDir(workspaceId);

  try {
    ensureWorkspacesDir();

    const prismaDir = join(workspaceDir, "prisma");
    const schemaPath = join(prismaDir, "schema.prisma");
    const outputPath = join(workspaceDir, "generated", "client");
    const sqlOutputPath = join(workspaceDir, "generated", "sql");

    mkdirSync(prismaDir, { recursive: true });

    const transformedSchema = buildSchemaWithGenerators(
      schemaContent,
      outputPath,
      sqlOutputPath
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
      "index.js"
    );

    if (!existsSync(generatorPath)) {
      throw new Error(
        `Generator not found at ${generatorPath}. Make sure @prisma/client is installed.`
      );
    }

    const generators = await getGenerators({
      schemaPath,
      printDownloadProgress: false,
      registry: {
        "prisma-client": {
          type: "rpc",
          generatorPath,
          isNode: true
        }
      }
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
      `Failed to generate Prisma Client: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

function clearRequireCache(clientPath: string): void {
  const resolvedPaths = Object.keys(require.cache).filter((key) =>
    key.startsWith(clientPath)
  );
  for (const path of resolvedPaths) {
    delete require.cache[path];
  }
}

async function syncDatabaseSchema(
  workspaceId: string,
  databaseUrl: string
): Promise<void> {
  const workspaceDir = getWorkspaceDir(workspaceId);
  const isWindows = process.platform === "win32";
  const packageNodeModules = join(packageRoot, "node_modules");
  const prismaBin = join(
    packageNodeModules,
    ".bin",
    isWindows ? "prisma.cmd" : "prisma"
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
        PRISMA_HIDE_UPDATE_MESSAGE: "true"
      },
      detached: false
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
          new Error(`Failed to sync database schema: ${stderr || stdout}`)
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

  const [lruKey, lruEntry] = candidate;
  await closeClientEntry(lruEntry);
  clientCache.delete(lruKey);
}

export async function createWorkspace(
  name: string,
  schemaContent: string,
  databaseUrl: string | null
): Promise<Workspace> {
  const id = nanoid(12);
  const provider = extractProviderFromSchema(schemaContent);

  if (!isSupportedProvider(provider)) {
    throw new Error(
      `Unsupported database provider: ${provider}. Supported: postgresql, mysql, sqlite`
    );
  }

  if (databaseUrl) {
    const urlProvider = extractProviderFromUrl(databaseUrl);
    if (provider !== urlProvider) {
      throw new Error(
        `Schema provider (${provider}) doesn't match database URL provider (${urlProvider})`
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
      provider
    }
  });

  return {
    id: workspace.id,
    name: workspace.name,
    schemaContent: workspace.schemaContent,
    databaseUrl: workspace.databaseUrl ?? null,
    provider: workspace.provider,
    createdAt: workspace.createdAt
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
    createdAt: workspace.createdAt
  };
}

export async function getWorkspaceDmmf(
  workspaceId: string,
  workspace?: Workspace
): Promise<DMMFData> {
  const cached = dmmfCache.get(workspaceId);
  if (cached) return cached;

  const ws = workspace ?? (await getWorkspaceById(workspaceId));
  if (!ws) throw new Error(`Workspace ${workspaceId} not found`);

  const transformedSchema = buildValidationSchema(ws.schemaContent);
  const dmmf = await getDMMF({ datamodel: transformedSchema } as any);

  const result: DMMFData = {
    datamodel: dmmf.datamodel as unknown as DMMFData["datamodel"],
    schema: dmmf.schema as unknown as DMMFData["schema"],
    mappings: dmmf.mappings as unknown as DMMFData["mappings"]
  };

  dmmfCache.set(workspaceId, result);
  return result;
}

export { buildValidationSchema as transformSchemaForValidation } from "./database-utils.js";

async function _getWorkspaceClientImpl(
  workspaceId: string,
  usePrismaSql = false
): Promise<any> {
  const key = cacheKey(workspaceId, usePrismaSql);
  const entry = clientCache.get(key);

  if (entry && !entry.disconnecting) {
    entry.lastUsed = Date.now();
    return entry.client;
  }

  const workspace = await getWorkspaceById(workspaceId);
  if (!workspace) throw new Error(`Workspace ${workspaceId} not found`);

  const databaseUrl = workspace.databaseUrl;
  if (!databaseUrl)
    throw new Error(
      "Workspace has no databaseUrl. Add one to execute queries."
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
    join(clientPath, "default.js")
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
      `Generated Prisma Client not found in ${clientPath}. Last error: ${lastError?.message}`
    );
  }

  const ClientClass =
    clientModule.PrismaClient ?? clientModule.default?.PrismaClient;

  if (!ClientClass) {
    const available = Object.keys(clientModule).join(", ");
    throw new Error(
      `PrismaClient not found in generated client. Available exports: ${available}`
    );
  }

  const adapter = await createAdapterForProvider(
    workspace.provider,
    databaseUrl
  );
  let client = new ClientClass({ adapter });
  let externalResource: any | null = null;

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
            externalResource = sql;
            client = client.$extends(speedExtension({ postgres: sql }));
          } else if (workspace.provider === "sqlite") {
            const Database = (await import("better-sqlite3")).default;
            const dbPath = databaseUrl.replace("file:", "");
            const db = new Database(dbPath);
            externalResource = db;
            client = client.$extends(speedExtension({ sqlite: db }));
          }
          debug(
            "workspace-manager",
            "Applied prisma-sql extension for",
            workspace.provider
          );
        }
      }
    } catch (error) {
      debugWarn(
        "workspace-manager",
        "Failed to load prisma-sql extension:",
        error
      );
    }
  }

  try {
    await client.$connect();
  } catch (error) {
    await client.$disconnect().catch(() => {});
    await closeExternalResource(externalResource);
    throw error;
  }

  const newEntry: CachedClient = {
    client,
    lastUsed: Date.now(),
    activeQueries: 0,
    disconnecting: false,
    usePrismaSql,
    externalResource
  };

  clientCache.set(key, newEntry);
  ensureCleanupStarted();

  return client;
}

export async function getWorkspaceClient(
  workspaceId: string,
  usePrismaSql = false
): Promise<any> {
  const lockKey = cacheKey(workspaceId, usePrismaSql);
  const existing = clientLocks.get(lockKey);
  if (existing) return existing;

  const promise = _getWorkspaceClientImpl(workspaceId, usePrismaSql);
  clientLocks.set(lockKey, promise);

  try {
    return await promise;
  } finally {
    clientLocks.delete(lockKey);
  }
}

export async function incrementActiveQueries(
  workspaceId: string,
  usePrismaSql: boolean
): Promise<void> {
  const entry = clientCache.get(cacheKey(workspaceId, usePrismaSql));
  if (entry) entry.activeQueries++;
}

export async function decrementActiveQueries(
  workspaceId: string,
  usePrismaSql: boolean
): Promise<void> {
  const entry = clientCache.get(cacheKey(workspaceId, usePrismaSql));
  if (entry && entry.activeQueries > 0) entry.activeQueries--;
}

export async function deleteWorkspace(workspaceId: string): Promise<boolean> {
  const entries = getCacheEntriesForWorkspace(workspaceId);

  for (const [key, entry] of entries) {
    if (entry.activeQueries > 0) {
      throw new Error("Cannot delete workspace with active queries");
    }
    await closeClientEntry(entry);
    clientCache.delete(key);
  }

  dmmfCache.delete(workspaceId);

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
  const entries = getCacheEntriesForWorkspace(workspaceId);

  for (const [key, entry] of entries) {
    if (!entry.disconnecting && entry.activeQueries === 0) {
      closeClientEntry(entry).catch(() => {});
      clientCache.delete(key);
    }
  }

  dmmfCache.delete(workspaceId);

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
    orderBy: { createdAt: "desc" }
  });
}

async function cleanupIdleClients(): Promise<void> {
  const now = Date.now();
  const toRemove: string[] = [];

  for (const [key, entry] of clientCache.entries()) {
    if (
      entry.activeQueries === 0 &&
      !entry.disconnecting &&
      now - entry.lastUsed > CLIENT_IDLE_TIMEOUT
    ) {
      toRemove.push(key);
    }
  }

  for (const key of toRemove) {
    const entry = clientCache.get(key);
    if (entry) {
      await closeClientEntry(entry);
      clientCache.delete(key);
    }
  }
}

function ensureCleanupStarted(): void {
  if (!cleanupStarted) {
    cleanupStarted = true;
    cleanupInterval = setInterval(() => cleanupIdleClients(), 60000);
  }
}

export function stopCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    cleanupStarted = false;
  }
}

if (import.meta.hot) {
  import.meta.hot.dispose(async () => {
    stopCleanup();

    for (const [key, entry] of clientCache.entries()) {
      await closeClientEntry(entry);
    }

    clientCache.clear();
    clientLocks.clear();
    dmmfCache.clear();
  });
}