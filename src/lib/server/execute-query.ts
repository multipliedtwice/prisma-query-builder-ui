import type { DMMFParser } from "../dmmf-parser.js";
import { validateQueryState } from "../validate-query.js";
import type { Payload, QueryState } from "../types.js";
import { performance as perf } from "node:perf_hooks";
import {
  sanitizeForLog,
  isPlainObject,
  lowercaseFirst,
  sanitizeResultForJson,
  normalizePrismaPayload
} from "$lib/helpers.js";

export type ExecuteResult = {
  success: boolean;
  data?: unknown;
  error?: string;
  executionTime: number;
  warnings?: string[];
};

export type ExecuteOutput = {
  result: ExecuteResult;
  completion: Promise<void>;
};

const DEFAULT_QUERY_TIMEOUT_MS = 30000;
const QUERY_TIMEOUT_MS = parseInt(
  process.env.QUERY_TIMEOUT ?? String(DEFAULT_QUERY_TIMEOUT_MS)
);

function nowMs() {
  return globalThis.performance?.now?.() ?? perf.now();
}

export async function executeQueryOperation(
  client: any,
  parser: DMMFParser,
  model: string,
  method: string,
  payload: Payload,
  timeoutMs?: number
): Promise<ExecuteOutput> {
  const resolvedTimeout = timeoutMs ?? QUERY_TIMEOUT_MS;

  const operations = parser.getOperations();
  const operation = operations.find(
    (op) => op.model === model && op.method === method
  );

  if (!operation) {
    return {
      result: {
        success: false,
        error: `Operation ${sanitizeForLog(model)}.${sanitizeForLog(method)} not found`,
        executionTime: 0
      },
      completion: Promise.resolve()
    };
  }

  const safePayload = isPlainObject(payload) ? payload : {};
  const normalizedPayload = normalizePrismaPayload(safePayload);

  const queryState: QueryState = {
    operation,
    path: [],
    payload: normalizedPayload as any
  };

  const validation = validateQueryState(parser, queryState);
  const warnings: string[] = [];
  if (!validation.ok) {
    warnings.push(validation.error);
  }

  const delegateName = lowercaseFirst(model);
  const delegate = client?.[delegateName];

  if (!delegate) {
    return {
      result: {
        success: false,
        error: `Model "${sanitizeForLog(model)}" not found in Prisma client`,
        executionTime: 0
      },
      completion: Promise.resolve()
    };
  }

  const fn = delegate?.[method];

  if (typeof fn !== "function") {
    return {
      result: {
        success: false,
        error: `Method "${sanitizeForLog(method)}" not found on model "${sanitizeForLog(model)}"`,
        executionTime: 0
      },
      completion: Promise.resolve()
    };
  }

  const start = nowMs();
  const args =
    Object.keys(normalizedPayload).length > 0 ? normalizedPayload : undefined;

  let queryPromise: Promise<any>;
  let completion: Promise<void>;
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    queryPromise = fn.call(delegate, args);
    completion = queryPromise.then(
      () => {},
      () => {}
    );
  } catch (error) {
    const executionTime = nowMs() - start;
    return {
      result: {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        executionTime,
        warnings: warnings.length > 0 ? warnings : undefined
      },
      completion: Promise.resolve()
    };
  }

  try {
    const rawResult = await Promise.race([
      queryPromise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Query timeout")),
          resolvedTimeout
        );
      })
    ]);

    clearTimeout(timer!);
    const executionTime = nowMs() - start;

    return {
      result: {
        success: true,
        data: sanitizeResultForJson(rawResult),
        executionTime,
        warnings: warnings.length > 0 ? warnings : undefined
      },
      completion: Promise.resolve()
    };
  } catch (error) {
    clearTimeout(timer!);
    const executionTime = nowMs() - start;

    if (error instanceof Error && error.message === "Query timeout") {
      return {
        result: {
          success: false,
          error: `Query exceeded ${resolvedTimeout / 1000}s timeout. The database query may still be running.`,
          executionTime,
          warnings: warnings.length > 0 ? warnings : undefined
        },
        completion
      };
    }

    return {
      result: {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        executionTime,
        warnings: warnings.length > 0 ? warnings : undefined
      },
      completion: Promise.resolve()
    };
  }
}