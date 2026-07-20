-- Rename User buffer profile fields to channel fields
ALTER TABLE "User" RENAME COLUMN "bufferProfileTiktok" TO "bufferChannelTiktok";
ALTER TABLE "User" RENAME COLUMN "bufferProfileInstagram" TO "bufferChannelInstagram";
ALTER TABLE "User" RENAME COLUMN "bufferProfileYoutube" TO "bufferChannelYoutube";
ALTER TABLE "User" RENAME COLUMN "bufferProfileFacebook" TO "bufferChannelFacebook";

-- Add new Post fields for Buffer API v2
ALTER TABLE "Post" ADD COLUMN "pushError" TEXT;
ALTER TABLE "Post" ADD COLUMN "youtubeTitlePhrase" TEXT;
