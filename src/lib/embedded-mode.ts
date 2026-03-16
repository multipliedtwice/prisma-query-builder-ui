import type { EmbeddedConfig } from "./types.ts";

export function isEmbeddedMode(): boolean {
  if (import.meta.env.VITE_PRISMA_QUERY_BUILDER_MODE === "embedded") {
    return true;
  }

  if (
    typeof process !== "undefined" &&
    process.env.PRISMA_QUERY_BUILDER_MODE === "embedded"
  ) {
    return true;
  }

  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    if (params.get("embedded") === "true") {
      return true;
    }
  }

  return false;
}

export function shouldDisablePersistence(): boolean {
  if (import.meta.env.VITE_DISABLE_PERSISTENCE === "true") {
    return true;
  }

  if (
    typeof process !== "undefined" &&
    process.env.DISABLE_PERSISTENCE === "true"
  ) {
    return true;
  }

  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    if (params.get("disablePersistence") === "true") {
      return true;
    }
  }

  return false;
}

export function isStandaloneMode(): boolean {
  return !isEmbeddedMode();
}

export function getEmbeddedSchemaContent(): string | null {
  if (
    typeof process !== "undefined" &&
    process.env.PRISMA_QUERY_BUILDER_SCHEMA_CONTENT
  ) {
    return process.env.PRISMA_QUERY_BUILDER_SCHEMA_CONTENT;
  }
  return null;
}

export function getEmbeddedDatabaseUrl(): string | null {
  if (typeof process !== "undefined" && process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }
  return null;
}

export function getEmbeddedConfig(): EmbeddedConfig {
  const searchParams =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search)
      : new URLSearchParams();

  const isEmbedded = isEmbeddedMode();
  return {
    isEmbedded,
    disablePersistence: shouldDisablePersistence(),
    schemaContent: getEmbeddedSchemaContent(),
    databaseUrl: getEmbeddedDatabaseUrl(),
    hideHeader: searchParams.get("hideHeader") === "true",
    hideWorkspaceManager:
      searchParams.get("hideWorkspaceManager") === "true" || isEmbedded
  };
}