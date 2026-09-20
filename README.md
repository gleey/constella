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
│   │   ├── globals.css      # Desain tema gelap modern (Tailwind v4)
│   │   ├── layout.tsx       # Root layout & font Geist
│   │   └── page.tsx         # Katalog media & beranda utama
│   ├── components/
│   │   ├── AdminDrawer.tsx  # Quick admin management drawer
│   │   ├── ChapterDropdown.tsx & ChapterSlider.tsx # Kontrol pemilihan bab
│   │   ├── CharacterModal.tsx    # Modal detail profil, status, & timeline karakter
│   │   ├── CharacterSearch.tsx   # Fitur pencarian instan karakter pada kanvas
│   │   ├── FloatingPanel.tsx     # Panel navigasi melayang & statistik graf
│   │   ├── GraphCanvas.tsx       # Engine Cytoscape.js (orbit faksi, persistensi koordinat)
│   │   ├── Navbar.tsx            # Bar navigasi utama
│   │   └── SpoilerToggle.tsx     # Komponen reveal/collapse spoiler
│   ├── generated/prisma/    # Prisma client yang di-generate otomatis
│   └── lib/
│       ├── anilist.ts       # GraphQL client AniList (katalog judul, cover, karakter)
│       ├── fandom.ts        # Scraper MediaWiki Fandom (paginasi kategori & infobox)
│       ├── gemini.ts        # Gemini AI extractor (JSON schema, fallback chain ke Groq)
│       ├── name-dedupe.ts   # Normalisasi nama & heuristik penggabungan duplikat
│       ├── name-resolution.ts # Resolusi target nama LLM ke database Foreign Key
│       ├── temporal.ts      # Validasi batasan waktu temporal validFrom/validUntil
│       ├── background-sync.ts # Engine sinkronisasi berkala otomatis
│       └── prisma.ts        # Prisma client singleton
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

---

## 🛠️ CLI Skrip & Otomatisasi Data

Proyek ini menyediakan serangkaian skrip CLI untuk manajemen data katalog dan ekstraksi lore:

| Perintah | Deskripsi | Opsi Berguna |
|---|---|---|
| `npm run dev` | Menjalankan server Next.js lokal (Turbopack) | `-` |
| `npm run build` | Melakukan build bundle production | `-` |
| `npm run lint` | Memeriksa kepatuhan kode dengan ESLint | `-` |
| `npm run sync:daemon` | Menjalankan background worker daemon | Sinkronisasi per 6 jam |
| `npm run sync:repair` | Memperbaiki dan memperbarui URL foto karakter live | `-` |
| `npx tsx -r dotenv/config scripts/seed-popular.ts` | **Tier 1:** Bulk ingest katalog judul populer dari AniList (tanpa AI) | `--pages=2`<br>`--perPage=20`<br>`--limit=40`<br>`--dry-run` |
| `npx tsx -r dotenv/config scripts/enrich-fandom.ts` | **Tier 2:** Ekstraksi dinamis kategori Fandom ke tabel review | `--title="Solo Leveling"`<br>`--limit=30`<br>`--dry-run` |
| `npx tsx -r dotenv/config scripts/enrich-all.ts` | **Tier 3:** Batch lore enrichment komprehensif langsung ke DB | `--mediaId=<uuid>`<br>`--series=<slug>` |

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

## 📄 Lisensi & Hak Cipta

Proyek Skripsi Sarjana — Dikembangkan oleh **Graciano Tilaar**.  
Hak Cipta Dilindungi Undang-Undang.
