-- CreateEnum
CREATE TYPE "EditorStatus" AS ENUM ('NOT_STARTED', 'PENDING', 'READY', 'FAILED');

-- AlterTable: add nullable first so existing rows don't block the ALTER
ALTER TABLE "Post" ADD COLUMN "directionBrief" TEXT;
ALTER TABLE "Post" ADD COLUMN "directionAccepted" TIMESTAMP(3);
ALTER TABLE "Post" ADD COLUMN "editorStatus" "EditorStatus" NOT NULL DEFAULT 'NOT_STARTED';
ALTER TABLE "Post" ADD COLUMN "editorPrompt" TEXT;
ALTER TABLE "Post" ADD COLUMN "editorReasoning" TEXT;

-- Backfill directionBrief from the existing assetNote content
UPDATE "Post" SET "directionBrief" = "assetNote" WHERE "directionBrief" IS NULL;

-- Backfill already-approved posts so the new gates don't retroactively block them
UPDATE "Post" SET "directionAccepted" = NOW(), "editorStatus" = 'READY' WHERE "approved" = true;

-- Now safe to enforce NOT NULL
ALTER TABLE "Post" ALTER COLUMN "directionBrief" SET NOT NULL;
