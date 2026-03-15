import { json } from "@sveltejs/kit";
import { getDmmf, getDmmfFromSchema } from "$lib/server/prisma.js";
import { isPlainObject } from "$lib/helpers.js";
import { isEmbeddedMode, getEmbeddedDatabaseUrl } from "$lib/embedded-mode.js";

export async function GET() {
  try {
    const dmmf = await getDmmf();
    
    const response: any = dmmf;
    
    if (isEmbeddedMode()) {
      const databaseUrl = getEmbeddedDatabaseUrl();
      response._embedded = {
        hasDatabaseUrl: databaseUrl !== null && databaseUrl.trim() !== ""
      };
    }
    
    return json(response, {
      headers: {
        'Cache-Control': 'no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Failed to load DMMF" },
      { status: 500 }
    );
  }
}

export async function POST({ request }) {
  try {
    const body = await request.json().catch(() => null);
    if (!isPlainObject(body) || typeof body.schema !== "string" || !body.schema.trim()) {
      return json({ error: "schema is required" }, { status: 400 });
    }

    const dmmf = await getDmmfFromSchema(body.schema);
    return json(dmmf, {
      headers: {
        'Cache-Control': 'no-store, must-revalidate'
      }
    });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Failed to load DMMF" },
      { status: 500 }
    );
  }
}