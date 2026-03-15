import { json } from "@sveltejs/kit";
import { isEmbeddedMode } from "$lib/embedded-mode.js";

function persistenceDisabled(): boolean {
  const envDisabled = String(process.env.DISABLE_PERSISTENCE || "").toLowerCase() === "true";
  return envDisabled || isEmbeddedMode();
}

export async function GET({ url }) {
  if (persistenceDisabled()) {
    return json({ workspaces: [], total: 0, limit: 100, offset: 0, hasMore: false });
  }

  try {
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '100'), 100);
    const offset = parseInt(url.searchParams.get('offset') || '0');

    console.log("[workspace/list] Listing workspaces with limit:", limit, "offset:", offset);

    const { getQueriesDb } = await import("$lib/server/queries-db.js");
    const queriesDb = await getQueriesDb();

    const [workspaces, total] = await Promise.all([
      queriesDb.workspace.findMany({
        select: { id: true, name: true, createdAt: true, databaseUrl: true },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      queriesDb.workspace.count()
    ]);

    console.log("[workspace/list] Retrieved", workspaces.length, "workspaces. Total:", total);

    return json({
      workspaces,
      total,
      limit,
      offset,
      hasMore: offset + workspaces.length < total
    });
  } catch (error) {
    console.error("List workspaces error:", error);
    return json(
      { error: error instanceof Error ? error.message : "Failed to load workspaces" },
      { status: 500 }
    );
  }
}