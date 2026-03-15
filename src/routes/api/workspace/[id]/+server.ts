import { json } from "@sveltejs/kit";
import { deleteWorkspace } from "$lib/server/workspace-manager.js";
import { getQueriesDb } from "$lib/server/queries-db.js";

export async function DELETE({ params }) {
  try {
    const ok = await deleteWorkspace(params.id);
    if (!ok) {
      return json({ error: "Workspace not found" }, { status: 404 });
    }
    return json({ success: true });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Failed to delete workspace" },
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

    const databaseUrlRaw = (body as any).databaseUrl;
    const databaseUrl =
      typeof databaseUrlRaw === "string" && databaseUrlRaw.trim()
        ? databaseUrlRaw.trim()
        : null;

    if (databaseUrl) {
      const urlPattern = /^(postgresql|postgres|mysql|sqlite|sqlserver|mongodb|cockroachdb):\/\/.+|^file:.+/i;
      if (!urlPattern.test(databaseUrl)) {
        return json({ error: "Invalid database URL format" }, { status: 400 });
      }
      
      if (databaseUrl.includes('`') || databaseUrl.includes(';') || databaseUrl.includes('|')) {
        return json({ error: "Database URL contains invalid characters" }, { status: 400 });
      }
    }

    const queriesDb = await getQueriesDb();
    const workspace = await queriesDb.workspace.update({
      where: { id: params.id },
      data: { databaseUrl },
      select: { id: true, name: true, databaseUrl: true }
    });

    return json({ success: true, workspace });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Failed to update workspace" },
      { status: 500 }
    );
  }
}