import prismaInternals from "@prisma/internals";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { createRequire } from "node:module";
import { createDMMFParser } from "../dmmf-parser.js";
import type { DMMFData } from "../types.js";
import { isEmbeddedMode, getEmbeddedSchemaContent } from "../embedded-mode.js";

const { getDMMF, getGenerators } = prismaInternals;

function findSchemaPath(): string | null {
  const envSchema = process.env.PRISMA_QUERY_BUILDER_SCHEMA;
  if (envSchema) {
    if (!existsSync(envSchema)) {
      throw new Error(`PRISMA_QUERY_BUILDER_SCHEMA path does not exist: ${envSchema}`);
    }
    return envSchema;
  }

  const cwd = process.env.PRISMA_QUERY_BUILDER_CWD || process.cwd();
  const candidates = [
    resolve(cwd, "prisma/schema.prisma"),
    resolve(cwd, "schema.prisma"),
    resolve(process.cwd(), "prisma/schema.prisma")
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  return null;
}

function logPrismaResolution(label: string, baseDir: string, req: NodeRequire) {
  const resolveSafe = (id: string) => {
    try {
      return req.resolve(id);
    } catch (e) {
      return `<<cannot resolve: ${id}>>`;
    }
  };

  const pkgPath = resolveSafe("@prisma/client/package.json");
  let version = "unknown";
  try {
    if (!pkgPath.startsWith("<<")) {
      const pkg = req("@prisma/client/package.json");
      version = String(pkg?.version ?? "unknown");
    }
  } catch {}

  const generatedClientDir = join(baseDir, "node_modules", ".prisma", "client");
  const generatedClientIndex = join(generatedClientDir, "index.js");

  console.log(`[prisma][${label}] baseDir:`, baseDir);
  console.log(`[prisma][${label}] process.cwd():`, process.cwd());
  console.log(`[prisma][${label}] node version:`, process.version);
  console.log(`[prisma][${label}] DATABASE_URL set:`, Boolean(String(process.env.DATABASE_URL || "").trim()));
  console.log(`[prisma][${label}] @prisma/client version:`, version);
  console.log(`[prisma][${label}] resolve("@prisma/client"):`, resolveSafe("@prisma/client"));
  console.log(`[prisma][${label}] resolve("@prisma/client/package.json"):`, pkgPath);
  console.log(`[prisma][${label}] expected generated dir:`, generatedClientDir);
  console.log(`[prisma][${label}] exists generated dir:`, existsSync(generatedClientDir));
  console.log(`[prisma][${label}] exists generated index:`, existsSync(generatedClientIndex));
}

export async function getDmmfFromSchema(schemaContent: string): Promise<DMMFData> {
  const cleanedSchema = schemaContent.replace(
    /(datasource\s+\w+\s*\{[^}]*?)(?:url|directUrl)\s*=\s*[^\n]+\n/g,
    "$1"
  );

  console.log("[DMMF] Schema being sent to getDMMF (first 500 chars):");
  console.log(cleanedSchema.slice(0, 500));

  const dmmf = await getDMMF({ datamodel: cleanedSchema } as any);

  console.log("[DMMF] Raw DMMF structure:", {
    hasMappings: !!dmmf.mappings,
    hasSchema: !!dmmf.schema,
    hasDatamodel: !!dmmf.datamodel,
    mappingsType: typeof dmmf.mappings,
    schemaType: typeof dmmf.schema
  });

  const queryType = (dmmf.schema as any)?.outputObjectTypes?.prisma?.find((t: any) => t.name === "Query");
  const sampleQueryField = queryType?.fields?.[0];

  console.log("[DMMF] Sample Query field:", {
    name: sampleQueryField?.name,
    argsCount: sampleQueryField?.args?.length,
    argNames: sampleQueryField?.args?.map((a: any) => a.name),
    hasSelect: sampleQueryField?.args?.some((a: any) => a.name === "select"),
    hasInclude: sampleQueryField?.args?.some((a: any) => a.name === "include"),
    firstArgDetails: sampleQueryField?.args?.[0]
  });

  return {
    datamodel: dmmf.datamodel as unknown as DMMFData["datamodel"],
    schema: dmmf.schema as unknown as DMMFData["schema"],
    mappings: dmmf.mappings as unknown as DMMFData["mappings"]
  };
}

export async function getDmmfFromLocalSchema(): Promise<DMMFData> {
  if (isEmbeddedMode()) {
    const schemaContent = getEmbeddedSchemaContent();
    if (schemaContent) {
      console.log("[Embedded Mode] Using schema from PRISMA_QUERY_BUILDER_SCHEMA_CONTENT");
      return getDmmfFromSchema(schemaContent);
    }

    const schemaPath = findSchemaPath();
    if (schemaPath) {
      console.log("[Embedded Mode] Using schema from file path:", schemaPath);
      const fromFile = readFileSync(schemaPath, "utf-8");
      return getDmmfFromSchema(fromFile);
    }

    throw new Error("Embedded mode: No schema found. Set PRISMA_QUERY_BUILDER_SCHEMA_CONTENT or PRISMA_QUERY_BUILDER_SCHEMA.");
  }

  const schemaPath = findSchemaPath();
  if (!schemaPath) {
    throw new Error("No local Prisma schema found. Use upload/schema-param mode or set PRISMA_QUERY_BUILDER_SCHEMA.");
  }

  console.log("[Standalone Mode] Using schema from file path:", schemaPath);
  const schemaContent = readFileSync(schemaPath, "utf-8");
  return getDmmfFromSchema(schemaContent);
}

export async function getParserFromSchema(schemaContent: string) {
  const dmmf = await getDmmfFromSchema(schemaContent);
  const parser = createDMMFParser(dmmf);
  return { parser, operations: parser.getOperations() };
}

export async function getParserFromLocalSchema() {
  const dmmf = await getDmmfFromLocalSchema();
  const parser = createDMMFParser(dmmf);
  return { parser, operations: parser.getOperations() };
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

function extractProviderFromSchema(schemaContent: string): string {
  const match = schemaContent.match(
    /datasource\s+\w+\s*\{[^}]*provider\s*=\s*"([^"]+)"[^}]*\}/s,
  );
  if (match) {
    const provider = match[1].toLowerCase();
    if (provider === "postgres" || provider === "postgresql") return "postgresql";
    if (provider === "mysql") return "mysql";
    if (provider === "sqlite") return "sqlite";
    if (provider === "sqlserver") return "sqlserver";
    if (provider === "mongodb") return "mongodb";
    return provider;
  }
  return "postgresql";
}

function transformSchemaForPrismaGeneration(schemaContent: string, outputPath: string): string {
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

async function generateEmbeddedClient(schemaContent: string, cwd: string): Promise<void> {
  const tempDir = join(cwd, ".prisma-query-builder-temp");
  const prismaDir = join(tempDir, "prisma");
  const schemaPath = join(prismaDir, "schema.prisma");
  const outputPath = join(tempDir, "generated", "client");

  mkdirSync(prismaDir, { recursive: true });

  const transformedSchema = transformSchemaForPrismaGeneration(schemaContent, outputPath);
  writeFileSync(schemaPath, transformedSchema, "utf-8");

  console.log("[prisma] Generating embedded client with SQL extension...");

  const packageNodeModules = resolve(process.cwd(), "node_modules");
  const generatorPath = join(packageNodeModules, "@prisma", "client", "generator-build", "index.js");

  if (!existsSync(generatorPath)) {
    throw new Error(`Generator not found at ${generatorPath}`);
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

  console.log("[prisma] Client and SQL extension generated");
}

async function createAdapterForUrl(url: string): Promise<any> {
  let protocol: string;
  
  if (url.startsWith("file:")) {
    protocol = "file";
  } else {
    protocol = url.split("://")[0].toLowerCase();
  }
  
  console.log(`[prisma] Creating adapter for protocol: ${protocol}`);
  
  if (protocol === "file" || protocol === "sqlite") {
    const { PrismaBetterSqlite3 } = await import("@prisma/adapter-better-sqlite3");
    console.log(`[prisma] Using SQLite adapter`);
    return new PrismaBetterSqlite3({ url });
  }
  
  if (protocol === "postgres" || protocol === "postgresql") {
    const { PrismaPg } = await import("@prisma/adapter-pg");
    console.log(`[prisma] Using PostgreSQL adapter`);
    return new PrismaPg({ connectionString: url });
  }
  
  if (protocol === "mysql") {
    const { PrismaMariaDb } = await import("@prisma/adapter-mariadb");
    const config = parseMysqlUrl(url);
    console.log(`[prisma] Using MySQL/MariaDB adapter`);
    return new PrismaMariaDb({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      connectionLimit: 5,
    });
  }
  
  throw new Error(`Unsupported database provider: ${protocol}. Supported: postgresql, mysql, sqlite`);
}

let embeddedClientCache: { client: any; provider: string } | null = null;

async function createPrismaClient(usePrismaSql = false): Promise<any> {
  if (isEmbeddedMode()) {
    const embeddedCwd = String(process.env.PRISMA_QUERY_BUILDER_CWD || "").trim();
    if (!embeddedCwd) {
      throw new Error("Embedded mode: PRISMA_QUERY_BUILDER_CWD is not set");
    }

    const url = String(process.env.DATABASE_URL || "").trim();
    if (!url) {
      throw new Error("Embedded mode: DATABASE_URL is not set");
    }

    const schemaContent = getEmbeddedSchemaContent();
    if (!schemaContent) {
      throw new Error("Embedded mode: No schema content available");
    }

    const provider = extractProviderFromSchema(schemaContent);

    if (embeddedClientCache && embeddedClientCache.provider === provider) {
      console.log("[prisma] Using cached embedded client");
      return embeddedClientCache.client;
    }

    const tempDir = join(embeddedCwd, ".prisma-query-builder-temp");
    const clientPath = join(tempDir, "generated", "client");
    const sqlPath = join(tempDir, "generated", "sql");

    if (!existsSync(clientPath)) {
      console.log("[prisma] Generating embedded client for first time...");
      await generateEmbeddedClient(schemaContent, embeddedCwd);
    }

    const req = createRequire(resolve(embeddedCwd, "package.json"));
    logPrismaResolution("embedded", embeddedCwd, req);

    console.log("[prisma] Loading generated client from:", clientPath);

    const clientModule = req(join(clientPath, "index.js"));
    const ClientClass = clientModule.PrismaClient ?? clientModule.default?.PrismaClient;

    if (!ClientClass) {
      const available = Object.keys(clientModule).join(", ");
      throw new Error(`PrismaClient not found in generated client. Available exports: ${available}`);
    }

    try {
      console.log("[prisma] Creating client with driver adapter (Prisma 7 requirement)");
      const adapter = await createAdapterForUrl(url);
      let client = new ClientClass({ adapter, log: ["query", "error", "warn"] });

      if (usePrismaSql && (provider === "postgresql" || provider === "sqlite")) {
        try {
          const sqlIndexPath = join(sqlPath, "index.js");
          if (existsSync(sqlIndexPath)) {
            console.log("[prisma] Loading SQL extension from:", sqlIndexPath);
            const sqlModule = req(sqlIndexPath);
            const speedExtension = sqlModule.speedExtension ?? sqlModule.default?.speedExtension;

            if (speedExtension) {
              if (provider === "postgresql") {
                const postgres = (await import("postgres")).default;
                const sql = postgres(url);
                client = client.$extends(speedExtension({ postgres: sql }));
                console.log("[prisma] Applied prisma-sql extension for PostgreSQL");
              } else if (provider === "sqlite") {
                const Database = (await import("better-sqlite3")).default;
                const dbPath = url.replace("file:", "");
                const db = new Database(dbPath);
                client = client.$extends(speedExtension({ sqlite: db }));
                console.log("[prisma] Applied prisma-sql extension for SQLite");
              }
            } else {
              console.warn("[prisma] speedExtension not found in SQL module");
            }
          } else {
            console.warn("[prisma] SQL extension not found at:", sqlIndexPath);
          }
        } catch (error) {
          console.warn("[prisma] Failed to apply prisma-sql extension:", error);
        }
      }

      console.log("[prisma] Client created successfully");
      
      embeddedClientCache = { client, provider };
      
      return client;
    } catch (e) {
      const diagnostic = [
        `embeddedCwd=${embeddedCwd}`,
        `cwd=${process.cwd()}`,
        `DATABASE_URL_set=${Boolean(url)}`,
        `tempDir=${tempDir}`,
        `clientPath=${clientPath}`,
        `clientPath_exists=${existsSync(clientPath)}`
      ].join(" ");

      const msg = e instanceof Error ? e.message : String(e);
      console.error("[prisma] Failed to create client:", msg);
      throw new Error(`${msg} | Diagnostic: ${diagnostic}`);
    }
  }

  console.log("[prisma] Loading @prisma/client from package");

  const mod = await import("@prisma/client");
  const ClientClass = (mod as any).PrismaClient ?? (mod as any).default?.PrismaClient;

  if (!ClientClass) {
    const available = Object.keys(mod).join(", ");
    throw new Error(`PrismaClient not found in @prisma/client. Available exports: ${available}`);
  }

  console.log("[prisma] Creating client without adapter (standalone mode)");
  return new ClientClass();
}

export async function getPrismaClient(usePrismaSql = false): Promise<any> {
  try {
    return await createPrismaClient(usePrismaSql);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);

    throw new Error(
      [
        "Failed to load @prisma/client.",
        "This usually means Prisma Client was not generated (node_modules/.prisma is missing).",
        "If you only need schema upload / schema-param parsing, do not call execute endpoints.",
        `Original error: ${msg}`
      ].join(" ")
    );
  }
}

export async function withPrismaClient<T>(fn: (client: any) => Promise<T>, usePrismaSql = false): Promise<T> {
  const client = await getPrismaClient(usePrismaSql);
  try {
    return await fn(client);
  } finally {
    await client.$disconnect().catch(() => {});
  }
}

export const prisma = new Proxy({} as any, {
  get(_, prop) {
    if (prop === "then") return undefined;
    return async (...args: any[]) => {
      return withPrismaClient(async (client) => {
        const target = client[prop as any];
        if (typeof target === "function") return target.apply(client, args);
        return target;
      });
    };
  }
});

export async function getParserAndOperations() {
  const { parser, operations } = await getParserFromLocalSchema();
  return { parser, operations };
}

export async function getDmmf(): Promise<DMMFData> {
  return getDmmfFromLocalSchema();
}