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

export function sanitizeResultForJson(data: unknown): unknown {
  if (data === null || data === undefined) return data;
  if (typeof data === "bigint") return data.toString();
  if (
    typeof data === "number" ||
    typeof data === "string" ||
    typeof data === "boolean"
  )
    return data;
  if (data instanceof Date) return data.toISOString();
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(data))
    return (data as Buffer).toString("base64");
  if (typeof (data as any).toJSON === "function") return (data as any).toJSON();
  if (Array.isArray(data)) return data.map(sanitizeResultForJson);
  if (typeof data === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(
      data as Record<string, unknown>
    )) {
      result[key] = sanitizeResultForJson(value);
    }
    return result;
  }
  return String(data);
}

export function sanitizeForLog(str: string): string {
  return str.replace(/[\n\r]/g, " ").slice(0, 200);
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
  if (safeErrors.some((safe) => message.includes(safe))) {
    return message.replace(/[\r\n]/g, " ").slice(0, 500);
  }

  return "Query execution failed. Please check your query and try again.";
}

export function lowercaseFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

export function formatDate(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return date.toLocaleDateString();
}

export function normalizePrismaPayload(
  payload: Record<string, any>
): Record<string, any> {
  const normalized = { ...payload };

  if ("distinct" in normalized && typeof normalized.distinct === "string") {
    normalized.distinct = [normalized.distinct];
  }

  if ("orderBy" in normalized && isPlainObject(normalized.orderBy)) {
    normalized.orderBy = [normalized.orderBy];
  }

  return normalized;
}

export function parseLooseJson(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return {};

  try {
    return JSON.parse(trimmed);
  } catch {}

  try {
    const fn = new Function("return (\n" + trimmed + "\n)");
    const result = fn();
    JSON.stringify(result);
    return result;
  } catch {}

  throw new Error("Could not parse as JSON or JavaScript object");
}