import type { QueryState } from "./types.ts";

export type SavedQuery = {
  id: string;
  name: string;
  description: string | null;
  model: string;
  method: string;
  payload: string;
  workspaceId: string | null;
  createdAt: string;
  updatedAt: string;
};

function toWorkspaceParam(workspaceId: string | null): string {
  return workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : "";
}

export async function saveQuery(
  name: string,
  queryState: QueryState,
  workspaceId: string | null,
  description?: string | null
) {
  const response = await fetch("/api/queries", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      description: description ?? null,
      model: queryState.operation?.model,
      method: queryState.operation?.method,
      payload: JSON.stringify(queryState.payload),
      workspaceId
    })
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error((data as any).error || "Failed to save query");
  }

  return response.json() as Promise<{ id: string }>;
}

export async function loadQueries(workspaceId: string | null): Promise<SavedQuery[]> {
  const response = await fetch(`/api/queries${toWorkspaceParam(workspaceId)}`);
  if (!response.ok) throw new Error("Failed to load queries");

  const data = await response.json().catch(() => ({}));
  return (data.queries ?? []) as SavedQuery[];
}

export async function deleteQuery(id: string) {
  const response = await fetch(`/api/queries/${id}`, { method: "DELETE" });
  if (!response.ok) throw new Error("Failed to delete query");
}
