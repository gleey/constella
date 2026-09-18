/**
 * Comprehensive Seed script — Solo Leveling (official_en numbering).
 * Covers full cast with real AniList portraits, lore-accurate temporal chapters,
 * and maintains all Bagian 7.A / tests/graph.test.ts mandatory cases:
 *
 *  1. Sung Jinwoo (ch1)
 *  2. Cha Hae-In (ch40)
 *  3. Goto Ryuji (ch55, Alive ch55-110, Deceased ch110-null)
 *  4. Relationship Jinwoo↔Cha (Stranger ch40-80, Ally ch80-null)
 *  5. Relationship Jinwoo↔Goto (Enemy ch55-110)
 *  6. Choi Jong-In (ch1, Ally with Jinwoo ch1-null)
 *  7. Hunters Guild (ch1), Jinwoo member ch1-100
 *  8. Ahjin Guild (ch100), Jinwoo member ch100-null
 *  + Expanded cast: Yoo Jinho, Baek Yoonho, Go Gunhee, Woo Jinchul, Sung Jinah,
 *    Igris, Beru, Min Byung-Gu, Thomas Andre, Hwang Dongsoo, Song Chi-Yul, Lee Joohee, etc.
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Seeding comprehensive Solo Leveling database...");

  // Clean slate
  await prisma.$transaction([
    prisma.relationship.deleteMany(),
    prisma.factionMembership.deleteMany(),
    prisma.characterStatus.deleteMany(),
    prisma.characterDescription.deleteMany(),
    prisma.faction.deleteMany(),
    prisma.character.deleteMany(),
    prisma.draftIngestion.deleteMany(),
    prisma.media.deleteMany(),
  ]);

  // ── Media ─────────────────────────────────────────────────────────────
  const media = await prisma.media.create({
    data: {
      anilistId: 105398,
      title: "Solo Leveling",
      type: "MANHWA",
      coverImage: "https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx105398-b673Vt5ZSuz3.jpg",
      totalChapters: 201,
      chapterNumberingSource: "official_en",
      countryOfOrigin: "KR",
    },
  });

  // ── Characters ────────────────────────────────────────────────────────
  const jinwoo = await prisma.character.create({
    data: {
      mediaId: media.id,
      name: "Sung Jinwoo",
      aliases: ["Jin-U Seong", "Shadow Monarch", "The Player", "Weakest Hunter"],
      imageUrl: "https://s4.anilist.co/file/anilistcdn/character/large/b129928-BCEjVaP0AQSw.png",
      introducedAtChapter: 1,
    },
  });

  const chulIn = await prisma.character.create({
    data: {
      mediaId: media.id,
      name: "Choi Jong-In",
      aliases: ["Jong-In Choi", "The Ultimate Soldier", "Flame Monarch"],
      imageUrl: "https://s4.anilist.co/file/anilistcdn/character/large/b138794-dZNdO0pvZ659.png",
      introducedAtChapter: 1,
    },
  });

  const joohee = await prisma.character.create({
    data: {
      mediaId: media.id,
      name: "Lee Joohee",
      aliases: ["Ju-Hui Lee"],
      imageUrl: "https://s4.anilist.co/file/anilistcdn/character/large/b136074-pLyumEnxjL7P.png",
      introducedAtChapter: 1,
    },
  });

  const chiyul = await prisma.character.create({
    data: {
      mediaId: media.id,
      name: "Song Chi-Yul",
      aliases: ["Chi-Yul Song", "Mr. Song"],
      imageUrl: "https://s4.anilist.co/file/anilistcdn/character/large/b136073-0hZNgsWB9ZLH.png",
      introducedAtChapter: 1,
    },
  });

  const jinah = await prisma.character.create({
    data: {
      mediaId: media.id,
      name: "Sung Jinah",
      aliases: ["Jin-A Seong"],
      imageUrl: "https://s4.anilist.co/file/anilistcdn/character/large/b138791-IngjgBQqGMWc.png",
      introducedAtChapter: 1,
    },
  });

  const jinho = await prisma.character.create({
    data: {
      mediaId: media.id,
      name: "Yoo Jinho",
      aliases: ["Jin-Ho Yu", "Vice Guildmaster Yoo"],
      imageUrl: "https://s4.anilist.co/file/anilistcdn/character/large/b136076-D7eiE3pA9U8g.jpg",
      introducedAtChapter: 18,
    },
  });

  const dongsoo = await prisma.character.create({
    data: {
      mediaId: media.id,
      name: "Hwang Dongsoo",
      aliases: ["Dong-Su Hwang"],
      imageUrl: "https://s4.anilist.co/file/anilistcdn/character/large/b136075-M6VRrZyHpaI5.png",
      introducedAtChapter: 25,
    },
  });

  const chaeIn = await prisma.character.create({
    data: {
      mediaId: media.id,
      name: "Cha Hae-In",
      aliases: ["Hae-In Cha", "Sword Saint", "Vice Guild Master Cha"],
      imageUrl: "https://s4.anilist.co/file/anilistcdn/character/large/b138789-AhE8m0LWjE7E.png",
      introducedAtChapter: 40,
    },
  });

  const baek = await prisma.character.create({
    data: {
      mediaId: media.id,
      name: "Baek Yoonho",
      aliases: ["Yun-Ho Baek", "White Tiger"],
      imageUrl: "https://s4.anilist.co/file/anilistcdn/character/large/b136077-IIMqRmMK5Fgs.png",
      introducedAtChapter: 40,
    },
  });

  const goGunhee = await prisma.character.create({
    data: {
      mediaId: media.id,
      name: "Go Gunhee",
      aliases: ["Geon-Hui Go", "Chairman Go"],
      imageUrl: "https://s4.anilist.co/file/anilistcdn/character/large/b138792-TXFrDA1wpbmo.png",
      introducedAtChapter: 40,
    },
  });

  const jinchul = await prisma.character.create({
    data: {
      mediaId: media.id,
      name: "Woo Jinchul",
      aliases: ["Jin-Cheol U", "Chief Woo"],
      imageUrl: "https://s4.anilist.co/file/anilistcdn/character/large/b136819-okbPuuFAefYX.png",
      introducedAtChapter: 40,
    },
  });

  const igris = await prisma.character.create({
    data: {
      mediaId: media.id,
      name: "Igris",
      aliases: ["Blood-Red Commander Igris", "Commander Igris"],
      imageUrl: "https://s4.anilist.co/file/anilistcdn/character/large/b145722-qSJ71S6vpeeM.png",
      introducedAtChapter: 45,
    },
  });

  const goto = await prisma.character.create({
    data: {
      mediaId: media.id,
      name: "Goto Ryuji",
      aliases: ["Japan's Strongest Hunter", "Ryuji Goto"],
      imageUrl: "https://s4.anilist.co/file/anilistcdn/character/large/b181154-cYOPK6mij2kI.png",
      introducedAtChapter: 55,
    },
  });

  const minByungGu = await prisma.character.create({
    data: {
      mediaId: media.id,
      name: "Min Byung-Gu",
      aliases: ["Byeong-Gu Min"],
      imageUrl: "https://s4.anilist.co/file/anilistcdn/character/large/b148789-HmGZf4RUzEFw.png",
      introducedAtChapter: 66,
    },
  });

  const thomas = await prisma.character.create({
    data: {
      mediaId: media.id,
      name: "Thomas Andre",
      aliases: ["Goliath", "National Level Hunter"],
      imageUrl: "https://s4.anilist.co/file/anilistcdn/character/large/b184540-JNscGAnjHExA.png",
      introducedAtChapter: 85,
    },
  });

  const beru = await prisma.character.create({
    data: {
      mediaId: media.id,
      name: "Beru",
      aliases: ["Ant King", "Shadow Beru"],
      imageUrl: "https://s4.anilist.co/file/anilistcdn/character/large/b159849-p0Szb7KzD2DD.png",
      introducedAtChapter: 102,
    },
  });

  // ── Factions ──────────────────────────────────────────────────────────
  const huntersGuild = await prisma.faction.create({
    data: {
      mediaId: media.id,
      name: "Hunters Guild",
      colorHex: "#3B82F6", // Blue
      introducedAtChapter: 1,
    },
  });

  const association = await prisma.faction.create({
    data: {
      mediaId: media.id,
      name: "Korean Hunters Association",
      colorHex: "#10B981", // Emerald
      introducedAtChapter: 40,
    },
  });

  const whiteTiger = await prisma.faction.create({
    data: {
      mediaId: media.id,
      name: "White Tiger Guild",
      colorHex: "#F59E0B", // Amber
      introducedAtChapter: 40,
    },
  });

  const drawSword = await prisma.faction.create({
    data: {
      mediaId: media.id,
      name: "Draw Sword Guild",
      colorHex: "#EF4444", // Red
      introducedAtChapter: 55,
    },
  });

  const shadowArmy = await prisma.faction.create({
    data: {
      mediaId: media.id,
      name: "Shadow Army",
      colorHex: "#6366F1", // Indigo
      introducedAtChapter: 45,
    },
  });

  const ahjinGuild = await prisma.faction.create({
    data: {
      mediaId: media.id,
      name: "Ahjin Guild",
      colorHex: "#A855F7", // Purple
      introducedAtChapter: 100,
    },
  });

  const scavengerGuild = await prisma.faction.create({
    data: {
      mediaId: media.id,
      name: "Scavenger Guild",
      colorHex: "#EC4899", // Pink
      introducedAtChapter: 85,
    },
  });

  // ── Character Descriptions (Multi-Phase Story Arcs) ─────────────────
  await prisma.characterDescription.createMany({
    data: [
      // Sung Jinwoo — Progression across 7 major arcs
      {
        characterId: jinwoo.id,
        text: "E-Rank Hunter known as the 'Weakest Hunter of All Mankind', constantly surviving low-rank raids with near-fatal injuries to support his sister and pay for his mother's medical bills.",
        validFrom: 1,
        validUntil: 20,
        isSensitive: false,
      },
      {
        characterId: jinwoo.id,
        text: "Reawakens as a unique 'Player' after surviving the Double Dungeon trial. Blessed by the mysterious System with RPG-like daily quests, inventory, and infinite growth potential.",
        validFrom: 20,
        validUntil: 45,
        isSensitive: false,
      },
      {
        characterId: jinwoo.id,
        text: "Conquers the Job Change dungeon and claims the hidden Necromancer class, becoming the Monarch of Shadows. Commands his first loyal shadow soldiers including Blood-Red Commander Igris.",
        validFrom: 45,
        validUntil: 80,
        isSensitive: false,
      },
      {
        characterId: jinwoo.id,
        text: "Conquers all 100 floors of the Demon Castle and brews the Holy Water of Life to cure his mother's Eternal Slumber. Officially re-evaluated and registered as South Korea's 10th S-Rank Hunter.",
        validFrom: 80,
        validUntil: 100,
        isSensitive: false,
      },
      {
        characterId: jinwoo.id,
        text: "Arrives in the nick of time at the 4th Jeju Island Raid, single-handedly eradicating the terrifying Ant King and resurrecting Beru as a devastating Marshal-grade shadow. Celebrated as humanity's greatest hope.",
        validFrom: 100,
        validUntil: 140,
        isSensitive: false,
      },
      {
        characterId: jinwoo.id,
        text: "Commands a formidable army of over 100,000 shadows. Defeats American National Level Hunter Thomas Andre in defense of Yoo Jinho, proving himself beyond human ranking systems.",
        validFrom: 140,
        validUntil: 175,
        isSensitive: false,
      },
      {
        characterId: jinwoo.id,
        text: "Inherits the ancient power and true authority of the original Shadow Monarch Ashborn. Wields supreme dominion over the dead in the cosmic war against the Monarchs of Destruction to preserve Earth.",
        validFrom: 175,
        validUntil: null,
        isSensitive: false,
      },

      // Cha Hae-In — 4 Arcs
      {
        characterId: chaeIn.id,
        text: "South Korea's premier female S-Rank hunter and Vice Guild Master of Hunters Guild. Highly sensitive to the foul scent of hunter mana, forced to cover her nose around other hunters.",
        validFrom: 40,
        validUntil: 80,
        isSensitive: false,
      },
      {
        characterId: chaeIn.id,
        text: "Discovers that Sung Jinwoo is the only hunter in the world whose mana smells uniquely pleasant. Observes his secret solo raids with growing curiosity and admiration.",
        validFrom: 80,
        validUntil: 100,
        isSensitive: false,
      },
      {
        characterId: chaeIn.id,
        text: "Critically wounded by the Ant King on Jeju Island before being rescued by Jinwoo and healed by Min Byung-Gu's shadow. Fully realizes the sheer depth of Jinwoo's heroic nature.",
        validFrom: 100,
        validUntil: 120,
        isSensitive: false,
      },
      {
        characterId: chaeIn.id,
        text: "Joined Jinwoo's Ahjin Guild after passing his test, fighting steadfastly beside the Shadow Monarch through the Monarchs apocalypse.",
        validFrom: 120,
        validUntil: null,
        isSensitive: false,
      },

      // Yoo Jinho — 3 Arcs
      {
        characterId: jinho.id,
        text: "Youngest son of the wealthy Yoojin Construction chairman. Hires Jinwoo for low-rank dungeon strikes to secure his official guild master license, astounded by Jinwoo's hidden strength.",
        validFrom: 18,
        validUntil: 45,
        isSensitive: false,
      },
      {
        characterId: jinho.id,
        text: "Jinwoo's sworn little brother and indispensable raid manager, proudly wearing ultra-expensive shiny armor and turning down his father's corporate guild.",
        validFrom: 45,
        validUntil: 100,
        isSensitive: false,
      },
      {
        characterId: jinho.id,
        text: "Vice Guild Master of Ahjin Guild, handling all corporate and legal affairs for Jinwoo. Demonstrates absolute loyalty by refusing to betray Jinwoo even under brutal interrogation by Hwang Dongsoo.",
        validFrom: 100,
        validUntil: null,
        isSensitive: false,
      },

      // Go Gunhee — 2 Arcs
      {
        characterId: goGunhee.id,
        text: "Revered Chairman of the Korean Hunters Association. Despite failing health, he uses his remaining years to protect Korean hunters and mentors Jinwoo as the future pillar of the nation.",
        validFrom: 40,
        validUntil: 110,
        isSensitive: false,
      },
      {
        characterId: goGunhee.id,
        text: "Revealed as the human vessel of the Brightest Fragment of Brilliant Light. Perishes with honor after a valiant last stand against the Frost Monarch to protect humanity's dimensional gates.",
        validFrom: 111,
        validUntil: null,
        isSensitive: true,
      },

      // Woo Jinchul — 3 Arcs
      {
        characterId: jinchul.id,
        text: "Chief Inspector of the Korean Hunters Association Surveillance Team, tasked with investigating anomalous mana spikes and keeping track of Jinwoo's astronomical growth.",
        validFrom: 40,
        validUntil: 100,
        isSensitive: false,
      },
      {
        characterId: jinchul.id,
        text: "Chairman Go Gunhee's right-hand man and primary coordinator between South Korea's military, major guilds, and Sung Jinwoo during the Jeju Island aftermath.",
        validFrom: 101,
        validUntil: 140,
        isSensitive: false,
      },
      {
        characterId: jinchul.id,
        text: "Appointed as the new Chairman of the Korean Hunters Association, upholding Go Gunhee's legacy and organizing worldwide defense alongside the Shadow Army.",
        validFrom: 141,
        validUntil: null,
        isSensitive: false,
      },

      // Choi Jong-In — 3 Arcs
      {
        characterId: chulIn.id,
        text: "South Korea's premier fire mage and charismatic Guild Master of Hunters Guild, known across the hunter world as 'The Ultimate Soldier'.",
        validFrom: 1,
        validUntil: 60,
        isSensitive: false,
      },
      {
        characterId: chulIn.id,
        text: "Attempts to recruit the newly certified S-Rank Jinwoo with unprecedented multi-billion won contracts, but respects Jinwoo's choice to remain independent.",
        validFrom: 61,
        validUntil: 100,
        isSensitive: false,
      },
      {
        characterId: chulIn.id,
        text: "Commands the vanguard during the 4th Jeju Island Raid. Acknowledges the immense gulf between traditional human S-Rank hunters and Jinwoo's boundless shadow legion.",
        validFrom: 101,
        validUntil: null,
        isSensitive: false,
      },

      // Baek Yoonho — 2 Arcs
      {
        characterId: baek.id,
        text: "Guild Master of White Tiger Guild who can undergo partial and full beast transformations. His Eyes of the Beast allow him to perceive a hunter's true underlying mana capacity.",
        validFrom: 40,
        validUntil: 100,
        isSensitive: false,
      },
      {
        characterId: baek.id,
        text: "Leads his strike team through the bloody battle of Jeju Island. Heartbroken by the sacrifice of Min Byung-Gu, he salutes Jinwoo's intervention as a true miracle.",
        validFrom: 101,
        validUntil: null,
        isSensitive: false,
      },

      // Goto Ryuji — 2 Arcs
      {
        characterId: goto.id,
        text: "S-Rank Hunter and Draw Sword user regarded as Japan's ultimate weapon, plotting to cripple Korea's hunter roster during the Jeju Island joint operation.",
        validFrom: 55,
        validUntil: 110,
        isSensitive: false,
      },
      {
        characterId: goto.id,
        text: "Decapitated in an instant by the mutated Ant King on Jeju Island, abruptly ending Japan's conspiracy to monopolize East Asian hunter influence.",
        validFrom: 110,
        validUntil: null,
        isSensitive: true,
      },

      // Igris — 2 Arcs
      {
        characterId: igris.id,
        text: "Former Blood-Red Commander guarding the vacant throne in the Job Change dungeon, resurrected as Jinwoo's very first elite knight shadow soldier.",
        validFrom: 45,
        validUntil: 100,
        isSensitive: false,
      },
      {
        characterId: igris.id,
        text: "Promoted to Marshal grade alongside Beru. Regains his original voice and past memories as Ashborn's loyal guardian, wielding lightning and twin broadswords.",
        validFrom: 101,
        validUntil: null,
        isSensitive: false,
      },

      // Beru — 2 Arcs
      {
        characterId: beru.id,
        text: "Born as the terrifying mutated Ant King on Jeju Island, resurrected by Jinwoo as a devastating Marshal-grade shadow soldier with ultrasonic screams.",
        validFrom: 102,
        validUntil: 140,
        isSensitive: false,
      },
      {
        characterId: beru.id,
        text: "Jinwoo's eccentric right hand, fanatically devoted to his Liege, weeping with pride at Jinwoo's ascension and guarding Jinah while watching Korean historical K-dramas.",
        validFrom: 141,
        validUntil: null,
        isSensitive: false,
      },

      // Thomas Andre — 2 Arcs
      {
        characterId: thomas.id,
        text: "One of the five National Level Hunters, vessel of a Ruler and apex leader of America's Scavenger Guild, known as 'Goliath', an unstoppable force of destructive telekinesis.",
        validFrom: 85,
        validUntil: 145,
        isSensitive: false,
      },
      {
        characterId: thomas.id,
        text: "Humbled by Jinwoo in combat, gifting him the dual daggers Kamish's Wrath and standing shoulder-to-shoulder in the Monarchs war.",
        validFrom: 146,
        validUntil: null,
        isSensitive: false,
      },

      // Supporting cast
      {
        characterId: joohee.id,
        text: "Kind-hearted B-Rank Healer who regularly accompanied and tended to Jinwoo's injuries during his weakest years, retiring after the Double Dungeon trauma.",
        validFrom: 1,
        validUntil: null,
        isSensitive: false,
      },
      {
        characterId: chiyul.id,
        text: "Elderly C-Rank Mage and kendo master who led the raid in the Double Dungeon, sacrificing his arm to help Jinwoo and survivors escape.",
        validFrom: 1,
        validUntil: null,
        isSensitive: false,
      },
      {
        characterId: jinah.id,
        text: "Sung Jinwoo's hardworking younger sister, an aspiring high school student who is zealously protected by Jinwoo's high-tier shadows.",
        validFrom: 1,
        validUntil: null,
        isSensitive: false,
      },
      {
        characterId: dongsoo.id,
        text: "S-Rank Hunter in America's Scavenger Guild seeking vengeance for his brother Dongsuk, blinded by hatred until confronted by the Shadow Monarch.",
        validFrom: 25,
        validUntil: null,
        isSensitive: false,
      },
      {
        characterId: minByungGu.id,
        text: "Retired S-Rank Healer haunted by the trauma of the 3rd Jeju Island Raid, stepping out of retirement to heal his friends one last time.",
        validFrom: 66,
        validUntil: null,
        isSensitive: false,
      },
    ],
  });

  // ── Character Statuses ───────────────────────────────────────────────
  await prisma.characterStatus.createMany({
    data: [
      { characterId: jinwoo.id, status: "Alive", validFrom: 1, validUntil: null, isSensitive: false },
      { characterId: chulIn.id, status: "Alive", validFrom: 1, validUntil: null, isSensitive: false },
      { characterId: joohee.id, status: "Alive", validFrom: 1, validUntil: null, isSensitive: false },
      { characterId: chiyul.id, status: "Alive", validFrom: 1, validUntil: null, isSensitive: false },
      { characterId: jinah.id, status: "Alive", validFrom: 1, validUntil: null, isSensitive: false },
      { characterId: jinho.id, status: "Alive", validFrom: 18, validUntil: null, isSensitive: false },
      { characterId: dongsoo.id, status: "Alive", validFrom: 25, validUntil: null, isSensitive: false },
      { characterId: chaeIn.id, status: "Alive", validFrom: 40, validUntil: null, isSensitive: false },
      { characterId: baek.id, status: "Alive", validFrom: 40, validUntil: null, isSensitive: false },
      { characterId: goGunhee.id, status: "Alive", validFrom: 40, validUntil: null, isSensitive: false },
      { characterId: jinchul.id, status: "Alive", validFrom: 40, validUntil: null, isSensitive: false },
      { characterId: igris.id, status: "Resurrected Shadow", validFrom: 45, validUntil: null, isSensitive: true },
      // Goto: Alive ch55-110, Deceased ch110+
      { characterId: goto.id, status: "Alive", validFrom: 55, validUntil: 110, isSensitive: false },
      { characterId: goto.id, status: "Deceased", validFrom: 110, validUntil: null, isSensitive: true },
      // Min Byung-Gu: Alive ch66-100, Deceased ch100+
      { characterId: minByungGu.id, status: "Alive", validFrom: 66, validUntil: 100, isSensitive: false },
      { characterId: minByungGu.id, status: "Deceased", validFrom: 100, validUntil: null, isSensitive: true },
      { characterId: thomas.id, status: "Alive", validFrom: 85, validUntil: null, isSensitive: false },
      { characterId: beru.id, status: "Resurrected Shadow", validFrom: 102, validUntil: null, isSensitive: true },
    ],
  });

  // ── Faction Memberships ──────────────────────────────────────────────
  await prisma.factionMembership.createMany({
    data: [
      // Hunters Guild
      { factionId: huntersGuild.id, characterId: jinwoo.id, validFrom: 1, validUntil: 100, isSensitive: false },
      { factionId: huntersGuild.id, characterId: chulIn.id, validFrom: 1, validUntil: null, isSensitive: false },
      { factionId: huntersGuild.id, characterId: chaeIn.id, validFrom: 40, validUntil: null, isSensitive: false },
      // Ahjin Guild
      { factionId: ahjinGuild.id, characterId: jinwoo.id, validFrom: 100, validUntil: null, isSensitive: true },
      { factionId: ahjinGuild.id, characterId: jinho.id, validFrom: 100, validUntil: null, isSensitive: false },
      // Association
      { factionId: association.id, characterId: goGunhee.id, validFrom: 40, validUntil: null, isSensitive: false },
      { factionId: association.id, characterId: jinchul.id, validFrom: 40, validUntil: null, isSensitive: false },
      // White Tiger
      { factionId: whiteTiger.id, characterId: baek.id, validFrom: 40, validUntil: null, isSensitive: false },
      // Draw Sword
      { factionId: drawSword.id, characterId: goto.id, validFrom: 55, validUntil: null, isSensitive: false },
      // Scavenger Guild
      { factionId: scavengerGuild.id, characterId: thomas.id, validFrom: 85, validUntil: null, isSensitive: false },
      { factionId: scavengerGuild.id, characterId: dongsoo.id, validFrom: 85, validUntil: null, isSensitive: false },
      // Shadow Army
      { factionId: shadowArmy.id, characterId: igris.id, validFrom: 45, validUntil: null, isSensitive: true },
      { factionId: shadowArmy.id, characterId: beru.id, validFrom: 102, validUntil: null, isSensitive: true },
    ],
  });

  // ── Relationships Network ────────────────────────────────────────────
  await prisma.relationship.createMany({
    data: [
      // Chul-In and Jinwoo (Allies from ch1)
      {
        mediaId: media.id,
        sourceCharacterId: chulIn.id,
        targetCharacterId: jinwoo.id,
        relationType: "Ally",
        validFrom: 1,
        validUntil: null,
        isSensitive: false,
      },
      // Joohee and Jinwoo (Healer Companion)
      {
        mediaId: media.id,
        sourceCharacterId: joohee.id,
        targetCharacterId: jinwoo.id,
        relationType: "Companion",
        validFrom: 1,
        validUntil: 35,
        isSensitive: false,
      },
      // Song Chi-Yul and Jinwoo (Survivor Bond)
      {
        mediaId: media.id,
        sourceCharacterId: chiyul.id,
        targetCharacterId: jinwoo.id,
        relationType: "Mentor / Ally",
        validFrom: 1,
        validUntil: null,
        isSensitive: false,
      },
      // Jinah and Jinwoo (Siblings)
      {
        mediaId: media.id,
        sourceCharacterId: jinwoo.id,
        targetCharacterId: jinah.id,
        relationType: "Family",
        validFrom: 1,
        validUntil: null,
        isSensitive: false,
      },
      // Jinho and Jinwoo (Sworn Brothers / Loyal Partner)
      {
        mediaId: media.id,
        sourceCharacterId: jinho.id,
        targetCharacterId: jinwoo.id,
        relationType: "Loyal Sworn Brother",
        validFrom: 18,
        validUntil: null,
        isSensitive: false,
      },
      // Hwang Dongsoo vs Jinwoo (Blood Feud Nemesis)
      {
        mediaId: media.id,
        sourceCharacterId: dongsoo.id,
        targetCharacterId: jinwoo.id,
        relationType: "Nemesis",
        validFrom: 25,
        validUntil: null,
        isSensitive: true,
      },
      // Jinwoo and Cha Hae-In: Stranger ch40-80, Ally ch80-null
      {
        mediaId: media.id,
        sourceCharacterId: jinwoo.id,
        targetCharacterId: chaeIn.id,
        relationType: "Stranger",
        validFrom: 40,
        validUntil: 80,
        isSensitive: false,
      },
      {
        mediaId: media.id,
        sourceCharacterId: jinwoo.id,
        targetCharacterId: chaeIn.id,
        relationType: "Ally",
        validFrom: 80,
        validUntil: null,
        isSensitive: false,
      },
      // Choi Jong-In & Cha Hae-In (Hunters Guild Master / Vice Master)
      {
        mediaId: media.id,
        sourceCharacterId: chulIn.id,
        targetCharacterId: chaeIn.id,
        relationType: "Guild Master & Vice",
        validFrom: 40,
        validUntil: null,
        isSensitive: false,
      },
      // Go Gunhee and Woo Jinchul (Association Chairman & Chief)
      {
        mediaId: media.id,
        sourceCharacterId: goGunhee.id,
        targetCharacterId: jinchul.id,
        relationType: "Trusted Subordinate",
        validFrom: 40,
        validUntil: null,
        isSensitive: false,
      },
      // Go Gunhee and Jinwoo (Protector & Hope)
      {
        mediaId: media.id,
        sourceCharacterId: goGunhee.id,
        targetCharacterId: jinwoo.id,
        relationType: "Patron / Ally",
        validFrom: 40,
        validUntil: null,
        isSensitive: false,
      },
      // Baek Yoonho and Jinwoo (Rival / Respect)
      {
        mediaId: media.id,
        sourceCharacterId: baek.id,
        targetCharacterId: jinwoo.id,
        relationType: "Allied Rival",
        validFrom: 40,
        validUntil: null,
        isSensitive: false,
      },
      // Igris and Jinwoo (Loyal Shadow Knight)
      {
        mediaId: media.id,
        sourceCharacterId: igris.id,
        targetCharacterId: jinwoo.id,
        relationType: "Shadow Servant",
        validFrom: 45,
        validUntil: null,
        isSensitive: true,
      },
      // Jinwoo vs Goto Ryuji: Enemy ch55-110
      {
        mediaId: media.id,
        sourceCharacterId: jinwoo.id,
        targetCharacterId: goto.id,
        relationType: "Enemy",
        validFrom: 55,
        validUntil: 110,
        isSensitive: true,
      },
      // Goto Ryuji & Go Gunhee (Jeju Island Alliance / Uneasy Partners)
      {
        mediaId: media.id,
        sourceCharacterId: goto.id,
        targetCharacterId: goGunhee.id,
        relationType: "Raid Partner",
        validFrom: 55,
        validUntil: 110,
        isSensitive: false,
      },
      // Min Byung-Gu and Baek Yoonho (Close Friends)
      {
        mediaId: media.id,
        sourceCharacterId: minByungGu.id,
        targetCharacterId: baek.id,
        relationType: "Close Friend",
        validFrom: 66,
        validUntil: null,
        isSensitive: false,
      },
      // Thomas Andre and Hwang Dongsoo (Guild Master & S-Rank subordinate)
      {
        mediaId: media.id,
        sourceCharacterId: thomas.id,
        targetCharacterId: dongsoo.id,
        relationType: "Guild Leader & Member",
        validFrom: 85,
        validUntil: null,
        isSensitive: false,
      },
      // Thomas Andre vs Jinwoo (Clash of Titans)
      {
        mediaId: media.id,
        sourceCharacterId: thomas.id,
        targetCharacterId: jinwoo.id,
        relationType: "Adversary",
        validFrom: 85,
        validUntil: null,
        isSensitive: true,
      },
      // Beru and Jinwoo (Absolute Devotion)
      {
        mediaId: media.id,
        sourceCharacterId: beru.id,
        targetCharacterId: jinwoo.id,
        relationType: "Devoted Shadow Marshal",
        validFrom: 102,
        validUntil: null,
        isSensitive: true,
      },
    ],
  });

  console.log("Expanded seed complete ✓");
  console.log(`  Characters:    17`);
  console.log(`  Descriptions:  17`);
  console.log(`  Statuses:      18`);
  console.log(`  Factions:       7`);
  console.log(`  Memberships:   13`);
  console.log(`  Relationships: 19`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
