import type { QueryState } from "./types.js";
import { normalizePrismaPayload } from "./helpers.js";

async function readErrorMessage(response: Response) {
  try {
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const body = await response.json();
      if (
        body &&
        typeof body === "object" &&
        "error" in body &&
        typeof (body as any).error === "string"
      ) {
        return (body as any).error;
      }
      return JSON.stringify(body);
    }
    return await response.text();
  } catch {
    return `HTTP ${response.status}`;
  }
}

function isEmbeddedModeClient(): boolean {
  const mode = (import.meta as any).env?.VITE_PRISMA_QUERY_BUILDER_MODE;
  return String(mode || "").toLowerCase() === "embedded";
}

export async function fetchDmmf(workspaceId?: string) {
  const endpoint = workspaceId
    ? `/api/workspace/${workspaceId}/dmmf`
    : "/api/dmmf";

  const response = await fetch(endpoint);
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  return response.json();
}

export async function executeQuery(
  queryState: QueryState,
  workspaceId?: string,
  usePrismaSql?: boolean
) {
  const normalized = normalizePrismaPayload(
    (queryState.payload ?? {}) as Record<string, any>
  );

  const transportState = {
    model: queryState.operation?.model,
    method: queryState.operation?.method,
    payload: normalized,
    usePrismaSql: usePrismaSql ?? false
  };

  const embedded = isEmbeddedModeClient();

  const endpoint = embedded
    ? "/api/execute"
    : workspaceId
      ? `/api/workspace/${workspaceId}/execute`
      : "/api/execute";

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(transportState)
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return response.json();
}

export async function deleteWorkspace(workspaceId: string) {
  const response = await fetch(`/api/workspace/${workspaceId}`, {
    method: "DELETE"
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return response.json();
}

export async function updateWorkspace(
  workspaceId: string,
  databaseUrl: string | null
): Promise<void> {
  const response = await fetch(`/api/workspace/${workspaceId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ databaseUrl })
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error((data as any).error || "Failed to update workspace");
  }
}