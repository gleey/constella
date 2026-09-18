# 🗺️ Spoiler-Free Dynamic Character & Story Map

> Platform web interaktif yang menyajikan peta relasi karakter manga/manhwa berbasis *temporal graph* — visualisasi berubah otomatis sesuai bab yang sedang dibaca, **tanpa membocorkan jalan cerita**.

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-7-2D3748?logo=prisma)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-4169E1?logo=postgresql&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)

---

## ✨ Fitur Utama

| Fitur | Deskripsi |
|-------|-----------|
| **Peta Relasi Bebas Spoiler** | Graf hubungan antar-karakter yang difilter presisi berdasarkan posisi *chapter slider* — data `validFrom > N` tidak pernah dikirim ke client |
| **Two-Layer Spoiler System** | Layer 1 (chapter filter) di backend menjamin keamanan struktural; Layer 2 (`isSensitive` toggle) memberi kontrol UX tambahan |
| **Temporal Graph** | Relasi, status, deskripsi, dan keanggotaan faksi berubah sesuai progress bab — mendukung karakter yang mati, berganti faksi, atau berubah aliansi |
| **Hybrid AI Ingestion** | Pipeline AniList → Fandom scraping → Gemini API extraction dengan admin review sebelum publikasi |
| **Name Resolution** | Pencocokan otomatis nama karakter dari output LLM ke database, dengan fallback manual untuk nama yang ambigu |
| **Graph Layout Persistence** | Node yang sudah ada tetap di posisinya saat slider digeser — hanya node baru yang di-layout ulang |

---

## 🏗️ Tech Stack

| Layer | Teknologi |
|-------|-----------|
| **Frontend** | Next.js 16, React 19, TypeScript 5, Tailwind CSS 4, Cytoscape.js |
| **Backend** | Next.js Server Actions & API Routes |
| **Database** | PostgreSQL + Prisma ORM 7 |
| **AI/LLM** | Google Gemini API (`@google/genai`), Groq API (fallback) |
| **External API** | AniList GraphQL API, Fandom MediaWiki API |

---

## 📁 Struktur Proyek

```
spoiler-free-map/
├── prisma/
│   ├── migrations/          # Database migrations
│   ├── schema.prisma        # Data model (temporal entities)
│   └── seed.ts              # Seed data dengan test cases lengkap
├── scripts/
│   ├── enrich-all.ts        # Batch enrichment script
│   ├── run-background-daemon.ts  # Background sync daemon
│   └── sync-all-live-images.ts   # Image sync utility
├── src/
│   ├── app/
│   │   ├── admin/           # CMS admin pages (ingest, review)
│   │   ├── api/             # API routes (admin, media graph)
│   │   ├── media/[id]/      # Reader graph visualization page
│   │   └── page.tsx         # Homepage / media catalog
│   ├── components/
│   │   ├── AdminDrawer.tsx  # Admin panel drawer
│   │   ├── ChapterSlider.tsx & ChapterDropdown.tsx  # Chapter controls
│   │   ├── CharacterModal.tsx    # Character detail modal
│   │   ├── CharacterSearch.tsx   # Character search
│   │   ├── FloatingPanel.tsx     # Floating info panel
│   │   ├── GraphCanvas.tsx       # Cytoscape.js graph renderer
│   │   ├── Navbar.tsx            # Navigation bar
│   │   └── SpoilerToggle.tsx     # Spoiler reveal/hide toggle
│   ├── generated/prisma/    # Auto-generated Prisma client
│   └── lib/
│       ├── anilist.ts       # AniList GraphQL API client
│       ├── fandom.ts        # Fandom MediaWiki scraper
│       ├── gemini.ts        # Gemini AI extraction logic
│       ├── name-resolution.ts  # Name matching & deduplication
│       ├── temporal.ts      # Temporal validation (validFrom/validUntil)
│       ├── background-sync.ts  # Background synchronization
│       └── prisma.ts        # Prisma client singleton
├── tests/
│   └── graph.test.ts        # Zero-spoiler leakage tests
└── PRD.md                   # Project Requirement Document (v3)
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** ≥ 18
- **PostgreSQL** ≥ 15
- **npm** (atau yarn/pnpm)

### 1. Clone & Install

```bash
git clone <repository-url>
cd spoiler-free-map
npm install
```

### 2. Setup Environment

```bash
cp .env.example .env
# Edit .env dengan credentials database dan API keys Anda
```

| Variable | Deskripsi |
|----------|-----------|
| `DATABASE_URL` | Connection string PostgreSQL |
| `GEMINI_API_KEY` | Google Gemini API key ([dapatkan di sini](https://aistudio.google.com/app/apikey)) |
| `GEMINI_MODEL` | Model Gemini yang digunakan (mendukung fallback chain, pisahkan dengan koma) |
| `GROQ_API_KEY` | *(Opsional)* Groq API key sebagai fallback jika Gemini rate-limited |
| `GROQ_MODEL` | *(Opsional)* Model Groq yang digunakan |

### 3. Setup Database

```bash
# Generate Prisma client
npx prisma generate

# Jalankan migrasi database
npx prisma migrate dev

# (Opsional) Seed database dengan data contoh
npx prisma db seed
```

### 4. Run Development Server

```bash
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000) di browser.

---

## 📡 API Endpoints

### Public API

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| `GET` | `/api/media/[mediaId]/graph?chapter=N` | Mengambil graf relasi yang difilter untuk chapter N |

### Admin API

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| `POST` | `/api/admin/ingest` | Memulai ingestion pipeline (AniList → Fandom → Gemini) |
| `GET` | `/api/admin/review` | Mengambil daftar draft untuk di-review |
| `POST` | `/api/admin/review/approve` | Approve draft dan pindahkan ke tabel aktif |

---

## 🔒 Zero-Spoiler Architecture

Sistem perlindungan spoiler terdiri dari dua layer independen:

```
┌──────────────────────────────────────────────────────┐
│  Layer 1: Chapter Filter (Backend — Non-Negotiable)  │
│  ─────────────────────────────────────────────────── │
│  • WHERE validFrom <= N AND (validUntil > N OR NULL) │
│  • Edge validasi dua sisi (source & target exist)    │
│  • Metadata temporal TIDAK dikirim ke client          │
│  • Evaluasi sepenuhnya di database query              │
└──────────────────────────────────────────────────────┘
                        ↓ data yang lolos
┌──────────────────────────────────────────────────────┐
│  Layer 2: Sensitivity Flag (Frontend — UX Control)   │
│  ─────────────────────────────────────────────────── │
│  • isSensitive: true → konten collapsed [Spoiler ▼]  │
│  • Reveal-state di-reset setiap slider berubah       │
│  • Edge sensitive: label generik sampai diklik        │
└──────────────────────────────────────────────────────┘
```

---

## 🧪 Testing

```bash
# Jalankan zero-spoiler leakage test
npx tsx tests/graph.test.ts
```

Test mencakup:
- ✅ Tidak ada item dengan `validFrom > N` di response
- ✅ Tidak ada edge menggantung (dangling edges)
- ✅ Tidak ada metadata temporal di payload publik
- ✅ Reveal-state reset saat chapter slider berubah

---

## 🛠️ Scripts

| Script | Deskripsi |
|--------|-----------|
| `npm run dev` | Jalankan development server |
| `npm run build` | Build production bundle |
| `npm run lint` | Jalankan ESLint |
| `npm run sync:daemon` | Jalankan background sync daemon |
| `npm run sync:repair` | Sinkronisasi ulang semua gambar karakter |

---

## 📄 Lisensi

Proyek skripsi — hak cipta dilindungi.
