import { resolve, join, dirname } from "node:path";
import { existsSync, writeFileSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";

const packageRoot = process.env.PRISMA_QUERY_BUILDER_PACKAGE_ROOT
  || resolve(new URL('.', import.meta.url).pathname, "../../..");

const queriesDbPath = resolve(process.cwd(), "queries.db");
const schemaPath = resolve(packageRoot, "prisma/queries-schema.prisma");

function detectPrismaMajorVersion(): number {
  try {
    const isWin = process.platform === "win32";
    const npxCmd = isWin ? "npx.cmd" : "npx";
    const result = spawnSync(npxCmd, ["prisma", "--version"], {
      stdio: "pipe",
      timeout: 10000,
    });
    const output = result.stdout?.toString() || "";
    const match = output.match(/prisma\s*:\s*(\d+)\./i)
      || output.match(/(\d+)\.\d+\.\d+/);
    if (match) return parseInt(match[1], 10);
  } catch {}
  return 6;
}

function buildSchemaWithUrl(baseSchema: string, dbUrl: string): string {
  return baseSchema.replace(
    /datasource\s+db\s*\{([^}]*)\}/,
    `datasource db {\n  provider = "sqlite"\n  url      = "${dbUrl}"\n}`
  );
}

function buildConfigFile(dbUrl: string, schemaFilePath: string): string {
  return `
import { defineConfig } from "prisma/config";
export default defineConfig({
  schema: "${schemaFilePath.replace(/\\/g, "/")}",
  datasource: {
    url: "${dbUrl}",
  },
});
`.trim();
}

async function validateExistingDb(): Promise<boolean> {
  try {
    const { PrismaBetterSqlite3 } = await import("@prisma/adapter-better-sqlite3");
    const { PrismaClient } = await import("../../../generated/queries-client/client.js");

    const adapter = new PrismaBetterSqlite3({ url: `file:${queriesDbPath}` });
    const client = new (PrismaClient as any)({ adapter });

    try {
      await client.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    } finally {
      await client.$disconnect().catch(() => {});
    }
  } catch {
    return false;
  }
}

export async function ensureQueriesDb(): Promise<void> {
  if (existsSync(queriesDbPath)) {
    const valid = await validateExistingDb();
    if (valid) return;
    console.warn("⚠️  Queries database exists but is invalid, reinitializing...");
  }

  console.log("📦 Initializing queries database...");
  console.log("   Location:", queriesDbPath);

  if (!existsSync(schemaPath)) {
    throw new Error(
      `Schema file not found at ${schemaPath}. Package may be corrupted.`
    );
  }

  const baseSchema = readFileSync(schemaPath, "utf-8");
  const dbUrl = `file:${queriesDbPath}`;
  const majorVersion = detectPrismaMajorVersion();

  console.log("   Detected Prisma version:", majorVersion);

  const tempDir = resolve(process.cwd(), ".prisma-qb-init-temp");
  mkdirSync(tempDir, { recursive: true });

  try {
    const isWin = process.platform === "win32";
    const npxCmd = isWin ? "npx.cmd" : "npx";

    const tempSchemaPath = join(tempDir, "schema.prisma");
    const schemaWithUrl = buildSchemaWithUrl(baseSchema, dbUrl);
    writeFileSync(tempSchemaPath, schemaWithUrl, "utf-8");

    const tempConfigPath = join(tempDir, "prisma.config.mjs");
    writeFileSync(tempConfigPath, buildConfigFile(dbUrl, tempSchemaPath), "utf-8");

    let args: string[];

    if (majorVersion >= 7) {
      args = [
        "prisma", "db", "push",
        "--config", tempConfigPath,
        "--accept-data-loss",
      ];
    } else {
      args = [
        "prisma", "db", "push",
        "--config", tempConfigPath,
        "--skip-generate",
        "--accept-data-loss",
      ];
    }

    await new Promise<void>((resolve, reject) => {
      const proc = spawn(npxCmd, args, {
        cwd: tempDir,
        stdio: "pipe",
        env: {
          ...process.env,
          DATABASE_URL: dbUrl,
        },
      });

      let output = "";
      proc.stdout?.on("data", (data) => { output += data.toString(); });
      proc.stderr?.on("data", (data) => { output += data.toString(); });

      proc.on("close", (code) => {
        if (code === 0) {
          console.log("✅ Queries database initialized");
          resolve();
        } else {
          console.error("❌ Failed to initialize queries database");
          console.error(output);
          reject(new Error(`Prisma db push failed with exit code ${code}`));
        }
      });

      proc.on("error", (err) => {
        reject(new Error(`Failed to spawn prisma: ${err.message}`));
      });
    });
  } finally {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  }
}