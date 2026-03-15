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

export async function POST({ params, request }) {
  const workspaceId = params.id;
  let didIncrement = false;

  try {
    const workspace = await getWorkspaceById(workspaceId);
    if (!workspace) {
      return json({ success: false, error: "Workspace not found", executionTime: 0 }, { status: 404 });
    }

    if (!workspace.databaseUrl) {
      return json(
        { success: false, error: "Workspace has no databaseUrl. Add one to execute queries.", executionTime: 0 },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => null);
    if (!isPlainObject(body)) {
      return json({ success: false, error: "Invalid request body", executionTime: 0 }, { status: 400 });
    }

    const { model, method, payload, usePrismaSql } = body as any;
    const shouldUsePrismaSql = usePrismaSql === true;

    console.log("[workspace/execute] Request:", { 
      model, 
      method, 
      payload: JSON.stringify(payload), 
      usePrismaSql: shouldUsePrismaSql 
    });
    console.log("[workspace/execute] Workspace provider:", workspace.provider);
    console.log("[workspace/execute] Database URL:", workspace.databaseUrl?.substring(0, 30) + "...");

    const dmmf = await getWorkspaceDmmf(workspaceId);
    const parser = createDMMFParser(dmmf);

    const client = await getWorkspaceClient(workspaceId, shouldUsePrismaSql);
    
    console.log("[workspace/execute] Client obtained, testing connection...");
    try {
      await client.$queryRaw`SELECT 1 as test`;
      console.log("[workspace/execute] Connection test passed");
    } catch (e) {
      console.error("[workspace/execute] Connection test failed:", e);
    }

    await incrementActiveQueries(workspaceId);
    didIncrement = true;

    try {
      const result = await executeQueryOperation(client, parser, model, method, payload ?? {});
      
      const canUsePrismaSql = workspace.provider === 'postgresql' || workspace.provider === 'sqlite';
      const usedPrismaSql = shouldUsePrismaSql && canUsePrismaSql;
      
      console.log("[workspace/execute] Execution complete:", {
        success: result.success,
        usedPrismaSql,
        canUsePrismaSql,
        shouldUsePrismaSql
      });
      
      return json({
        ...result,
        usedPrismaSql
      }, {
        status: result.success ? 200 : 400,
        headers: { "Cache-Control": "no-store, must-revalidate" }
      });
    } finally {
      if (didIncrement) {
        await decrementActiveQueries(workspaceId);
        didIncrement = false;
      }
    }
  } catch (error) {
    console.error("[workspace/execute] Error:", error);
    return json(
      { success: false, error: sanitizeError(error), executionTime: 0 },
      { status: 500 }
    );
  }
}