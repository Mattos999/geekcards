# PRD — Geek Cards TCG Deck Manager

## Original Problem Statement
User (PT-BR) requested a deck manager for their TCG "Geek Cards". Game has 14 Natures in a weakness chain, cards with up to 3 characteristics, 4 card types (Personagem/Item/Mestre/Energia), rarity 1-3★ + ALPHA version, 20-card deck limit with max 2 duplicates (ALPHA exception).

## User Choices (gathered)
- Card types: Personagem + Item + Mestre + Energia
- Card builder: yes (user-created library)
- Image upload: yes (object storage)
- Strategic analysis: yes
- Auth: email/password (multi-user)

## Architecture
- **Backend**: FastAPI + MongoDB (motor). JWT auth (httpOnly cookie + Bearer fallback), bcrypt password hashing. Emergent Object Storage for card images.
- **Frontend**: React 19 + react-router v7 + Tailwind + Recharts + Sonner toasts. Outfit/Manrope/JetBrains Mono fonts. Dark glass theme with per-nature color coding.

## Core Features Implemented (2026-04-24)
- ✅ Auth: register/login/logout/me (`/api/auth/*`)
- ✅ Natures API exposing 14 natures + weakness/advantage maps
- ✅ Card CRUD with validation (max 3 natures, type/rarity checks)
- ✅ Card builder with live preview + natures toggle + image upload
- ✅ Card library with search/nature/type/ALPHA filters
- ✅ Deck CRUD (list/create/update/delete)
- ✅ Deck builder (library | deck | analysis 3-column layout)
- ✅ Deck rules enforcement: 20-card max, 2-duplicate max with warnings
- ✅ Strategic analysis: nature coverage radar, type distribution, avg HP/damage, top vulnerabilities
- ✅ Image upload to Emergent object storage + authenticated download
- ✅ Seeded admin account (admin@geekcards.com / admin123)

## Test Results (iter 1)
- Backend: 100% (15/15 pytest)
- Frontend: 100% (login → dashboard → card create → library → deck flows verified)

## Backlog / Next Priorities
- **P1**: ALPHA duplicate rule fine-tuning (currently max 2 same-named — verify semantics with user)
- **P1**: Deck import/export (JSON/text)
- **P2**: Deck sharing via public URL
- **P2**: Brute-force lockout on login (5 failed → 15min)
- **P2**: CORS explicit origin list (currently `*`)
- **P3**: Card marketplace/community library
- **P3**: Play-test simulator (2-player matchmaking)
