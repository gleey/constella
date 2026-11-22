# ✨ Constella — Spoiler-Free Dynamic Character & Story Map

> Platform web interaktif berbasis *temporal graph* yang menyajikan peta relasi karakter komik/novel (manga/manhwa) secara dinamis sesuai bab (*chapter*) terakhir yang dibaca pengguna — **menjamin zero-spoiler** tanpa risiko kebocoran alur cerita.

![Next.js](https://img.shields.io/badge/Next.js-16.3-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-7.10-2D3748?logo=prisma)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-4169E1?logo=postgresql&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)
![Cytoscape.js](https://img.shields.io/badge/Cytoscape.js-3.34-FF6B6B?logo=javascript)
![Gemini AI](https://img.shields.io/badge/Google_Gemini-2.23-4285F4?logo=google)

---

## 🌌 Tentang Constella

Membaca serial manga/manhwa berdurasi panjang (seperti *Tower of God*, *Omniscient Reader's Viewpoint*, *Solo Leveling*, atau *The Beginning After the End*) sering kali membingungkan karena banyaknya karakter, perubahan aliansi faksi, atau kematian tokoh penting. Membuka situs wiki publik sering kali langsung merusak pengalaman membaca karena spoiler karakter di bab mendatang.

**Constella** (*Constellation of Characters*) memetakan hubungan antar-karakter layaknya rasi bintang:
- Hubungan, afiliasi, faksi, dan status kehidupan karakter **hanya menyala dan berubah** sesuai posisi *chapter slider* yang dipilih.
- Informasi temporal di masa depan tidak pernah dikirim ke browser pengguna.
- Dilengkapi sistem otomatisasi katalog dari **AniList GraphQL**, ekstraksi wikitext **Fandom MediaWiki**, serta pemrosesan terstruktur menggunakan **Google Gemini API** & **Groq API Fallback**.

---

## ✨ Fitur Utama

| Fitur | Deskripsi |
|---|---|
| **Zero-Spoiler Temporal Graph** | Node (karakter), edge (relasi), status, dan faksi disaring ketat di level database PostgreSQL. Data dengan `validFrom > N` **dijamin tidak pernah dikirim** ke client. |
| **Two-Layer Protection System** | **Layer 1:** Filter keamanan chapter di backend (non-negotiable).<br>**Layer 2:** UI `isSensitive` Spoiler-Toggle (konten penting/twist disembunyikan di balik klik tombol reveal). |
| **Intelligent Graph Canvas** | Visualisasi graf relasi interaktif berbasis **Cytoscape.js** dengan: <br>• *Compound Faction Bubbles* dengan layout orbit radial mengelilingi tokoh utama (MC).<br>• *Concentric layout* otomatis untuk karakter independen.<br>• *Position coordinate persistence* (posisi node tidak teracak ulang saat slider digeser). |
| **Multi-Tier Ingestion Engine** | Pipeline bertingkat untuk mengisi database:<br>• **Tier 1:** Bulk seeder populer dari AniList API (cepat, tanpa kuota AI).<br>• **Tier 2:** Scraper kategori Fandom dengan paginasi dan filter subpage otomatis.<br>• **Tier 3:** AI Structured Lore Extraction (Gemini SDK dengan skema JSON asli). |
| **Resilient AI Fallback Chain** | Mendukung rantai multi-model Gemini (`gemini-3.5-flash`, `gemini-3.5-flash-lite`, dll.) serta otomatis beralih ke **Groq API** (`openai/gpt-oss-120b`, `llama-3.3-70b-versatile`) jika terjadi limit TPM/429. |
| **Name Resolution & Deduplication** | Algoritma pencocokan nama otomatis (*case-insensitive, alias matching, romanization deduplication*) untuk memetakan nama hasil ekstraksi LLM ke tabel karakter, lengkap dengan status antrean `UNRESOLVED` untuk verifikasi admin. |
| **Admin CMS & Review Workflow** | Panel admin interaktif di `/admin` dan `/admin/review` untuk memvalidasi draft, mengoreksi timeline bab, mengubah status sensitivitas per entri, serta menyinkronkan data secara background daemon. |
| **Catalog & Lore Coverage Dashboard** | Halaman `/status` menampilkan tingkat kedalaman data per seri (Tier 1–3) agar pengguna mengetahui seri mana yang sudah memiliki graph relasi aktif vs. hanya metadata dasar. |
| **Methodology & Architecture Docs** | Halaman `/methodology` mendokumentasikan sistem Two-Layer Zero-Spoiler, pipeline Tier 1–3, dan proses auditing komunitas. |
| **Data Attribution & License Compliance** | Halaman `/about` & global footer mencantumkan kredit wajib: **AniList GraphQL API** (metadata) & **Fandom Wikis CC-BY-SA 3.0** (profil karakter). |

---

## 🏗️ Arsitektur Sistem

### 1. Zero-Spoiler Two-Layer Security Model

```
Pengguna menggeser slider ke Bab N
                 │
                 ▼
┌────────────────────────────────────────────────────────────────────────┐
│  Layer 1: Chapter Scoping (Database / Backend — Non-Negotiable)         │
│  ────────────────────────────────────────────────────────────────────  │
│  • WHERE validFrom <= N AND (validUntil > N OR validUntil IS NULL)     │
│  • Validasi dua sisi: Relasi dibuang jika source/target belum muncul   │
│  • Faction Membership mengikuti validitas kemunculan Faksi             │
│  • Metadata temporal (validFrom, validUntil) TIDAK PERNAH dikirim       │
└────────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼ (Hanya data aktif bab N yang lolos)
┌────────────────────────────────────────────────────────────────────────┐
│  Layer 2: Sensitivity UI Layer (Frontend — UX Control)                 │
│  ────────────────────────────────────────────────────────────────────  │
│  • isSensitive: true dirender tertutup: [Spoiler ▼]                    │
│  • Klik eksplisit untuk expand (▲)                                     │
│  • Label hover pada edge sensitif dibuat generik ("Connected")         │
│  • State reveal OTOMATIS DI-RESET setiap slider chapter bergeser       │
└────────────────────────────────────────────────────────────────────────┘
```

### 2. Aturan Temporal Universal (Database Contract)

* `validFrom` = Bab pertama di mana fakta/relasi ini **mulai berlaku** (inklusif).
* `validUntil` = Bab pertama di mana fakta/relasi ini **sudah TIDAK berlaku** (eksklusif). Nilai `null` = berlaku seterusnya.
* *Contoh Kematian:* Bab 1–49 berstatus `Alive` (`validFrom: 1, validUntil: 50`), Bab 50+ berstatus `Deceased` (`validFrom: 50, validUntil: null`).
* **Constraint Integritas:** Baris dengan `validUntil <= validFrom` ditolak secara otomatis oleh aplikasi.

---

## 📁 Struktur Direktori

```
constella/
├── prisma/
│   ├── migrations/          # PostgreSQL schema migrations
│   ├── schema.prisma        # Definisi data model temporal & index
│   └── seed.ts              # Seeding awal dengan kasus uji lengkap
├── scripts/
│   ├── seed-popular.ts      # Tier 1: Bulk catalog seeder AniList (tanpa AI)
│   ├── enrich-fandom.ts     # Tier 2: Dynamic Fandom category & wikitext extraction
│   ├── enrich-all.ts        # Tier 3: Batch lore enrichment (AniList + Fandom + Gemini)
│   ├── ingest-fandom-cast.ts# Ingest roster karakter dari wiki Fandom ke tabel review
│   ├── backfill-live-chapters.ts # Backfill jumlah bab live (MangaUpdates) untuk seri releasing
│   ├── backfill-live-statuses.ts # Backfill status rilis live (Kitsu)
│   ├── backfill-ratings-and-status.ts # Backfill rating & status rilis dari AniList
│   ├── run-global-lore-sync.ts # Orkestrator lore sync global: ingest cast (no AI) → enrich-all (AI)
│   ├── audit-wiki-resolution.ts   # Audit resolusi wiki seluruh katalog (--min-chars=N)
│   ├── fix-factions.ts      # Perbaikan relasi faksi karakter
│   ├── remove-duplicates.ts # Pembersihan duplikat nama karakter
│   ├── series-config.ts     # Konfigurasi override metadata seri
│   ├── run-background-daemon.ts # Daemon otomatis sinkronisasi berkala (interval 6 jam)
│   └── sync-all-live-images.ts  # Utility perbaikan aset foto resolusi tinggi
├── src/
│   ├── app/
│   │   ├── admin/           # Dashboard CMS Admin, Ingest, & Review Queue
│   │   │   ├── ingest/      # Halaman trigger ingestion manual
│   │   │   ├── review/      # Halaman validasi draft karakter & unresolved names
│   │   │   └── page.tsx     # Monitoring live background daemon & media
│   │   ├── api/             # REST API endpoints
│   │   │   ├── admin/       # API sinkronisasi, relasi, dan review approval
│   │   │   └── media/       # Public graph API (/api/media/[id]/graph?chapter=N)
│   │   ├── media/[id]/      # Halaman interaktif Reader Graph Visualization
│   │   ├── methodology/     # Halaman dokumentasi arsitektur & metodologi zero-spoiler
│   │   ├── status/          # Halaman Catalog & Lore Coverage Dashboard (Tier 1–3)
│   │   ├── globals.css      # Desain tema gelap modern (Tailwind v4)
│   │   ├── layout.tsx       # Root layout & font Geist
│   │   └── page.tsx         # Katalog media & beranda utama
│   ├── components/
│   │   ├── AdminDrawer.tsx  # Quick admin management drawer
│   │   ├── ChapterSlider.tsx   # Kontrol pemilihan bab
│   │   ├── CharacterModal.tsx    # Modal detail profil, status, & timeline karakter
│   │   ├── CharacterSearch.tsx   # Fitur pencarian instan karakter pada kanvas
│   │   ├── FloatingPanel.tsx     # Panel navigasi melayang & statistik graf
│   │   ├── Footer.tsx            # Global footer dengan atribusi, lisensi, & navigasi
│   │   ├── GraphCanvas.tsx       # Engine Cytoscape.js (orbit faksi, persistensi koordinat)
│   │   ├── Navbar.tsx            # Bar navigasi utama
│   │   ├── SpoilerToggle.tsx     # Komponen reveal/collapse spoiler
│   │   └── StatusClient.tsx      # Client component interaktif halaman /status (filter & search)
│   ├── generated/prisma/    # Prisma client yang di-generate otomatis
│   └── lib/
│       ├── admin-auth.ts      # Utilitas otorisasi admin (ADMIN_SECRET via header/cookie)
│       ├── alt-sources.ts     # Sumber karakter cadangan (Wikipedia + Kitsu)
│       ├── anilist.ts         # GraphQL client AniList (katalog judul, cover, karakter)
│       ├── api-cache.ts       # Cache respons API eksternal (TTL in-memory)
│       ├── auto-sync.ts       # Orkestrasi sinkronisasi otomatis per-katalog
│       ├── background-sync.ts # Engine sinkronisasi berkala otomatis
│       ├── catalog-import.ts  # Impor katalog + enrichment jumlah bab
│       ├── chapter-count.ts   # Resolusi jumlah bab (AniList → live → tersimpan → fallback)
│       ├── fandom.ts          # Scraper MediaWiki Fandom (paginasi kategori & infobox)
│       ├── gemini.ts          # Gemini AI extractor (JSON schema, fallback chain ke Groq)
│       ├── kitsu-chapters.ts  # Lookup Kitsu (status rilis + verifikasi mapping anilist/manga)
│       ├── live-chapters.ts   # Resolusi jumlah bab live via MangaUpdates & Kitsu
│       ├── middleware.ts      # Next.js middleware proteksi endpoint admin & mutasi
│       ├── name-dedupe.ts     # Normalisasi nama & heuristik penggabungan duplikat
│       ├── name-resolution.ts # Resolusi target nama LLM ke database Foreign Key
│       ├── temporal.ts        # Validasi batasan waktu temporal validFrom/validUntil
│       ├── types.ts           # Shared TypeScript types
│       ├── site-page.ts       # CMS halaman statis (about, methodology) editable via admin
│       └── prisma.ts          # Prisma client singleton
├── tests/
│   └── graph.test.ts        # Automated zero-spoiler leakage test suite
├── .env.example             # Template konfigurasi environment
├── package.json             # Dependensi & skrip eksekusi
└── PRD.md                   # Project Requirement Document (Revisi v3)
```

---

## 🚀 Panduan Memulai (Getting Started)

### Kebutuhan Sistem (Prerequisites)
- **Node.js** ≥ 18.x
- **PostgreSQL** ≥ 15.x
- **npm** (atau pnpm / yarn)

### 1. Clone & Instalasi

```bash
git clone <repository-url>
cd constella
npm install
```

### 2. Konfigurasi Environment (`.env`)

Salin file `.env.example` menjadi `.env`:

```bash
cp .env.example .env
```

Sesuaikan nilai variabel:

```env
# ==============================================================================
# Database Configuration (PostgreSQL + Prisma)
# ==============================================================================
DATABASE_URL="postgresql://postgres:password@localhost:5432/constella?schema=public"

# ==============================================================================
# AI / LLM Configuration (Structured Lore Extraction)
# Dapatkan Gemini key gratis di: https://aistudio.google.com/app/apikey
# ==============================================================================
GEMINI_API_KEY="your-gemini-api-key"

# Rantai model Gemini dieksekusi berurutan jika terjadi limit/error:
GEMINI_MODEL="gemini-3.5-flash, gemini-3.5-flash-lite, gemini-flash-lite-latest, gemini-3.1-flash-lite"

# Groq API Fallback (digunakan jika kuota harian Gemini habis)
# Dapatkan Groq key di: https://console.groq.com/keys
GROQ_API_KEY="your-groq-api-key"
GROQ_MODEL="openai/gpt-oss-120b,llama-3.3-70b-versatile"

# ==============================================================================
# Security & Admin Authentication
# ==============================================================================
# Token rahasia yang melindungi seluruh endpoint admin & operasi mutasi.
# Di lokal boleh nilai default; di production WAJIB di-set ke string acak panjang.
ADMIN_SECRET="constella-admin-secret"

# ==============================================================================
# Serverless Stability (opsional)
# ==============================================================================
# Set "true" hanya di server/VM/VPS untuk mengaktifkan daemon in-app.
# Biarkan kosong saat deploy serverless (Vercel) — gunakan cron eksternal.
ENABLE_IN_APP_DAEMON=""
```

### 3. Setup Database & Migrasi

```bash
# Generate Prisma Client
npx prisma generate

# Jalankan migrasi skema database
npx prisma migrate dev --name init

# Jalankan seed data uji coba (memuat seluruh kasus uji temporal)
npx prisma db seed
```

### 4. Menjalankan Aplikasi

```bash
npm run dev
```

Buka peramban di [http://localhost:3000](http://localhost:3000).

### 5. Otorisasi Admin (Opsional untuk Lokal)

Pada `NODE_ENV !== "production"` tanpa `ADMIN_SECRET`, endpoint admin dapat diakses tanpa token untuk mempermudah pengembangan. Untuk simulasi produksi, set `ADMIN_SECRET` di `.env` lalu buka halaman `/admin` dan klik **"Set Admin Token"** di header untuk menyimpan cookie sesi.

---

## 🛠️ CLI Skrip & Otomatisasi Data

Proyek ini menyediakan serangkaian skrip CLI untuk manajemen data katalog dan ekstraksi lore:

| Perintah | Deskripsi | Opsi Berguna |
|---|---|---|
| `npm run dev` | Menjalankan server Next.js lokal (Turbopack) | `-` |
| `npm run build` | Melakukan build bundle production (termasuk `postinstall: prisma generate`) | `-` |
| `npm run lint` | Memeriksa kepatuhan kode dengan ESLint | `-` |
| `npm run sync:daemon` | Menjalankan background worker daemon (per 6 jam) | `-` |
| `npm run sync:catalog` | Sinkronisasi katalog berkelanjutan | `-` |
| `npm run sync:ongoing` | Update metadata seri yang masih ongoing/releasing | `-` |
| `npm run sync:repair` | Memperbaiki dan memperbarui URL foto karakter live | `-` |
| `npx tsx -r dotenv/config scripts/seed-popular.ts` | **Tier 1:** Bulk ingest katalog judul populer dari AniList (tanpa AI) | `--pages=2`<br>`--perPage=20`<br>`--limit=40`<br>`--dry-run` |
| `npx tsx -r dotenv/config scripts/enrich-fandom.ts` | **Tier 2:** Ekstraksi dinamis kategori Fandom ke tabel review | `--title="Solo Leveling"`<br>`--limit=30`<br>`--dry-run` |
| `npx tsx -r dotenv/config scripts/enrich-all.ts` | **Tier 3:** Batch lore enrichment komprehensif langsung ke DB | `--mediaId=<uuid>`<br>`--series=<slug>`<br>`--limit=20` |
| `npx tsx -r dotenv/config scripts/ingest-fandom-cast.ts` | Ingest roster karakter dari wiki Fandom ke tabel review | `mediaId=<anilistId>`<br>`--limit=100`<br>`--dry-run` |
| `npx tsx -r dotenv/config scripts/backfill-live-chapters.ts` | Backfill jumlah bab live (MangaUpdates) untuk seri yang masih *releasing* | `-` |
| `npx tsx -r dotenv/config scripts/backfill-live-statuses.ts` | Backfix status rilis media via AniList (authoritative by `anilistId`) | `-` |
| `npx tsx -r dotenv/config scripts/backfill-ratings-and-status.ts` | Backfill rating konten & status rilis seluruh media via AniList | `-` |
| `npx tsx -r dotenv/config scripts/audit-wiki-resolution.ts` | Audit resolusi wiki seluruh katalog (deteksi seri tanpa karakter) | `--min-chars=5` |
| `npm run sync:lore:global` | Lore sync global seluruh katalog: cast ingest (no AI) → `enrich-all --limit=20` (AI, memakan token) | `-` |

> Semua skrip yang menyentuh database atau API eksternal wajib dijalankan lewat `npx tsx -r dotenv/config scripts/<nama>.ts` agar variabel dari `.env` termuat.

---

## 📡 Dokumentasi Endpoint API

### 🌐 Public API (Reader)

#### `GET /api/media/[mediaId]/graph?chapter=N`
Mengembalikan graf relasi bebas-spoiler untuk judul `mediaId` di bab `N`.

**Contoh Response Contract:**
```json
{
  "mediaId": "21b733f4-b322-4985-a847-c75caea6f028",
  "chapter": 50,
  "totalChapters": 200,
  "factions": [
    { "id": "uuid-fac-1", "name": "Baskerville Clan", "colorHex": "#dc2626" }
  ],
  "nodes": [
    {
      "id": "uuid-char-1",
      "name": "Vikir van Baskerville",
      "imageUrl": "https://...",
      "status": { "status": "Alive", "isSensitive": false },
      "description": { "text": "Swordmaster of the Ironblood...", "isSensitive": true },
      "factions": [ { "factionId": "uuid-fac-1", "isSensitive": false } ]
    }
  ],
  "edges": [
    {
      "id": "uuid-edge-1",
      "source": "uuid-char-1",
      "target": "uuid-char-2",
      "relationType": "Ally",
      "isSensitive": false
    }
  ]
}
```
> **Keamanan:** Field `validFrom`, `validUntil`, atau `introducedAtChapter` tidak pernah dimunculkan di response publik.

---

### 🔐 Admin API (CMS)

| Method | Endpoint | Deskripsi |
|---|---|---|
| `GET` | `/api/admin/sync` | Mendapatkan status daemon & log aktivitas sinkronisasi live |
| `POST` | `/api/admin/sync` | Menjalankan sinkronisasi katalog atau ekstraksi lore secara manual |
| `GET` | `/api/admin/review` | Mengambil daftar draft ingestion berstatus `PENDING` / `UNRESOLVED` |
| `POST` | `/api/admin/review/approve` | Menyetujui draft dan memindahkannya ke tabel aktif (idempotent) |
| `PATCH` | `/api/admin/relationships/[id]` | Mengubah rentang bab temporal (`validFrom`, `validUntil`) atau sensitivitas relasi |
| `DELETE` | `/api/admin/relationships/[id]` | Menghapus relasi dari database |

> **Otorisasi Admin:** Semua endpoint `/api/admin/*`, `DELETE /api/media/*`, dan `PUT /api/pages/*` dilindungi oleh **middleware edge** yang memvalidasi `ADMIN_SECRET` melalui salah satu:
> - Header `x-admin-token: <secret>`
> - Header `Authorization: Bearer <secret>`
> - Cookie `admin_token=<secret>` (dapat di-set via UI `/admin`)

---

## 🧪 Pengujian (Automated Testing)

Uji kepatuhan kebijakan *zero-leakage* dijalankan melalui skrip pengujian otomatis:

```bash
npx tsx tests/graph.test.ts
```

**Kriteria Uji yang Diverifikasi:**
1. **Zero-Leakage Assurance:** Melakukan iterasi bab $1 \le N \le totalChapters$ pada data seed dan memastikan tidak ada data dengan `validFrom > N` atau `introducedAtChapter > N` yang bocor.
2. **Dangling Edge Elimination:** Memastikan seluruh `source` dan `target` pada array `edges` terdaftar valid di array `nodes`.
3. **Temporal Metadata Hygiene:** Menjamin tidak ada atribut `validFrom`, `validUntil`, atau `introducedAtChapter` pada response client.
4. **Spoiler Toggle Isolation:** Memastikan logika `isSensitive` independen dari query database dan tersaring dengan benar di UI.

---

## 📄 Lisensi, Atribusi & Hak Cipta

Proyek Skripsi Sarjana — Dikembangkan oleh **Graciano Tilaar**.
Hak Cipta Dilindungi Undang-Undang.

### Atribusi Sumber Data (Wajib)

Constella menyandarkan data pada sumber publik berikut dan wajib mencantumkan kreditnya:

| Sumber | Kontribusi | Lisensi |
|---|---|---|
| **[AniList GraphQL API](https://anilist.co)** | Metadata judul, sampul resmi, genre, negara asal, dan status rilis manga/manhwa | ToS AniList (non-commercial) |
| **[Fandom Community Wikis](https://fandom.com)** | Teks profil karakter, biografi, dan ringkasan alur cerita. Penemuan wiki melalui layanan pencarian resmi `services.fandom.com/unified-search` | [CC-BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) |
| **[Wikipedia](https://en.wikipedia.org)** | Sumber cadangan karakter: artikel "List of ... characters" dan bagian karakter pada artikel seri, ketika wiki Fandom tidak memadai | [CC-BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |
| **[Kitsu API](https://kitsu.io)** | Sumber cadangan daftar karakter per media, nama alternatif, potret karakter, dan bio singkat; juga status rilis dan verifikasi identitas seri via mapping `anilist/manga` | Kitsu ToS (community database) |
| **[MangaUpdates API](https://www.mangaupdates.com)** | Jumlah bab terkini untuk seri yang masih *ongoing* (AniList melaporkan `chapters: null` untuk seri yang belum tamat) | MangaUpdates ToS |

**Urutan sumber karakter:** wiki Fandom (dedicated) → section hub Fandom → artikel karakter Wikipedia → bio Kitsu → sintesis AI murni. Teks dari sumber mana pun melewati tahap ekstraksi AI yang sama, sehingga batas bab temporal tetap ditegakkan identik.

**Urutan jumlah bab:** AniList → MangaUpdates → nilai tersimpan → *floor* 100 (hanya bila semua sumber gagal).

Atribusi lengkap dapat dilihat pada halaman `/about` dan footer global yang tampil di seluruh halaman.

### Atribusi Teknologi

Dibangun di atas stack berikut: **Next.js 16** (App Router), **TypeScript 5**, **Prisma 7** + **PostgreSQL 17**, **Tailwind CSS 4**, **Cytoscape.js 3.34**, **Google Gemini SDK**, dan **Groq API**.
