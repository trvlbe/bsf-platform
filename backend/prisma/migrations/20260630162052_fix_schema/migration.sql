-- AlterTable: User — add accessToken, refreshToken, updatedAt
ALTER TABLE "User" ADD COLUMN "accessToken" TEXT;
ALTER TABLE "User" ADD COLUMN "refreshToken" TEXT;
ALTER TABLE "User" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable: Campaign — change platforms TEXT[] -> Platform[], add new fields, updatedAt
ALTER TABLE "Campaign" ADD COLUMN "spotifyUrl" TEXT;
ALTER TABLE "Campaign" ADD COLUMN "lyricsDocUrl" TEXT;
ALTER TABLE "Campaign" ADD COLUMN "lyricsMarkdown" TEXT;
ALTER TABLE "Campaign" ADD COLUMN "preReleaseDays" INTEGER NOT NULL DEFAULT 14;
ALTER TABLE "Campaign" ADD COLUMN "postReleaseDays" INTEGER NOT NULL DEFAULT 14;
ALTER TABLE "Campaign" ADD COLUMN "videoEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Campaign" ADD COLUMN "videoStyle" TEXT;
ALTER TABLE "Campaign" ADD COLUMN "videoSourceImage" TEXT;
ALTER TABLE "Campaign" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Convert platforms from TEXT[] to Platform[] enum array
ALTER TABLE "Campaign" ALTER COLUMN "platforms" TYPE "Platform"[] USING "platforms"::text::"Platform"[];

-- AlterTable: Post — make videoStatus nullable (drop default + not null), add new fields, updatedAt
ALTER TABLE "Post" ALTER COLUMN "videoStatus" DROP DEFAULT;
ALTER TABLE "Post" ALTER COLUMN "videoStatus" DROP NOT NULL;
ALTER TABLE "Post" ADD COLUMN "videoJobId" TEXT;
ALTER TABLE "Post" ADD COLUMN "videoUrl" TEXT;
ALTER TABLE "Post" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable: CampaignArc — drop old fields, add new fields, add unique constraint
ALTER TABLE "CampaignArc" DROP COLUMN "title";
ALTER TABLE "CampaignArc" DROP COLUMN "body";
ALTER TABLE "CampaignArc" ADD COLUMN "preTheme" TEXT NOT NULL DEFAULT '';
ALTER TABLE "CampaignArc" ADD COLUMN "dropDayTheme" TEXT NOT NULL DEFAULT '';
ALTER TABLE "CampaignArc" ADD COLUMN "postTheme" TEXT NOT NULL DEFAULT '';
ALTER TABLE "CampaignArc" ADD COLUMN "motifs" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "CampaignArc" ADD COLUMN "rawJson" TEXT NOT NULL DEFAULT '';

-- Remove defaults after adding (they were only needed for existing rows)
ALTER TABLE "CampaignArc" ALTER COLUMN "preTheme" DROP DEFAULT;
ALTER TABLE "CampaignArc" ALTER COLUMN "dropDayTheme" DROP DEFAULT;
ALTER TABLE "CampaignArc" ALTER COLUMN "postTheme" DROP DEFAULT;
ALTER TABLE "CampaignArc" ALTER COLUMN "rawJson" DROP DEFAULT;

-- CreateIndex: unique constraint on CampaignArc.campaignId (one-to-one)
CREATE UNIQUE INDEX "CampaignArc_campaignId_key" ON "CampaignArc"("campaignId");

-- CreateIndex: composite index on Post (campaignId, dayOffset)
CREATE INDEX "Post_campaignId_dayOffset_idx" ON "Post"("campaignId", "dayOffset");
