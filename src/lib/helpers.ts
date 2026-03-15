export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function safeStringify(obj: unknown, indent = 2): string {
  const seen = new WeakSet();
  return JSON.stringify(
    obj,
    (key, value) => {
      if (typeof value === "object" && value !== null) {
        if (seen.has(value)) return "[Circular]";
        seen.add(value);
      }
      if (typeof value === "bigint") {
        return value.toString();
      }
      return value;
    },
    indent
  );
}

export function sanitizeForLog(str: string): string {
  return str.replace(/[\n\r]/g, ' ').slice(0, 200);
}

export function sanitizeError(error: unknown): string {
  if (!(error instanceof Error)) return "Internal server error";
  
  const safeErrors = [
    "Validation failed",
    "Operation not found",
    "Invalid payload",
    "Query timeout",
    "Workspace not found",
    "No database URL",
    "Schema provider",
    "does not exist"
  ];
  
  const message = error.message;
  if (safeErrors.some(safe => message.includes(safe))) {
    return message.replace(/[\r\n]/g, ' ').slice(0, 500);
  }
  
  return "Query execution failed. Please check your query and try again.";
}