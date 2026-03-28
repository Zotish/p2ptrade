# P2P Escrow Platform

This repo contains a React frontend and an Express backend for a P2P crypto escrow marketplace.

## Structure
- `frontend` - React (Vite)
- `backend` - Express API

## Run (local)
1. `cd backend` and run `npm install`, then `npm run dev`.
2. `cd frontend` and run `npm install`, then `npm run dev`.

Backend listens on `http://localhost:4000`.
Frontend listens on `http://localhost:5173`.

## Database
SQLite is used by default (no external server). The DB file is created automatically at `backend/data/p2p.db`.

## Auth
Signup: `POST /auth/signup` with `{ email, password, handle?, phone? }`
Login: `POST /auth/login` with `{ email, password }`
Use the returned `token` as `Authorization: Bearer <token>`.
Creating offers and orders requires auth and uses the token user id.

## Next steps
- Replace mock pricing with live price feeds.
- Implement real escrow and chain watchers.
- Add payment integrations per country.
# p2ptrade
