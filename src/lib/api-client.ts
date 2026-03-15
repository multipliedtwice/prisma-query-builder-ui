import type { QueryState } from "./types.js";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeQueryStateForTransport(queryState: QueryState): QueryState {
  const payload = queryState.payload ?? {};
  const orderBy = (payload as any).orderBy;

  if (orderBy === undefined) return queryState;

  let normalizedOrderBy: unknown = orderBy;

  if (isPlainObject(orderBy)) {
    normalizedOrderBy = [orderBy];
  } else if (Array.isArray(orderBy)) {
    normalizedOrderBy = orderBy;
  }

  const nextPayload = { ...payload, orderBy: normalizedOrderBy } as any;

  return {
    ...queryState,
    payload: nextPayload
  };
}

async function readErrorMessage(response: Response) {
  try {
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const body = await response.json();
      if (body && typeof body === "object" && "error" in body && typeof (body as any).error === "string") {
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
  const endpoint = workspaceId ? `/api/workspace/${workspaceId}/dmmf` : "/api/dmmf";

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
  const transportState = {
    model: queryState.operation?.model,
    method: queryState.operation?.method,
    payload: normalizeQueryStateForTransport(queryState).payload,
    usePrismaSql: usePrismaSql ?? false
  };

  const embedded = isEmbeddedModeClient();

  // Embedded mode uses its own client in .prisma-query-builder-temp/
  const endpoint = embedded ? "/api/execute" : workspaceId ? `/api/workspace/${workspaceId}/execute` : "/api/execute";

  console.log("Executing query:", {
    embedded,
    workspaceId,
    endpoint,
    model: transportState.model,
    method: transportState.method,
    usePrismaSql: transportState.usePrismaSql
  });

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

export async function updateWorkspace(workspaceId: string, databaseUrl: string | null): Promise<void> {
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