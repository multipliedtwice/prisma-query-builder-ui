export const SUPPORTED_PROVIDERS = ["postgresql", "mysql", "sqlite"] as const;

export type SupportedProvider = (typeof SUPPORTED_PROVIDERS)[number];

export function isSupportedProvider(provider: string): provider is SupportedProvider {
  return (SUPPORTED_PROVIDERS as readonly string[]).includes(provider);
}

export function extractProviderFromSchema(schemaContent: string): string {
  const match = schemaContent.match(
    /datasource\s+\w+\s*\{[^}]*provider\s*=\s*"([^"]+)"[^}]*\}/s
  );
  if (!match) {
    throw new Error(
      "No datasource block with a provider found in the Prisma schema"
    );
  }
  const provider = match[1].toLowerCase();
  if (provider === "postgres" || provider === "postgresql")
    return "postgresql";
  if (provider === "mysql") return "mysql";
  if (provider === "sqlite") return "sqlite";
  if (provider === "sqlserver") return "sqlserver";
  if (provider === "mongodb") return "mongodb";
  return provider;
}

export function extractProviderFromUrl(url: string): string {
  if (url.startsWith("file:")) return "sqlite";
  const protocol = url.split("://")[0].toLowerCase();
  if (protocol === "postgres" || protocol === "postgresql") return "postgresql";
  if (protocol === "mysql") return "mysql";
  if (protocol === "file" || protocol === "sqlite") return "sqlite";
  if (protocol === "sqlserver") return "sqlserver";
  if (protocol === "mongodb") return "mongodb";
  return protocol;
}

const DATABASE_URL_PATTERN =
  /^(postgresql|postgres|mysql):\/\/.+|^file:.+/i;

const DANGEROUS_URL_CHARS = /[`;\|]/;

export function validateDatabaseUrl(
  url: string,
  schemaProvider?: string
): string | null {
  if (!DATABASE_URL_PATTERN.test(url)) {
    return "Invalid database URL format. Supported: postgresql://, mysql://, file:";
  }
  if (DANGEROUS_URL_CHARS.test(url)) {
    return "Database URL contains invalid characters (backticks, semicolons, or pipes are not allowed)";
  }
  const urlProvider = extractProviderFromUrl(url);
  if (!isSupportedProvider(urlProvider)) {
    return `Unsupported database provider: ${urlProvider}. Supported: postgresql, mysql, sqlite`;
  }
  if (schemaProvider && schemaProvider !== urlProvider) {
    return `Database URL provider (${urlProvider}) doesn't match schema provider (${schemaProvider})`;
  }
  return null;
}

export function parseMysqlUrl(url: string): {
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
    database: decodeURIComponent(parsed.pathname.replace(/^\//, ""))
  };
}

export async function closeExternalResource(resource: any): Promise<void> {
  if (!resource) return;
  try {
    if (typeof resource.end === "function") {
      await resource.end();
    } else if (typeof resource.close === "function") {
      resource.close();
    }
  } catch {}
}

export async function createAdapterForUrl(url: string): Promise<any> {
  const provider = extractProviderFromUrl(url);
  return createAdapterForProvider(provider, url);
}

export async function createAdapterForProvider(
  provider: string,
  databaseUrl: string
): Promise<any> {
  switch (provider) {
    case "postgresql": {
      const { PrismaPg } = await import("@prisma/adapter-pg");
      return new PrismaPg({ connectionString: databaseUrl });
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
        connectionLimit: 5
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
        `Unsupported database provider: ${provider}. Supported: ${SUPPORTED_PROVIDERS.join(", ")}`
      );
  }
}

export function stripSchemaBlocks(schemaContent: string): string {
  let result = schemaContent;
  result = result.replace(/datasource\s+\w+\s*\{[\s\S]*?\}\s*/g, "");
  result = result.replace(/generator\s+\w+\s*\{[\s\S]*?\}\s*/g, "");
  result = result.replace(/\n{3,}/g, "\n\n").trim();
  return result;
}

export function buildSchemaWithGenerators(
  schemaContent: string,
  outputPath: string,
  sqlOutputPath: string
): string {
  const provider = extractProviderFromSchema(schemaContent);
  const stripped = stripSchemaBlocks(schemaContent);

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

  return header + stripped;
}

export function buildValidationSchema(schemaContent: string): string {
  const provider = extractProviderFromSchema(schemaContent);
  const stripped = stripSchemaBlocks(schemaContent);

  const header = `datasource db {
  provider = "${provider}"
}

generator client {
  provider = "prisma-client"
}

`;

  return header + stripped;
}

export function cleanSchemaUrls(schemaContent: string): string {
  return schemaContent.replace(
    /datasource\s+\w+\s*\{[^}]*\}/g,
    (block) =>
      block.replace(/^\s*(?:url|directUrl)\s*=\s*[^\n]+\n?/gm, "")
  );
}

export function cleanSchemaForPrisma7(schemaContent: string): string {
  let cleaned = cleanSchemaUrls(schemaContent);
  cleaned = cleaned.replace(
    /generator\s+(\w+)\s*\{([\s\S]*?)provider\s*=\s*"prisma-client-js"([\s\S]*?)\}/g,
    (_match, name, before, after) => {
      return `generator ${name} {${before}provider = "prisma-client"${after}}`;
    }
  );
  return cleaned;
}