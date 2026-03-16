import { json } from "@sveltejs/kit";
import {
  getPrismaClient,
  getParserFromLocalSchema
} from "$lib/server/prisma.js";
import { executeQueryOperation } from "$lib/server/execute-query.js";
import { isPlainObject, sanitizeError } from "$lib/helpers.js";
import { debug } from "$lib/server/debug.js";

export async function POST({ request }) {
  try {
    const body = await request.json().catch(() => null);
    if (!isPlainObject(body)) {
      return json(
        { success: false, error: "Invalid JSON body", executionTime: 0 },
        { status: 400 }
      );
    }

    const { model, method, payload, usePrismaSql } = body as any;
    const shouldUsePrismaSql = usePrismaSql === true;

    if (typeof model !== "string" || !model.trim()) {
      return json(
        {
          success: false,
          error: "model must be a non-empty string",
          executionTime: 0
        },
        { status: 400 }
      );
    }
    if (typeof method !== "string" || !method.trim()) {
      return json(
        {
          success: false,
          error: "method must be a non-empty string",
          executionTime: 0
        },
        { status: 400 }
      );
    }
    if (payload !== undefined && !isPlainObject(payload)) {
      return json(
        {
          success: false,
          error: "payload must be an object",
          executionTime: 0
        },
        { status: 400 }
      );
    }

    debug(
      "execute",
      "Request:",
      model,
      method,
      "prisma-sql:",
      shouldUsePrismaSql
    );

    const { parser } = await getParserFromLocalSchema();

    const prisma = await getPrismaClient(shouldUsePrismaSql);
    const { result } = await executeQueryOperation(
      prisma,
      parser,
      model,
      method,
      (payload ?? {}) as any
    );

    return json(
      {
        ...result,
        usedPrismaSql: shouldUsePrismaSql
      },
      {
        status: result.success ? 200 : 400
      }
    );
  } catch (error) {
    console.error("[execute] Error:", error);
    return json(
      {
        success: false,
        error: sanitizeError(error),
        executionTime: 0
      },
      { status: 500 }
    );
  }
}