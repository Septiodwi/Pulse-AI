<h1 align="center">Pulse AI</h1>

<p align="center">
  <img src="docs/media/pulse-banner.svg" alt="Pulse AI | Dari sinyal sosial ke kalender publikasi" width="1200">
</p>

<p align="center">
  <a href="#tampilan-aplikasi">Tampilan aplikasi</a> ·
  <a href="#alur-sistem">Flowchart</a> ·
  <a href="#arsitektur">Arsitektur</a> ·
  <a href="#erd-mysql">ERD</a> ·
  <a href="#setup-lokal">Setup lokal</a> ·
  <a href="#rilis-produksi">Rilis</a>
</p>

Pulse AI mengubah sinyal media sosial menjadi konten siap ditinjau dan dijadwalkan. Tim mengelola profil produk, memantau temuan Signal Agent, membuat caption dan gambar, lalu menyetujui publikasi lewat Tebar.

## Tampilan aplikasi

Cuplikan UI Pulse dengan akun dan konten demo.

### Dashboard

![Dashboard Pulse dengan ringkasan status konten dan jadwal](docs/media/dashboard.png)

| Kalender Konten | Signal Agent |
| --- | --- |
| ![Kalender publikasi dengan konten demo](docs/media/calendar.png) | ![Halaman pengaturan Signal Agent](docs/media/signal-agent.png) |
| Lihat jadwal, platform, dan status publikasi. | Kelola sumber, produk, dan jadwal pemantauan. |

## Alur sistem

```mermaid
flowchart TD
    U["Admin / anggota tim"] --> FE["Vue SPA"]
    FE -->|"HTTP API, cookie sesi, CSRF"| BE["Express API"]
    BE --> DB[("MySQL")]
    BE --> M["Generator manual"]
    BE --> S["Signal Agent"]
    S -->|"Pemicu manual atau jadwal"| A["Apify mengumpulkan sinyal"]
    A --> R["LLM menilai relevansi terhadap produk"]
    R -->|"Sinyal relevan"| G["LLM membuat caption dan gambar"]
    M --> G
    G --> D["Draft / Review"]
    D --> Q{"Keputusan admin"}
    Q -->|"Tolak"| X["Ditolak"]
    Q -->|"Setujui"| T["Tebar mengirim atau menjadwalkan"]
    T --> K["Kalender publikasi dan status"]
    BE --> K
```

## Arsitektur

```mermaid
flowchart LR
    Browser["Browser · Vue SPA"] -->|"HTTPS, origin sama"| Proxy["Reverse proxy"]
    Proxy -->|"Aset statis, fallback SPA"| Static["frontend/dist"]
    Proxy -->|"/api/*"| API["Express API · Node.js"]
    subgraph Backend["Satu proses backend"]
        API --> Auth["Sesi, CSRF, role dan izin modul"]
        API --> Content["Generator, publikasi dan kalender"]
        API -->|"Run manual"| Executor["Signal Agent executor"]
        Scheduler["Scheduler"] -->|"Run terjadwal"| Executor
        Executor -->|"Rekomendasi"| Content
    end
    Auth --> DB[("MySQL")]
    Content --> DB
    Executor --> DB
    Executor --> Apify["Apify"]
    Executor --> LLM["LLM OpenAI-compatible"]
    Content --> LLM
    Content --> Tebar["Tebar"]
    Tebar --> Social["Platform sosial"]
```

## ERD MySQL

Diagram menampilkan foreign key dan kolom utama. Akun sosial Tebar serta referensi produk, eksekusi, dan publikasi dalam `generated_content.payload` disimpan sebagai data aplikasi tanpa foreign key. `source_id` pada riwayat run dapat menjadi `NULL` saat sumber dihapus.

```mermaid
erDiagram
    users ||--o{ sessions : memiliki
    users ||--o{ agent_news_agents : membuat
    agent_news_agents ||--o{ agent_news_products : menargetkan
    products ||--o{ agent_news_products : ditargetkan
    agent_news_agents ||--o{ agent_news_sources : memiliki
    agent_news_agents ||--o{ agent_news_executions : menjalankan
    agent_news_executions ||--o{ agent_news_source_runs : mencatat
    agent_news_sources |o--o{ agent_news_source_runs : memicu
    agent_news_agents ||--o{ agent_news_contents : menemukan
    agent_news_executions ||--o{ agent_news_contents : menghasilkan
    agent_news_source_runs ||--o{ agent_news_contents : mengumpulkan
    agent_news_contents ||--o{ agent_news_content_products : terkait
    products ||--o{ agent_news_content_products : terkait
    users {
        char id PK
        varchar email UK
        enum role
        json access_grants
    }
    sessions {
        char token_hash PK
        char user_id FK
        timestamp expires_at
    }
    products {
        char id PK
        varchar name
        json linked_accounts
    }
    agent_news_agents {
        char id PK
        char created_by FK
        varchar status
        datetime next_run_at
    }
    agent_news_products {
        char agent_id PK,FK
        char product_id PK,FK
    }
    agent_news_sources {
        char id PK
        char agent_id FK
        varchar platform
        varchar actor_id
    }
    agent_news_executions {
        char id PK
        char agent_id FK
        varchar status
    }
    agent_news_source_runs {
        char id PK
        char execution_id FK
        char source_id FK
        varchar status
    }
    agent_news_contents {
        char id PK
        char agent_id FK
        char execution_id FK
        char source_run_id FK
    }
    agent_news_content_products {
        char content_id PK,FK
        char product_id PK,FK
    }
    generated_content {
        char id PK
        varchar signal_key UK
        enum status
        json payload
    }
    app_settings {
        tinyint id PK
        varchar app_name
        varchar timezone
    }
    schema_migrations {
        varchar name PK
        timestamp applied_at
    }
```

## Teknologi dan struktur

| Lokasi | Teknologi | Tanggung jawab |
| --- | --- | --- |
| [frontend/](frontend/) | Vue 3, Vite 8, TypeScript | Dashboard, akun, produk, Signal Agent, generator konten, kalender |
| [backend/](backend/) | Node.js 26+, Express 5, TypeScript, Zod | API, otorisasi, scheduler, integrasi provider |
| [backend/migrations/](backend/migrations/) | MySQL 9.7 | Skema dan migrasi data |
| [compose.yml](compose.yml) | Docker Compose | MySQL lokal |

Frontend dan backend memiliki dependency, konfigurasi, dan build sendiri. API dan scheduler Signal Agent berjalan dalam satu proses backend.

## Setup lokal

Perlu Node.js 26+, npm, Docker Compose, dan OpenSSL. Jalankan dari root repo.

```bash
cp .env.example .env
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
openssl rand -base64 32
```

Samakan `DATABASE_PASSWORD` di kedua file env. Isi `MYSQL_ROOT_PASSWORD` di root, serta `SETTINGS_ENCRYPTION_KEY`, `ADMIN_EMAIL`, dan `ADMIN_PASSWORD` di backend. Gunakan hasil OpenSSL sebagai kunci enkripsi.

```bash
docker compose up -d --wait mysql
npm --prefix backend ci
npm --prefix backend run migrate
npm --prefix backend run seed
npm --prefix backend run dev
```

Di terminal kedua dari root repo:

```bash
npm --prefix frontend ci
npm --prefix frontend run dev
```

Buka [web lokal](http://localhost:5173). API tersedia di [localhost:3000](http://localhost:3000/api/health).

## Integrasi

- **Apify** mengumpulkan sinyal untuk Signal Agent.
- **LLM OpenAI-compatible** menilai relevansi dan menghasilkan teks serta gambar. Provider perlu mendukung `POST /chat/completions` dan `POST /images/edits` dengan respons gambar base64. Tes koneksi model memakai `GET /models`.
- **Tebar** menyediakan akun sosial, publikasi, penjadwalan, dan status post.

Konfigurasikan melalui Settings. Kredensial provider tersimpan terenkripsi di MySQL. Mutasi API memerlukan CSRF dan akses ditentukan oleh role atau izin modul.

## Verifikasi

```bash
npm --prefix backend run build
npm --prefix backend run test:coverage
npm --prefix frontend run build
npm --prefix frontend run test:coverage
(cd frontend && npx playwright install chromium && npm run e2e)
```

## Rilis produksi

1. Sajikan `frontend/dist` melalui HTTPS dengan fallback SPA ke `index.html`. Teruskan `/api/*` ke Express pada origin yang sama. Build FE dengan `VITE_API_URL=`. Set `FRONTEND_URL` ke origin publik dan `NODE_ENV=production` di BE.
2. Set `PROVIDER_ORIGINS` ke daftar origin HTTPS provider yang disetujui. Simpan `SETTINGS_ENCRYPTION_KEY` bersama secret rilis agar kredensial pada backup tetap dapat dibaca.
3. Jalankan satu proses API per skema MySQL. Hentikan API, ambil snapshot, lalu jalankan `node dist/db/migrate.js` dari backend, dengan direktori `migrations/` tersedia. Jalankan `node dist/db/seed.js` pada instalasi baru.
4. Mulai API dengan `npm start` dari backend. Pastikan `GET /api/health` mengembalikan 200. Jika migrasi gagal sebagian, pulihkan snapshot sebelum mengulang. Untuk rollback lintas skema, pulihkan snapshot lalu gunakan artefak FE/BE versi sebelumnya.

**Status audit:** smoke HTTPS lokal dan restore MySQL lolos. Rilis masih menunggu coverage backend 80% dan verifikasi idempotensi publikasi dengan Tebar live.
