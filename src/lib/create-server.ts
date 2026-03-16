import type { DMMFData, Payload } from "./types.ts";
import { createDMMFParser } from "./dmmf-parser.ts";
import { executeQueryOperation } from "./server/execute-query.js";

export type ServerConfig = {
  dmmf: DMMFData;
  prismaClient: any;
  queryTimeoutMs?: number;
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
  const timeoutMs = config.queryTimeoutMs;

  return async function execute(req: ExecuteRequest): Promise<ExecuteResponse> {
    const { result } = await executeQueryOperation(
      client,
      parser,
      req.model,
      req.method,
      req.payload,
      timeoutMs
    );
    return result;
  };
}

export function createApiHandlers(config: ServerConfig) {
  const execute = createQueryExecutor(config);

  return {
    getDmmf: () => config.dmmf,
    execute
  };
}