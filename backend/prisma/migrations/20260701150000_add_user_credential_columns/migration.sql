-- AlterTable: User — add 7 credential columns
ALTER TABLE "User" ADD COLUMN "anthropicApiKey" TEXT;
ALTER TABLE "User" ADD COLUMN "bufferAccessToken" TEXT;
ALTER TABLE "User" ADD COLUMN "bufferProfileTiktok" TEXT;
ALTER TABLE "User" ADD COLUMN "bufferProfileInstagram" TEXT;
ALTER TABLE "User" ADD COLUMN "bufferProfileYoutube" TEXT;
ALTER TABLE "User" ADD COLUMN "bufferProfileFacebook" TEXT;
ALTER TABLE "User" ADD COLUMN "higgsfieldApiKey" TEXT;
