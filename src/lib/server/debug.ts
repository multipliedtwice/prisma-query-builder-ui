const DEBUG =
  typeof process !== "undefined" &&
  process.env.PRISMA_QUERY_BUILDER_DEBUG === "true";

export function debug(label: string, ...args: any[]) {
  if (DEBUG) console.log(`[${label}]`, ...args);
}

export function debugWarn(label: string, ...args: any[]) {
  if (DEBUG) console.warn(`[${label}]`, ...args);
}