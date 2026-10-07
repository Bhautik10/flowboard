ALTER TYPE "WorkspaceRole" ADD VALUE IF NOT EXISTS 'CLIENT';
ALTER TYPE "BoardMemberRole" ADD VALUE IF NOT EXISTS 'CLIENT';

CREATE TYPE "CardVisibility" AS ENUM ('INTERNAL', 'CLIENT_VISIBLE');
CREATE TYPE "CommentVisibility" AS ENUM ('INTERNAL', 'CLIENT');
CREATE TYPE "CardApprovalStatus" AS ENUM ('NONE', 'PENDING', 'APPROVED', 'CHANGES_REQUESTED');

ALTER TABLE "Card"
  ADD COLUMN "visibility" "CardVisibility" NOT NULL DEFAULT 'INTERNAL',
  ADD COLUMN "approvalStatus" "CardApprovalStatus" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "revisionRound" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Comment"
  ADD COLUMN "authorLabel" TEXT,
  ADD COLUMN "visibility" "CommentVisibility" NOT NULL DEFAULT 'INTERNAL',
  ALTER COLUMN "authorId" DROP NOT NULL;
ALTER TABLE "Comment" DROP CONSTRAINT "Comment_authorId_fkey";
ALTER TABLE "Comment"
  ADD CONSTRAINT "Comment_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Attachment"
  ADD COLUMN "versionGroupId" TEXT,
  ADD COLUMN "versionNumber" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "isCurrentVersion" BOOLEAN NOT NULL DEFAULT TRUE,
  ALTER COLUMN "uploadedById" DROP NOT NULL;
ALTER TABLE "Attachment" DROP CONSTRAINT "Attachment_uploadedById_fkey";
ALTER TABLE "Attachment"
  ADD CONSTRAINT "Attachment_uploadedById_fkey"
  FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Attachment_versionGroupId_versionNumber_idx" ON "Attachment"("versionGroupId", "versionNumber");

ALTER TABLE "Activity"
  ADD COLUMN "actorLabel" TEXT,
  ALTER COLUMN "actorId" DROP NOT NULL;
ALTER TABLE "Activity" DROP CONSTRAINT "Activity_actorId_fkey";
ALTER TABLE "Activity"
  ADD CONSTRAINT "Activity_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ClientShareLink" (
  "id" TEXT NOT NULL,
  "boardId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "clientName" TEXT,
  "clientEmail" TEXT,
  "expiresAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClientShareLink_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ClientShareLink_tokenHash_key" ON "ClientShareLink"("tokenHash");
CREATE INDEX "ClientShareLink_boardId_revokedAt_idx" ON "ClientShareLink"("boardId", "revokedAt");
CREATE INDEX "ClientShareLink_expiresAt_idx" ON "ClientShareLink"("expiresAt");
ALTER TABLE "ClientShareLink"
  ADD CONSTRAINT "ClientShareLink_boardId_fkey"
  FOREIGN KEY ("boardId") REFERENCES "Board"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ClientShareLink_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "DesignPin" (
  "id" TEXT NOT NULL,
  "attachmentId" TEXT NOT NULL,
  "authorId" TEXT,
  "authorLabel" TEXT,
  "body" TEXT NOT NULL,
  "x" DOUBLE PRECISION NOT NULL,
  "y" DOUBLE PRECISION NOT NULL,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DesignPin_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DesignPin_attachmentId_createdAt_idx" ON "DesignPin"("attachmentId", "createdAt");
ALTER TABLE "DesignPin"
  ADD CONSTRAINT "DesignPin_attachmentId_fkey"
  FOREIGN KEY ("attachmentId") REFERENCES "Attachment"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "DesignPin_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
