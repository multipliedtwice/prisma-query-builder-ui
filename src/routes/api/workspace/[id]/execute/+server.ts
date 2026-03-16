import { json } from "@sveltejs/kit";
import {
  getWorkspaceClient,
  getWorkspaceById,
  getWorkspaceDmmf,
  incrementActiveQueries,
  decrementActiveQueries
} from "$lib/server/workspace-manager.js";
import { createDMMFParser } from "$lib/dmmf-parser.js";
import { executeQueryOperation } from "$lib/server/execute-query.js";
import { isPlainObject, sanitizeError } from "$lib/helpers.js";
import { debug } from "$lib/server/debug.js";

export async function POST({ params, request }) {
  const workspaceId = params.id;
  let shouldUsePrismaSql = false;
  let incremented = false;

  try {
    const workspace = await getWorkspaceById(workspaceId);
    if (!workspace) {
      return json(
        {
          success: false,
          error: "Workspace not found",
          executionTime: 0
        },
        { status: 404 }
      );
    }

    if (!workspace.databaseUrl) {
      return json(
        {
          success: false,
          error:
            "Workspace has no databaseUrl. Add one to execute queries.",
          executionTime: 0
        },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => null);
    if (!isPlainObject(body)) {
      return json(
        {
          success: false,
          error: "Invalid request body",
          executionTime: 0
        },
        { status: 400 }
      );
    }

    const { model, method, payload, usePrismaSql } = body as any;
    shouldUsePrismaSql = usePrismaSql === true;

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

    debug(
      "workspace/execute",
      "Request:",
      model,
      method,
      "prisma-sql:",
      shouldUsePrismaSql
    );

    const dmmf = await getWorkspaceDmmf(workspaceId, workspace);
    const parser = createDMMFParser(dmmf);

    const client = await getWorkspaceClient(workspaceId, shouldUsePrismaSql);

    await incrementActiveQueries(workspaceId, shouldUsePrismaSql);
    incremented = true;

    const { result, completion } = await executeQueryOperation(
      client,
      parser,
      model,
      method,
      payload ?? {}
    );

    completion.then(
      () => decrementActiveQueries(workspaceId, shouldUsePrismaSql),
      () => decrementActiveQueries(workspaceId, shouldUsePrismaSql)
    );
    incremented = false;

    const canUsePrismaSql =
      workspace.provider === "postgresql" ||
      workspace.provider === "sqlite";
    const usedPrismaSql = shouldUsePrismaSql && canUsePrismaSql;

    return json(
      {
        ...result,
        usedPrismaSql
      },
      {
        status: result.success ? 200 : 400,
        headers: { "Cache-Control": "no-store, must-revalidate" }
      }
    );
  } catch (error) {
    console.error("[workspace/execute] Error:", error);
    return json(
      { success: false, error: sanitizeError(error), executionTime: 0 },
      { status: 500 }
    );
  } finally {
    if (incremented) {
      decrementActiveQueries(workspaceId, shouldUsePrismaSql);
    }
  }
}