-- CreateTable
CREATE TABLE "Media" (
    "id" TEXT NOT NULL,
    "anilistId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "coverImage" TEXT NOT NULL,
    "totalChapters" INTEGER NOT NULL,
    "chapterNumberingSource" TEXT NOT NULL,
    "countryOfOrigin" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Character" (
    "id" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "aliases" TEXT[],
    "imageUrl" TEXT NOT NULL,
    "introducedAtChapter" INTEGER NOT NULL,

    CONSTRAINT "Character_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterDescription" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "validFrom" INTEGER NOT NULL,
    "validUntil" INTEGER,
    "isSensitive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CharacterDescription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterStatus" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "validFrom" INTEGER NOT NULL,
    "validUntil" INTEGER,
    "isSensitive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CharacterStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Faction" (
    "id" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "colorHex" TEXT,
    "introducedAtChapter" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Faction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FactionMembership" (
    "id" TEXT NOT NULL,
    "factionId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "validFrom" INTEGER NOT NULL,
    "validUntil" INTEGER,
    "isSensitive" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "FactionMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Relationship" (
    "id" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "sourceCharacterId" TEXT NOT NULL,
    "targetCharacterId" TEXT NOT NULL,
    "relationType" TEXT NOT NULL,
    "validFrom" INTEGER NOT NULL,
    "validUntil" INTEGER,
    "isSensitive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Relationship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DraftIngestion" (
    "id" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "characterName" TEXT NOT NULL,
    "rawWikitext" TEXT,
    "parsedJson" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "unresolvedNames" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DraftIngestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Media_anilistId_key" ON "Media"("anilistId");

-- CreateIndex
CREATE INDEX "Character_mediaId_introducedAtChapter_idx" ON "Character"("mediaId", "introducedAtChapter");

-- CreateIndex
CREATE INDEX "CharacterDescription_characterId_validFrom_validUntil_idx" ON "CharacterDescription"("characterId", "validFrom", "validUntil");

-- CreateIndex
CREATE INDEX "CharacterStatus_characterId_validFrom_validUntil_idx" ON "CharacterStatus"("characterId", "validFrom", "validUntil");

-- CreateIndex
CREATE INDEX "Faction_mediaId_introducedAtChapter_idx" ON "Faction"("mediaId", "introducedAtChapter");

-- CreateIndex
CREATE INDEX "FactionMembership_characterId_validFrom_validUntil_idx" ON "FactionMembership"("characterId", "validFrom", "validUntil");

-- CreateIndex
CREATE INDEX "FactionMembership_factionId_validFrom_validUntil_idx" ON "FactionMembership"("factionId", "validFrom", "validUntil");

-- CreateIndex
CREATE INDEX "Relationship_mediaId_validFrom_validUntil_idx" ON "Relationship"("mediaId", "validFrom", "validUntil");

-- CreateIndex
CREATE INDEX "DraftIngestion_mediaId_status_idx" ON "DraftIngestion"("mediaId", "status");

-- AddForeignKey
ALTER TABLE "Character" ADD CONSTRAINT "Character_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "Media"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterDescription" ADD CONSTRAINT "CharacterDescription_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterStatus" ADD CONSTRAINT "CharacterStatus_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Faction" ADD CONSTRAINT "Faction_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "Media"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FactionMembership" ADD CONSTRAINT "FactionMembership_factionId_fkey" FOREIGN KEY ("factionId") REFERENCES "Faction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FactionMembership" ADD CONSTRAINT "FactionMembership_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Relationship" ADD CONSTRAINT "Relationship_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "Media"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Relationship" ADD CONSTRAINT "Relationship_sourceCharacterId_fkey" FOREIGN KEY ("sourceCharacterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Relationship" ADD CONSTRAINT "Relationship_targetCharacterId_fkey" FOREIGN KEY ("targetCharacterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;
