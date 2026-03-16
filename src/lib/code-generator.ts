import type { QueryState, PayloadValue } from "./types.ts";
import { normalizePrismaPayload } from "./helpers.ts";

const INITIAL_INDENT = 1;

const ESCAPE_MAP: Record<string, string> = {
  "\\": "\\\\",
  '"': '\\"',
  "\n": "\\n",
  "\r": "\\r",
  "\t": "\\t"
};

export function generateCode(state: QueryState): string {
  if (!state.operation) {
    return "";
  }

  const { operation, payload } = state;
  const modelName =
    operation.model.charAt(0).toLowerCase() + operation.model.slice(1);

  if (Object.keys(payload).length === 0) {
    return `await prisma.${modelName}.${operation.method}()`;
  }

  try {
    const normalizedPayload = normalizePrismaPayload(payload);
    const formattedPayload = formatPayload(
      normalizedPayload,
      INITIAL_INDENT,
      []
    );
    return `await prisma.${modelName}.${operation.method}(${formattedPayload})`;
  } catch (error) {
    return `// Error: ${error instanceof Error ? error.message : String(error)}`;
  }
}

function formatPayload(
  obj: PayloadValue,
  indent: number,
  stack: object[]
): string {
  if (obj === null) return "null";
  if (obj === undefined) return "undefined";

  if (typeof obj !== "object") {
    if (typeof obj === "string") {
      return `"${escapeString(obj)}"`;
    }
    return String(obj);
  }

  if (stack.includes(obj)) {
    throw new Error("Circular reference detected in payload");
  }

  const nextStack = [...stack, obj];

  if (Array.isArray(obj)) {
    if (obj.length === 0) return "[]";
    const items = obj.map((item) => formatPayload(item, indent + 1, nextStack));
    return `[\n${"  ".repeat(indent)}${items.join(`,\n${"  ".repeat(indent)}`)}\n${"  ".repeat(indent - 1)}]`;
  }

  const entries = Object.entries(obj).filter(([_, v]) => v !== undefined);
  if (entries.length === 0) return "{}";

  const lines = entries.map(([key, value]) => {
    const formattedValue = formatPayload(value as any, indent + 1, nextStack);
    const safeKey = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key)
      ? key
      : `"${escapeString(key)}"`;
    return `${"  ".repeat(indent)}${safeKey}: ${formattedValue}`;
  });

  return `{\n${lines.join(",\n")}\n${"  ".repeat(indent - 1)}}`;
}

function escapeString(str: string): string {
  return str.replace(/[\\"\n\r\t]/g, (match) => ESCAPE_MAP[match] || match);
}