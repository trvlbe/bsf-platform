-- AlterTable: Campaign — replace spotifyUrl with creative layer fields
ALTER TABLE "Campaign" DROP COLUMN "spotifyUrl";
ALTER TABLE "Campaign" ADD COLUMN "musicUrl" TEXT;
ALTER TABLE "Campaign" ADD COLUMN "creativeBrief" TEXT;
ALTER TABLE "Campaign" ADD COLUMN "contentOrientation" TEXT NOT NULL DEFAULT 'VERTICAL';
ALTER TABLE "Campaign" ADD COLUMN "contentDuration" TEXT NOT NULL DEFAULT 'SHORT_FORM';
ALTER TABLE "Campaign" ADD COLUMN "contentResolution" TEXT NOT NULL DEFAULT '1080p';

-- Remove defaults after adding (they were only needed for existing rows)
ALTER TABLE "Campaign" ALTER COLUMN "contentOrientation" DROP DEFAULT;
ALTER TABLE "Campaign" ALTER COLUMN "contentDuration" DROP DEFAULT;
ALTER TABLE "Campaign" ALTER COLUMN "contentResolution" DROP DEFAULT;
