import { json } from "@sveltejs/kit";
import { createWorkspace, transformSchemaForValidation } from "$lib/server/workspace-manager.js";
import prismaInternals from "@prisma/internals";

const { getDMMF } = prismaInternals;

const MAX_SCHEMA_SIZE = 5 * 1024 * 1024;

export async function POST({ request }) {
  try {
    console.log("[workspace/create] Starting schema upload");
    
    const contentLength = request.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > MAX_SCHEMA_SIZE) {
      console.warn("[workspace/create] Schema too large (content-length):", parseInt(contentLength));
      return json({ error: 'Schema file too large (max 5MB)' }, { status: 413 });
    }
    
    const formData = await request.formData();
    const file = formData.get("schema");
    const databaseUrlRaw = formData.get("databaseUrl");
    const name = formData.get("name") || `Workspace ${Date.now()}`;

    console.log("[workspace/create] Received workspace name:", name);

    if (!file || typeof file === "string") {
      console.error("[workspace/create] No schema file provided");
      return json({ error: "No schema file provided" }, { status: 400 });
    }

    if (file.size > MAX_SCHEMA_SIZE) {
      console.warn("[workspace/create] Schema too large (file size):", file.size);
      return json({ error: 'Schema file too large (max 5MB)' }, { status: 413 });
    }

    const databaseUrl =
      typeof databaseUrlRaw === "string" && databaseUrlRaw.trim()
        ? databaseUrlRaw.trim()
        : null;

    console.log("[workspace/create] Database URL provided:", databaseUrl ? "yes" : "no");

    if (databaseUrl) {
      const urlPattern = /^(postgresql|postgres|mysql|sqlite|sqlserver|mongodb|cockroachdb):\/\/.+|^file:.+/i;
      if (!urlPattern.test(databaseUrl)) {
        console.error("[workspace/create] Invalid database URL format:", databaseUrl);
        return json(
          {
            error:
              "Invalid database URL format. Expected: postgresql://, mysql://, sqlite://, file:, etc.",
          },
          { status: 400 }
        );
      }
      
      if (databaseUrl.includes('`') || databaseUrl.includes(';') || databaseUrl.includes('|')) {
        console.error("[workspace/create] Database URL contains unsafe characters");
        return json(
          { error: "Database URL contains invalid characters (backticks, semicolons, or pipes not allowed)" },
          { status: 400 }
        );
      }
    }

    const schemaContent = await file.text();
    console.log("[workspace/create] Schema content length:", schemaContent.length);

    // FIXED: Clean schema before validation
    const cleanedSchema = schemaContent.replace(
      /(datasource\s+\w+\s*\{[^}]*?)(?:url|directUrl)\s*=\s*[^\n]+\n/g,
      '$1'
    );

    const transformedSchema = transformSchemaForValidation(cleanedSchema);
    console.log("[workspace/create] Schema transformed for validation");

    try {
      console.log("[workspace/create] Validating schema with getDMMF...");
      await getDMMF({ datamodel: transformedSchema } as any);
      console.log("[workspace/create] Schema validation passed");
    } catch (error) {
      console.error("[workspace/create] Schema validation failed:", error);
      return json(
        {
          error: `Invalid Prisma schema: ${error instanceof Error ? error.message : String(error)}`,
        },
        { status: 400 }
      );
    }

    console.log("[workspace/create] Creating workspace...");
    const workspace = await createWorkspace(
      typeof name === "string" ? name : `Workspace ${Date.now()}`,
      cleanedSchema,  // Pass cleaned schema
      databaseUrl
    );

    console.log("[workspace/create] Workspace created successfully:", workspace.id);
    console.log("[workspace/create] Database URL in workspace:", workspace.databaseUrl ? "yes" : "no");

    return json({
      success: true,
      workspaceId: workspace.id,
      name: workspace.name,
    });
  } catch (error) {
    console.error("[workspace/create] Unexpected error:", error);
    return json(
      { error: error instanceof Error ? error.message : "Failed to create workspace" },
      { status: 500 }
    );
  }
}