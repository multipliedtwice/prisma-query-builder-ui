import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

// Get package root from env or calculate from current file
const packageRoot = process.env.PRISMA_QUERY_BUILDER_PACKAGE_ROOT 
  || resolve(new URL('.', import.meta.url).pathname, "../../..");

const queriesDbPath = resolve(process.cwd(), "queries.db");
const schemaPath = resolve(packageRoot, "prisma/queries-schema.prisma");

export async function ensureQueriesDb(): Promise<void> {
  // Check if database exists and is valid
  if (existsSync(queriesDbPath)) {
    try {
      const { getQueriesDb } = await import("./queries-db.js");
      const db = await getQueriesDb();
      await db.$queryRaw`SELECT 1`;
      return; // Database is valid
    } catch (error) {
      console.warn("⚠️  Queries database exists but is invalid, reinitializing...");
    }
  }

  console.log("📦 Initializing queries database...");
  console.log("   Location:", queriesDbPath);

  if (!existsSync(schemaPath)) {
    throw new Error(
      `Schema file not found at ${schemaPath}. Package may be corrupted.`
    );
  }

  await new Promise<void>((resolve, reject) => {
    const isWin = process.platform === "win32";
    const npxCmd = isWin ? "npx.cmd" : "npx";

    const proc = spawn(
      npxCmd,
      [
        "prisma",
        "db",
        "push",
        "--schema",
        schemaPath,
        "--skip-generate",
        "--accept-data-loss"
      ],
      {
        cwd: process.cwd(),
        stdio: "pipe",
        env: {
          ...process.env,
          DATABASE_URL: `file:${queriesDbPath}`
        }
      }
    );

    let output = "";
    proc.stdout?.on("data", (data) => {
      output += data.toString();
    });

    proc.stderr?.on("data", (data) => {
      output += data.toString();
    });

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
}