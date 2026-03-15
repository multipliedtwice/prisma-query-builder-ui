import type { DMMFData, Payload } from "./types.ts";
import { createDMMFParser } from "./dmmf-parser.ts";
import { validateQueryState } from "./validate-query.ts";

export type ServerConfig = {
  dmmf: DMMFData;
  prismaClient: any;
};

export type ExecuteRequest = {
  model: string;
  method: string;
  payload: Payload;
};

export type ExecuteResponse = {
  success: boolean;
  data?: unknown;
  error?: string;
  executionTime: number;
};

export function createQueryExecutor(config: ServerConfig) {
  const parser = createDMMFParser(config.dmmf);
  const client = config.prismaClient;

  return async function execute(req: ExecuteRequest): Promise<ExecuteResponse> {
    const { model, method, payload } = req;

    const operations = parser.getOperations();
    const operation = operations.find(
      (op) => op.model === model && op.method === method
    );

    if (!operation) {
      return {
        success: false,
        error: `Operation ${model}.${method} not found`,
        executionTime: 0,
      };
    }

    const queryState = { operation, path: [], payload };
    const validation = validateQueryState(parser, queryState);

    if (!validation.ok) {
      return {
        success: false,
        error: validation.error,
        executionTime: 0,
      };
    }

    const modelName = model.charAt(0).toLowerCase() + model.slice(1);
    const delegate = client[modelName];

    if (!delegate || typeof delegate[method] !== "function") {
      return {
        success: false,
        error: `Method ${model}.${method} not available`,
        executionTime: 0,
      };
    }

    const start = performance.now();

    try {
      const args = Object.keys(payload).length > 0 ? payload : undefined;
      const result = await delegate[method](args);
      return {
        success: true,
        data: result,
        executionTime: performance.now() - start,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        executionTime: performance.now() - start,
      };
    }
  };
}

export function createApiHandlers(config: ServerConfig) {
  const execute = createQueryExecutor(config);

  return {
    getDmmf: () => config.dmmf,
    execute,
  };
}