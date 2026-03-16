import { json } from "@sveltejs/kit";
import {
  createWorkspace,
  transformSchemaForValidation
} from "$lib/server/workspace-manager.js";
import {
  cleanSchemaUrls,
  extractProviderFromSchema,
  isSupportedProvider,
  validateDatabaseUrl
} from "$lib/server/database-utils.js";
import { debug } from "$lib/server/debug.js";
import prismaInternals from "@prisma/internals";

const { getDMMF } = prismaInternals;

const MAX_SCHEMA_SIZE = 5 * 1024 * 1024;

export async function POST({ request }) {
  try {
    const contentLength = request.headers.get("content-length");
    if (contentLength && parseInt(contentLength) > MAX_SCHEMA_SIZE) {
      return json(
        { error: "Schema file too large (max 5MB)" },
        { status: 413 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("schema");
    const databaseUrlRaw = formData.get("databaseUrl");
    const name = formData.get("name") || `Workspace ${Date.now()}`;

    debug("workspace/create", "Workspace name:", name);

    if (!file || typeof file === "string") {
      return json(
        { error: "No schema file provided" },
        { status: 400 }
      );
    }

    if (file.size > MAX_SCHEMA_SIZE) {
      return json(
        { error: "Schema file too large (max 5MB)" },
        { status: 413 }
      );
    }

    const schemaContent = await file.text();

    let schemaProvider: string;
    try {
      schemaProvider = extractProviderFromSchema(schemaContent);
    } catch (e) {
      return json(
        { error: e instanceof Error ? e.message : "Invalid schema" },
        { status: 400 }
      );
    }

    if (!isSupportedProvider(schemaProvider)) {
      return json(
        {
          error: `Unsupported schema provider: ${schemaProvider}. Supported: postgresql, mysql, sqlite`
        },
        { status: 400 }
      );
    }

    const databaseUrl =
      typeof databaseUrlRaw === "string" && databaseUrlRaw.trim()
        ? databaseUrlRaw.trim()
        : null;

    if (databaseUrl) {
      const urlError = validateDatabaseUrl(databaseUrl, schemaProvider);
      if (urlError) {
        return json({ error: urlError }, { status: 400 });
      }
    }

    const cleanedSchema = cleanSchemaUrls(schemaContent);
    const transformedSchema = transformSchemaForValidation(cleanedSchema);

    try {
      await getDMMF({ datamodel: transformedSchema } as any);
    } catch (error) {
      return json(
        {
          error: `Invalid Prisma schema: ${error instanceof Error ? error.message : String(error)}`
        },
        { status: 400 }
      );
    }

    const workspace = await createWorkspace(
      typeof name === "string" ? name : `Workspace ${Date.now()}`,
      cleanedSchema,
      databaseUrl
    );

    debug("workspace/create", "Created:", workspace.id);

    return json({
      success: true,
      workspaceId: workspace.id,
      name: workspace.name
    });
  } catch (error) {
    console.error("[workspace/create] Error:", error);
    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to create workspace"
      },
      { status: 500 }
    );
  }
}