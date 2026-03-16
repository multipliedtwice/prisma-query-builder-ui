import { json } from "@sveltejs/kit";
import {
  deleteWorkspace,
  clearWorkspaceCache,
  getWorkspaceById
} from "$lib/server/workspace-manager.js";
import { getQueriesDb } from "$lib/server/queries-db.js";
import { validateDatabaseUrl } from "$lib/server/database-utils.js";

export async function DELETE({ params }) {
  try {
    const ok = await deleteWorkspace(params.id);
    if (!ok) {
      return json({ error: "Workspace not found" }, { status: 404 });
    }
    return json({ success: true });
  } catch (error) {
    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to delete workspace"
      },
      { status: 500 }
    );
  }
}

export async function PATCH({ params, request }) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return json({ error: "Invalid body" }, { status: 400 });
    }

    const workspace = await getWorkspaceById(params.id);
    if (!workspace) {
      return json({ error: "Workspace not found" }, { status: 404 });
    }

    const databaseUrlRaw = (body as any).databaseUrl;
    const databaseUrl =
      typeof databaseUrlRaw === "string" && databaseUrlRaw.trim()
        ? databaseUrlRaw.trim()
        : null;

    if (databaseUrl) {
      const urlError = validateDatabaseUrl(databaseUrl, workspace.provider);
      if (urlError) {
        return json({ error: urlError }, { status: 400 });
      }
    }

    const queriesDb = await getQueriesDb();
    const updated = await queriesDb.workspace.update({
      where: { id: params.id },
      data: { databaseUrl },
      select: { id: true, name: true }
    });

    clearWorkspaceCache(params.id);

    return json({ success: true, workspace: updated });
  } catch (error) {
    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to update workspace"
      },
      { status: 500 }
    );
  }
}