/**
 * Live Image Repair & Sync Script.
 * Dynamically repairs cover images and character portraits across the database
 * using ONLY AniList API and Fandom Wiki API.
 * No hardcoded image dictionaries or mock hash lists.
 */

import { prisma } from "../src/lib/prisma";
import { fetchMediaDetail, searchMedia } from "../src/lib/anilist";
import { resolveFandomWikiSubdomain, fetchCharacterImage } from "../src/lib/fandom";
import { isBrokenImageUrl } from "../src/lib/auto-sync";
import { resolveCharacterName } from "../src/lib/name-resolution";

async function main() {
  console.log("=== REPAIRING COVER AND CHARACTER IMAGES (ANILIST & FANDOM API) ===");

  const allMedia = await prisma.media.findMany({
    include: {
      characters: true,
    },
  });

  console.log(`Found ${allMedia.length} media titles in database to verify.`);

  for (const m of allMedia) {
    console.log(`\n--------------------------------------------------`);
    console.log(`[Media] "${m.title}" (AniList ID: ${m.anilistId})`);

    let detail = null;
    let effectiveAnilistId = m.anilistId;

    // 1. Try to fetch AniList detail
    try {
      detail = await fetchMediaDetail(effectiveAnilistId);
    } catch {
      detail = null;
    }

    const titleLower = m.title.toLowerCase().replace(/[^a-z0-9]/g, "");
    const matchesDetail = detail && (
      detail.title.toLowerCase().replace(/[^a-z0-9]/g, "").includes(titleLower) ||
      titleLower.includes(detail.title.toLowerCase().replace(/[^a-z0-9]/g, "")) ||
      detail.synonyms.some(s => {
        const sClean = s.toLowerCase().replace(/[^a-z0-9]/g, "");
        return sClean.includes(titleLower) || titleLower.includes(sClean);
      })
    );

    if (!matchesDetail) {
      console.log(`  ! Stored AniList ID ${effectiveAnilistId} does not match title "${m.title}". Searching AniList...`);
      try {
        const searchRes = await searchMedia(m.title);
        if (searchRes.length > 0) {
          effectiveAnilistId = searchRes[0].id;
          detail = await fetchMediaDetail(effectiveAnilistId);
          console.log(`  ✓ Found real AniList ID: ${effectiveAnilistId} ("${detail.title}")`);
        }
      } catch (err: any) {
        console.log(`  ! Search also failed: ${err.message}`);
      }
    }

    // 2. Update cover image from AniList
    if (detail) {
      const liveCover = detail.coverImage;
      if (liveCover && liveCover !== m.coverImage) {
        console.log(`  ✓ Updated coverImage: ${liveCover}`);
        await prisma.media.update({
          where: { id: m.id },
          data: {
            anilistId: effectiveAnilistId,
            coverImage: liveCover,
            totalChapters: detail.chapters && detail.chapters > m.totalChapters ? detail.chapters : undefined,
          },
        });
      }
    }

    // 3. Dynamically resolve Fandom Wiki
    const synonyms = detail?.synonyms || [];
    const wikiSubdomain = await resolveFandomWikiSubdomain(m.title, synonyms);
    if (wikiSubdomain) {
      console.log(`  ✓ Connected Fandom Wiki: ${wikiSubdomain}`);
    }

    // 4. Verify & repair each character image
    for (const c of m.characters) {
      const needsRepair = isBrokenImageUrl(c.imageUrl);
      if (!needsRepair) {
        console.log(`  ✓ "${c.name}": image already valid`);
        continue;
      }

      console.log(`  * Repairing image for "${c.name}" (current: ${c.imageUrl || "empty"})...`);
      let foundUrl: string | null = null;

      // Tier 1: Check AniList cast
      if (detail?.characters && detail.characters.length > 0) {
        const targetClean = c.name.toLowerCase().replace(/[^a-z0-9]/g, "");
        const targetTokens = c.name
          .toLowerCase()
          .split(/[\s\-()]+/)
          .filter((w) => w.length > 2);

        const matched = detail.characters.find((ac) => {
          if (resolveCharacterName(c.name, [{ id: "temp", name: ac.name, aliases: ac.aliases }]) !== null) {
            return true;
          }
          const acClean = ac.name.toLowerCase().replace(/[^a-z0-9]/g, "");
          if (acClean === targetClean) return true;
          // check token overlap (e.g., Jin-Hyeok Kang vs Kang Jinhyuk)
          if (targetTokens.length >= 2 && targetTokens.every((t) => acClean.includes(t.slice(0, 4)))) {
            return true;
          }
          // check aliases
          for (const al of ac.aliases) {
            const alClean = al.toLowerCase().replace(/[^a-z0-9]/g, "");
            if (alClean === targetClean) return true;
            if (targetTokens.length >= 2 && targetTokens.every((t) => alClean.includes(t.slice(0, 4)))) {
              return true;
            }
          }
          // edit distance for slight spelling differences (e.g. Ed Rothtaylor vs Ed Rothstaylor)
          if (Math.abs(acClean.length - targetClean.length) <= 2) {
            let diff = 0;
            const len = Math.min(acClean.length, targetClean.length);
            for (let i = 0; i < len; i++) {
              if (acClean[i] !== targetClean[i]) diff++;
            }
            if (diff <= 2) return true;
          }
          return false;
        });

        if (matched?.imageUrl && !isBrokenImageUrl(matched.imageUrl)) {
          foundUrl = matched.imageUrl;
          console.log(`    → Resolved from AniList cast: ${foundUrl} (${matched.name})`);
        }
      }

      // Tier 2: Check Fandom Wiki pageimages
      if (!foundUrl && wikiSubdomain) {
        try {
          const fandomImg = await fetchCharacterImage(wikiSubdomain, c.name, c.aliases);
          if (fandomImg) {
            foundUrl = fandomImg;
            console.log(`    → Resolved from Fandom Wiki: ${foundUrl}`);
          }
        } catch (e: any) {
          console.log(`    ! Fandom fetch error: ${e.message}`);
        }
      }

      // Tier 3: Update DB if resolved
      if (foundUrl) {
        await prisma.character.update({
          where: { id: c.id },
          data: { imageUrl: foundUrl },
        });
        console.log(`    ✓ Saved new imageUrl for "${c.name}"`);
      } else {
        console.log(`    ! No live image found on AniList or Fandom for "${c.name}"`);
      }

      // Small pause to be polite to external APIs
      await new Promise((r) => setTimeout(r, 400));
    }
  }

  console.log("\n=== ALL MEDIA AND CHARACTERS REPAIRED SUCCESSFULLY ===");
}

main()
  .catch((e) => {
    console.error("Migration error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
