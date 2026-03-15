export function isEmbeddedMode(): boolean {
  // Priority 1: Vite environment variable (set at build/dev time)
  if (import.meta.env.VITE_PRISMA_QUERY_BUILDER_MODE === 'embedded') {
    console.log('[isEmbeddedMode] ✓ Detected via VITE_PRISMA_QUERY_BUILDER_MODE');
    return true;
  }
  
  // Priority 2: Runtime environment variable (Node.js)
  if (typeof process !== 'undefined' && process.env.PRISMA_QUERY_BUILDER_MODE === 'embedded') {
    console.log('[isEmbeddedMode] ✓ Detected via PRISMA_QUERY_BUILDER_MODE');
    return true;
  }
  
  // Priority 3: URL params (fallback for manual testing)
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    if (params.get('embedded') === 'true') {
      console.log('[isEmbeddedMode] ✓ Detected via URL param (fallback)');
      return true;
    }
  }
  
  console.log('[isEmbeddedMode] ✗ Not detected');
  return false;
}

export function shouldDisablePersistence(): boolean {
  // Priority 1: Vite environment variable
  if (import.meta.env.VITE_DISABLE_PERSISTENCE === 'true') {
    console.log('[shouldDisablePersistence] ✓ Via VITE_DISABLE_PERSISTENCE');
    return true;
  }
  
  // Priority 2: Runtime environment variable
  if (typeof process !== 'undefined' && process.env.DISABLE_PERSISTENCE === 'true') {
    console.log('[shouldDisablePersistence] ✓ Via DISABLE_PERSISTENCE');
    return true;
  }
  
  // Priority 3: URL params (fallback)
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    if (params.get('disablePersistence') === 'true') {
      console.log('[shouldDisablePersistence] ✓ Via URL param (fallback)');
      return true;
    }
  }
  
  return false;
}

export function isStandaloneMode(): boolean {
  return !isEmbeddedMode();
}

export function getEmbeddedSchemaContent(): string | null {
  if (typeof process !== 'undefined' && process.env.PRISMA_QUERY_BUILDER_SCHEMA_CONTENT) {
    return process.env.PRISMA_QUERY_BUILDER_SCHEMA_CONTENT;
  }
  return null;
}

export function getEmbeddedDatabaseUrl(): string | null {
  if (typeof process !== 'undefined' && process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }
  return null;
}

export interface EmbeddedConfig {
  isEmbedded: boolean;
  disablePersistence: boolean;
  schemaContent: string | null;
  databaseUrl: string | null;
  hideHeader: boolean;
  hideWorkspaceManager: boolean;
}

export function getEmbeddedConfig(): EmbeddedConfig {
  console.log('[getEmbeddedConfig] Starting detection...');
  console.log('[getEmbeddedConfig] VITE_PRISMA_QUERY_BUILDER_MODE:', import.meta.env.VITE_PRISMA_QUERY_BUILDER_MODE);
  console.log('[getEmbeddedConfig] VITE_DISABLE_PERSISTENCE:', import.meta.env.VITE_DISABLE_PERSISTENCE);
  
  const searchParams = typeof window !== 'undefined' 
    ? new URLSearchParams(window.location.search) 
    : new URLSearchParams();
  
  const isEmbedded = isEmbeddedMode();
  const config = {
    isEmbedded,
    disablePersistence: shouldDisablePersistence(),
    schemaContent: getEmbeddedSchemaContent(),
    databaseUrl: getEmbeddedDatabaseUrl(),
    hideHeader: searchParams.get('hideHeader') === 'true',
    hideWorkspaceManager: searchParams.get('hideWorkspaceManager') === 'true' || isEmbedded
  };
  
  console.log('[getEmbeddedConfig] Final config:', config);
  return config;
}