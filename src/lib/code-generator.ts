import type { QueryState, PayloadValue } from "./types.ts";

const INITIAL_INDENT = 1;

const ESCAPE_MAP: Record<string, string> = {
  "\\": "\\\\",
  '"': '\\"',
  "\n": "\\n",
  "\r": "\\r",
  "\t": "\\t"
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizePayloadForCode(payload: Record<string, PayloadValue>): Record<string, PayloadValue> {
  const orderBy = (payload as any).orderBy;

  if (orderBy === undefined) return payload;

  if (isPlainObject(orderBy)) {
    return { ...payload, orderBy: [orderBy] as any };
  }

  return payload;
}

export function generateCode(state: QueryState): string {
  if (!state.operation) {
    return "";
  }

  const { operation, payload } = state;
  const modelName = operation.model.charAt(0).toLowerCase() + operation.model.slice(1);

  if (Object.keys(payload).length === 0) {
    return `await prisma.${modelName}.${operation.method}()`;
  }

  try {
    const seen = new WeakSet<object>();
    const normalizedPayload = normalizePayloadForCode(payload);
    const formattedPayload = formatPayload(normalizedPayload, INITIAL_INDENT, seen);
    return `await prisma.${modelName}.${operation.method}(${formattedPayload})`;
  } catch (error) {
    return `// Error: ${error instanceof Error ? error.message : String(error)}`;
  }
}

function formatPayload(obj: PayloadValue, indent: number, seen: WeakSet<object>): string {
  if (obj === null) return "null";
  if (obj === undefined) return "undefined";

  if (typeof obj !== "object") {
    if (typeof obj === "string") {
      return `"${escapeString(obj)}"`;
    }
    return String(obj);
  }

  if (seen.has(obj)) {
    throw new Error("Circular reference detected in payload");
  }
  seen.add(obj);

  if (Array.isArray(obj)) {
    if (obj.length === 0) return "[]";
    const items = obj.map((item) => formatPayload(item, indent + 1, seen));
    return `[\n${"  ".repeat(indent)}${items.join(`,\n${"  ".repeat(indent)}`)}\n${"  ".repeat(indent - 1)}]`;
  }

  const entries = Object.entries(obj).filter(([_, v]) => v !== undefined);
  if (entries.length === 0) return "{}";

  const lines = entries.map(([key, value]) => {
    const formattedValue = formatPayload(value as any, indent + 1, seen);
    const safeKey = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key) ? key : `"${escapeString(key)}"`;
    return `${"  ".repeat(indent)}${safeKey}: ${formattedValue}`;
  });

  return `{\n${lines.join(",\n")}\n${"  ".repeat(indent - 1)}}`;
}

function escapeString(str: string): string {
  return str.replace(/[\\"\n\r\t]/g, (match) => ESCAPE_MAP[match] || match);
}
