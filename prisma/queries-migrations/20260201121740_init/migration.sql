-- CreateTable
CREATE TABLE "SavedQuery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "model" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "workspaceId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SavedQuery_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "schemaContent" TEXT NOT NULL,
    "databaseUrl" TEXT,
    "provider" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "SavedQuery_workspaceId_createdAt_idx" ON "SavedQuery"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "SavedQuery_model_method_idx" ON "SavedQuery"("model", "method");

-- CreateIndex
CREATE UNIQUE INDEX "SavedQuery_workspaceId_name_key" ON "SavedQuery"("workspaceId", "name");
