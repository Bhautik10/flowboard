ALTER TABLE "User"
ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "defaultWorkspaceId" TEXT;

CREATE INDEX "User_defaultWorkspaceId_idx" ON "User"("defaultWorkspaceId");

ALTER TABLE "User"
ADD CONSTRAINT "User_defaultWorkspaceId_fkey"
FOREIGN KEY ("defaultWorkspaceId") REFERENCES "Workspace"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
