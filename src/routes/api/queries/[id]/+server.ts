import { json } from "@sveltejs/kit";
import { isEmbeddedMode } from "$lib/embedded-mode.js";

function persistenceDisabled(): boolean {
  const envDisabled = String(process.env.DISABLE_PERSISTENCE || "").toLowerCase() === "true";
  return envDisabled || isEmbeddedMode();
}

function safeId(id: string): string {
  return String(id || "").trim();
}

export const DELETE = async ({ params }) => {
  if (persistenceDisabled()) {
    return json({ ok: true });
  }

  const id = safeId(params.id);
  if (!id) return json({ error: "Missing id" }, { status: 400 });

  const { getQueriesDb } = await import("$lib/server/queries-db.js");
  const db = await getQueriesDb();

  try {
    await db.savedQuery.delete({ where: { id } });
    return json({ ok: true });
  } catch {
    return json({ error: "Not found" }, { status: 404 });
  }
};
