import { json } from "@sveltejs/kit";
import { getWorkspaceDmmf } from "$lib/server/workspace-manager.js";

export async function GET({ params }) {
  try {
    const dmmf = await getWorkspaceDmmf(params.id);
    return json(dmmf);
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Failed to load DMMF" },
      { status: 500 }
    );
  }
}