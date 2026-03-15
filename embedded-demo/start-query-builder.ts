import { spawn, spawnSync, type ChildProcess } from "child_process";
import { readFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let queryBuilderProcess: ChildProcess | null = null;

export interface QueryBuilderConfig {
  port?: number;
  schemaPath?: string;
  databaseUrl?: string;
}

function runPrismaGenerate(cwd: string, prismaConfigPath: string) {
  const isWin = process.platform === "win32";
  const npxCmd = isWin ? "npx.cmd" : "npx";

  const res = spawnSync(npxCmd, ["prisma", "generate", "--config", prismaConfigPath], {
    cwd,
    stdio: "inherit",
    env: process.env
  });

  if (res.error) {
    throw new Error(`Failed to run prisma generate: ${res.error.message}`);
  }
  if (typeof res.status === "number" && res.status !== 0) {
    throw new Error(`prisma generate failed (exit ${res.status})`);
  }
}

export function startQueryBuilder(config?: QueryBuilderConfig) {
  if (process.env.NODE_ENV === "production") {
    console.log("⚠️  Query builder disabled in production");
    return;
  }

  if (queryBuilderProcess) {
    console.log("⚠️  Query builder already running");
    return;
  }

  const port = config?.port || 5173;
  const schemaPath = config?.schemaPath;
  const databaseUrl = config?.databaseUrl || process.env.DATABASE_URL;

  if (!schemaPath) {
    console.error("❌ Schema path is required");
    return;
  }

  if (!existsSync(schemaPath)) {
    console.error(`❌ Schema file not found: ${schemaPath}`);
    return;
  }

  const schemaDir = path.dirname(schemaPath);
  const prismaConfigPath = path.join(schemaDir, "prisma.config.ts");
  const hasPrismaConfig = existsSync(prismaConfigPath);

  if (hasPrismaConfig) {
    console.log("   Found prisma.config.ts");
  }

  let schemaContent: string;
  try {
    schemaContent = readFileSync(schemaPath, "utf-8");
  } catch (err) {
    console.error("❌ Failed to read schema file:", err);
    return;
  }

  console.log("🚀 Starting query builder...");
  console.log("   Prisma: 7.3.0");
  console.log(`   Schema: ${path.basename(schemaPath)}`);
  console.log(`   Port: ${port}`);
  console.log("   Mode: Embedded");
  console.log(`   Database: ${databaseUrl ? "✓ configured" : "✗ not configured"}`);

  const localBin = path.join(__dirname, "..", "bin", "cli.js");
  const installedBin = path.join(__dirname, "node_modules", "prisma-query-builder-ui", "bin", "cli.js");

  let binaryPath: string | null = null;

  if (existsSync(localBin)) {
    binaryPath = localBin;
    console.log("   Using local build: ../bin/cli.js");
  } else if (existsSync(installedBin)) {
    binaryPath = installedBin;
    console.log("   Using installed package: node_modules/...");
  }

  if (!binaryPath) {
    console.error("❌ Query builder binary not found!");
    console.error("   Expected locations:");
    console.error(`   - ${localBin}`);
    console.error(`   - ${installedBin}`);
    console.error("");
    console.error("   Make sure to:");
    console.error("   1. Build the library: cd .. && npm run build");
    console.error("   2. Install dependencies: cd embedded-demo && npm install");
    return;
  }

  // Generate Prisma Client for the embedded-demo app (NOT for the query builder package)
  if (hasPrismaConfig) {
    try {
      console.log("   Running: npx prisma generate --config prisma.config.ts");
      runPrismaGenerate(schemaDir, prismaConfigPath);
      console.log("   Prisma Client generated ✓");
    } catch (e) {
      console.error("❌ Failed to generate Prisma Client for embedded demo:", e);
      return;
    }
  } else {
    console.warn("⚠️  prisma.config.ts not found; skipping prisma generate");
    console.warn("    Execution will fail unless Prisma Client already exists.");
  }

  queryBuilderProcess = spawn("node", [binaryPath], {
    stdio: "pipe",
    env: {
      ...process.env,
      PORT: String(port),

      VITE_PRISMA_QUERY_BUILDER_MODE: "embedded",
      VITE_DISABLE_PERSISTENCE: "true",

      PRISMA_QUERY_BUILDER_MODE: "embedded",
      DISABLE_PERSISTENCE: "true",

      PRISMA_QUERY_BUILDER_SCHEMA_CONTENT: schemaContent,
      DATABASE_URL: databaseUrl || "",

      PRISMA_HIDE_UPDATE_MESSAGE: "true",

      // Critical: points the query builder to the embedded app root
      PRISMA_QUERY_BUILDER_CWD: schemaDir
    }
  });

  queryBuilderProcess.stdout?.on("data", (data) => {
    const lines = data
      .toString()
      .split("\n")
      .filter((line: string) => line.trim());
    lines.forEach((line: string) => {
      console.log(`[QueryBuilder] ${line}`);
    });
  });

  queryBuilderProcess.stderr?.on("data", (data) => {
    const lines = data
      .toString()
      .split("\n")
      .filter((line: string) => line.trim());
    lines.forEach((line: string) => {
      console.error(`[QueryBuilder] ${line}`);
    });
  });

  queryBuilderProcess.on("error", (err) => {
    console.error("❌ Query builder failed to start:", err.message);
    queryBuilderProcess = null;
  });

  queryBuilderProcess.on("exit", (code, signal) => {
    if (code !== null && code !== 0 && !signal) {
      console.error(`❌ Query builder exited with code ${code}`);
    } else if (signal) {
      console.log(`🛑 Query builder stopped by signal ${signal}`);
    }
    queryBuilderProcess = null;
  });

  process.on("exit", stopQueryBuilder);
}

export function stopQueryBuilder() {
  if (queryBuilderProcess && !queryBuilderProcess.killed) {
    console.log("🛑 Stopping query builder...");
    queryBuilderProcess.kill("SIGTERM");

    setTimeout(() => {
      if (queryBuilderProcess && !queryBuilderProcess.killed) {
        console.log("⚠️  Force killing query builder...");
        queryBuilderProcess.kill("SIGKILL");
      }
    }, 3000);

    queryBuilderProcess = null;
  }
}
