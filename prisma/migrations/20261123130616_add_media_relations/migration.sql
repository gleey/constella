-- AlterTable
ALTER TABLE "Media" ADD COLUMN     "relations" JSONB NOT NULL DEFAULT '[]';
