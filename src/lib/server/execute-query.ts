import type { DMMFParser } from "../dmmf-parser.js";
import { validateQueryState } from "../validate-query.js";
import type { Payload, QueryState } from "../types.js";
import { performance as perf } from "node:perf_hooks";
import { sanitizeForLog, isPlainObject } from "$lib/helpers.js";


type ExecuteResult = {
  success: boolean;
  data?: unknown;
  error?: string;
  executionTime: number;
};

const QUERY_TIMEOUT_MS = parseInt(process.env.QUERY_TIMEOUT ?? '30000');

function nowMs() {
  return (globalThis.performance?.now?.() ?? perf.now());
}

async function executeWithTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number
): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('Query timeout')), timeoutMs)
    )
  ]);
}

export async function executeQueryOperation(
  client: any,
  parser: DMMFParser,
  model: string,
  method: string,
  payload: Payload
): Promise<ExecuteResult> {
  const operations = parser.getOperations();
  const operation = operations.find((op) => op.model === model && op.method === method);

  if (!operation) {
    return { 
      success: false, 
      error: `Operation ${sanitizeForLog(model)}.${sanitizeForLog(method)} not found`, 
      executionTime: 0 
    };
  }

  const safePayload = isPlainObject(payload) ? payload : {};

  const normalizedPayload = normalizePayloadForPrisma(safePayload);

  const queryState: QueryState = {
    operation,
    path: [],
    payload: normalizedPayload as any,
  };

  const validation = validateQueryState(parser, queryState);
  if (!validation.ok) {
    return { success: false, error: validation.error, executionTime: 0 };
  }

  const delegate = client?.[model];

  console.log("[executeQuery] ModelName for client:", model);

  if (!delegate) {
    return { 
      success: false, 
      error: `Model "${sanitizeForLog(model)}" not found in Prisma client`, 
      executionTime: 0 
    };
  }

  const fn = delegate?.[method];

  if (typeof fn !== "function") {
    return { 
      success: false, 
      error: `Method "${sanitizeForLog(method)}" not found on model "${sanitizeForLog(model)}"`, 
      executionTime: 0 
    };
  }

  const start = nowMs();

  try {
    const args = Object.keys(normalizedPayload).length > 0 ? normalizedPayload : undefined;
    
    console.log("[executeQuery] Calling:", `${model}.${method}`, "with args:", JSON.stringify(args)?.substring(0, 200));

    const result = await executeWithTimeout(
      () => fn.call(delegate, args),
      QUERY_TIMEOUT_MS
    );

    const executionTime = nowMs() - start;
    
    console.log("[executeQuery] Success, rows:", Array.isArray(result) ? result.length : 'N/A');
    
    return { success: true, data: result, executionTime };
  } catch (error) {
    const executionTime = nowMs() - start;
    
    console.error("[executeQuery] Error:", error);
    
    if (error instanceof Error && error.message === 'Query timeout') {
      return {
        success: false,
        error: `Query exceeded ${QUERY_TIMEOUT_MS / 1000}s timeout`,
        executionTime
      };
    }
    
    return { 
      success: false, 
      error: error instanceof Error ? error.message : String(error), 
      executionTime 
    };
  }
}

function normalizePayloadForPrisma(payload: Record<string, any>): Record<string, any> {
  const normalized = { ...payload };

  if ('distinct' in normalized && typeof normalized.distinct === 'string') {
    normalized.distinct = [normalized.distinct];
  }

  return normalized;
}