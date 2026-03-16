import prismaInternals from "@prisma/internals";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { createDMMFParser } from "../dmmf-parser.js";
import type { DMMFData } from "../types.js";
import { isEmbeddedMode, getEmbeddedSchemaContent } from "../embedded-mode.js";
import {
  extractProviderFromSchema,
  buildSchemaWithGenerators,
  cleanSchemaUrls,
  createAdapterForUrl,
  closeExternalResource
} from "./database-utils.js";
import { debug, debugWarn } from "./debug.js";

const { getDMMF, getGenerators } = prismaInternals;

function schemaHash(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

function findSchemaPath(): string | null {
  const envSchema = process.env.PRISMA_QUERY_BUILDER_SCHEMA;
  if (envSchema) {
    if (!existsSync(envSchema)) {
      throw new Error(
        `PRISMA_QUERY_BUILDER_SCHEMA path does not exist: ${envSchema}`
      );
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

export async function getDmmfFromSchema(
  schemaContent: string
): Promise<DMMFData> {
  const cleanedSchema = cleanSchemaUrls(schemaContent);
  const dmmf = await getDMMF({ datamodel: cleanedSchema } as any);

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
      debug("prisma", "Using schema from PRISMA_QUERY_BUILDER_SCHEMA_CONTENT");
      return getDmmfFromSchema(schemaContent);
    }

    const schemaPath = findSchemaPath();
    if (schemaPath) {
      debug("prisma", "Using schema from file path:", schemaPath);
      const fromFile = readFileSync(schemaPath, "utf-8");
      return getDmmfFromSchema(fromFile);
    }

    throw new Error(
      "Embedded mode: No schema found. Set PRISMA_QUERY_BUILDER_SCHEMA_CONTENT or PRISMA_QUERY_BUILDER_SCHEMA."
    );
  }

  const schemaPath = findSchemaPath();
  if (!schemaPath) {
    throw new Error(
      "No local Prisma schema found. Use upload/schema-param mode or set PRISMA_QUERY_BUILDER_SCHEMA."
    );
  }

  debug("prisma", "Using schema from file path:", schemaPath);
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

async function generateEmbeddedClient(
  schemaContent: string,
  cwd: string
): Promise<void> {
  const tempDir = join(cwd, ".prisma-query-builder-temp");
  const prismaDir = join(tempDir, "prisma");
  const schemaPath = join(prismaDir, "schema.prisma");
  const outputPath = join(tempDir, "generated", "client");
  const sqlOutputPath = join(tempDir, "generated", "sql");

  mkdirSync(prismaDir, { recursive: true });

  const transformedSchema = buildSchemaWithGenerators(
    schemaContent,
    outputPath,
    sqlOutputPath
  );
  writeFileSync(schemaPath, transformedSchema, "utf-8");

  const packageNodeModules = resolve(process.cwd(), "node_modules");
  const generatorPath = join(
    packageNodeModules,
    "@prisma",
    "client",
    "generator-build",
    "index.js"
  );

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
        isNode: true
      }
    }
  });

  for (const generator of generators) {
    await generator.generate();
    generator.stop();
  }

  debug("prisma", "Client and SQL extension generated");
}

type EmbeddedCacheEntry = {
  client: any;
  provider: string;
  usePrismaSql: boolean;
  databaseUrl: string;
  schemaDigest: string;
  externalResource: any | null;
};

let embeddedClientCache: EmbeddedCacheEntry | null = null;

let localClient: any | null = null;

async function createPrismaClient(usePrismaSql = false): Promise<any> {
  if (isEmbeddedMode()) {
    const embeddedCwd = String(
      process.env.PRISMA_QUERY_BUILDER_CWD || ""
    ).trim();
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
    const digest = schemaHash(schemaContent);

    if (
      embeddedClientCache &&
      embeddedClientCache.provider === provider &&
      embeddedClientCache.usePrismaSql === usePrismaSql &&
      embeddedClientCache.databaseUrl === url &&
      embeddedClientCache.schemaDigest === digest
    ) {
      return embeddedClientCache.client;
    }

    if (embeddedClientCache) {
      await embeddedClientCache.client.$disconnect().catch(() => {});
      await closeExternalResource(embeddedClientCache.externalResource);
      embeddedClientCache = null;
    }

    const tempDir = join(embeddedCwd, ".prisma-query-builder-temp");
    const clientPath = join(tempDir, "generated", "client");
    const sqlPath = join(tempDir, "generated", "sql");
    const hashFilePath = join(tempDir, "generated", ".schema-hash");

    const existingHash = existsSync(hashFilePath)
      ? readFileSync(hashFilePath, "utf-8").trim()
      : "";

    if (!existsSync(clientPath) || existingHash !== digest) {
      await generateEmbeddedClient(schemaContent, embeddedCwd);
      mkdirSync(join(tempDir, "generated"), { recursive: true });
      writeFileSync(hashFilePath, digest, "utf-8");
    }

    const req = createRequire(resolve(embeddedCwd, "package.json"));

    const clientModule = req(join(clientPath, "index.js"));
    const ClientClass =
      clientModule.PrismaClient ?? clientModule.default?.PrismaClient;

    if (!ClientClass) {
      const available = Object.keys(clientModule).join(", ");
      throw new Error(
        `PrismaClient not found in generated client. Available exports: ${available}`
      );
    }

    const adapter = await createAdapterForUrl(url);
    let client = new ClientClass({ adapter });
    let externalResource: any | null = null;

    if (
      usePrismaSql &&
      (provider === "postgresql" || provider === "sqlite")
    ) {
      try {
        const sqlIndexPath = join(sqlPath, "index.js");
        if (existsSync(sqlIndexPath)) {
          const sqlModule = req(sqlIndexPath);
          const speedExtension =
            sqlModule.speedExtension ?? sqlModule.default?.speedExtension;

          if (speedExtension) {
            if (provider === "postgresql") {
              const postgres = (await import("postgres")).default;
              const sql = postgres(url);
              externalResource = sql;
              client = client.$extends(speedExtension({ postgres: sql }));
            } else if (provider === "sqlite") {
              const Database = (await import("better-sqlite3")).default;
              const dbPath = url.replace("file:", "");
              const db = new Database(dbPath);
              externalResource = db;
              client = client.$extends(speedExtension({ sqlite: db }));
            }
            debug("prisma", "Applied prisma-sql extension for", provider);
          }
        }
      } catch (error) {
        debugWarn("prisma", "Failed to apply prisma-sql extension:", error);
      }
    }

    embeddedClientCache = {
      client,
      provider,
      usePrismaSql,
      databaseUrl: url,
      schemaDigest: digest,
      externalResource
    };

    return client;
  }

  if (localClient) return localClient;

  const mod = await import("@prisma/client");
  const ClientClass =
    (mod as any).PrismaClient ?? (mod as any).default?.PrismaClient;

  if (!ClientClass) {
    const available = Object.keys(mod).join(", ");
    throw new Error(
      `PrismaClient not found in @prisma/client. Available exports: ${available}`
    );
  }

  localClient = new ClientClass();
  return localClient;
}

export async function getPrismaClient(usePrismaSql = false): Promise<any> {
  try {
    return await createPrismaClient(usePrismaSql);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const isClientMissing =
      msg.includes("Cannot find module") ||
      msg.includes("MODULE_NOT_FOUND") ||
      msg.includes(".prisma") ||
      msg.includes("PrismaClient not found");

    if (isClientMissing) {
      throw new Error(
        `Failed to load Prisma Client — it may not have been generated. Run "npx prisma generate". Original error: ${msg}`
      );
    }

    throw e;
  }
}

export async function withPrismaClient<T>(
  fn: (client: any) => Promise<T>,
  usePrismaSql = false
): Promise<T> {
  const client = await getPrismaClient(usePrismaSql);
  return fn(client);
}

export async function getParserAndOperations() {
  const { parser, operations } = await getParserFromLocalSchema();
  return { parser, operations };
}

export async function getDmmf(): Promise<DMMFData> {
  return getDmmfFromLocalSchema();
}