import { prisma } from "../src/lib/prisma";

async function main() {
  console.log("=== Removing Duplicate Media Records ===");

  const duplicatesToDelete = [
    { anilistId: 85364, title: "One Punch Man (Webcomic)", keepAnilistId: 74347 },
    { anilistId: 99026, title: "The Apothecary Diaries (Novel)", keepAnilistId: 99022 },
    { anilistId: 98361, title: "Three Days of Happiness (Novel)", keepAnilistId: 97553 },
    { anilistId: 85470, title: "Mushoku Tensei: Jobless Reincarnation (Novel)", keepAnilistId: 85564 },
    { anilistId: 136833, title: "Secrets of the Silent Witch (Novel)", keepAnilistId: 136834 },
  ];

  for (const item of duplicatesToDelete) {
    const existing = await prisma.media.findUnique({
      where: { anilistId: item.anilistId },
      select: { id: true, title: true },
    });

    if (existing) {
      await prisma.media.delete({
        where: { id: existing.id },
      });
      console.log(`✓ Deleted duplicate: "${existing.title}" (AniList: ${item.anilistId}, kept: ${item.keepAnilistId})`);
    } else {
      console.log(`- Duplicate not found or already deleted: ${item.anilistId} ("${item.title}")`);
    }
  }

  const remainingCount = await prisma.media.count();
  console.log(`\nCleanup complete! Remaining media in DB: ${remainingCount}`);
}

main()
  .catch((e) => {
    console.error("Error during duplicate removal:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
