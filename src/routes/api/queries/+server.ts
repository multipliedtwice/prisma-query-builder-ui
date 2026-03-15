import { json } from "@sveltejs/kit";
import { isEmbeddedMode } from "$lib/embedded-mode.js";

function persistenceDisabled(): boolean {
  const envDisabled = String(process.env.DISABLE_PERSISTENCE || "").toLowerCase() === "true";
  return envDisabled || isEmbeddedMode();
}

function normalizeWorkspaceId(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return t;
}

function safeString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export const GET = async ({ url }) => {
  if (persistenceDisabled()) {
    return json({ queries: [] });
  }

  const workspaceId = normalizeWorkspaceId(url.searchParams.get("workspaceId"));

  const { getQueriesDb } = await import("$lib/server/queries-db.js");
  const db = await getQueriesDb();

  const queries = await db.savedQuery.findMany({
    where: { workspaceId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      description: true,
      model: true,
      method: true,
      payload: true,
      workspaceId: true,
      createdAt: true,
      updatedAt: true
    }
  });

  return json({ queries });
};

export const POST = async ({ request }) => {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return json({ error: "Invalid body" }, { status: 400 });
  }

  if (persistenceDisabled()) {
    return json({ id: `temp-${Date.now()}` });
  }

  const name = safeString((body as any).name).trim();
  const model = safeString((body as any).model).trim();
  const method = safeString((body as any).method).trim();
  const payload = safeString((body as any).payload);
  const descriptionRaw = (body as any).description;
  const workspaceId = normalizeWorkspaceId((body as any).workspaceId);

  const description =
    typeof descriptionRaw === "string" && descriptionRaw.trim()
      ? descriptionRaw.trim()
      : null;

  if (!name || !model || !method) {
    return json({ error: "name, model, method are required" }, { status: 400 });
  }

  try {
    JSON.parse(payload || "{}");
  } catch {
    return json({ error: "payload must be valid JSON string" }, { status: 400 });
  }

  const { getQueriesDb } = await import("$lib/server/queries-db.js");
  const db = await getQueriesDb();

  const saved = await db.savedQuery.upsert({
    where: {
      workspaceId_name: {
        workspaceId,
        name
      }
    },
    create: {
      name,
      description,
      model,
      method,
      payload,
      workspaceId
    },
    update: {
      description,
      model,
      method,
      payload
    },
    select: { id: true }
  });

  return json(saved);
};
