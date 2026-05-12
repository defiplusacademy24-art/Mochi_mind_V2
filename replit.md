# MochiMind

A visual color-guessing game where players compete against Validator AI (GenLayer on-chain) to identify Mochi character's dominant colors through 20 blur stages.

## Run & Operate

- `pnpm --filter @workspace/mochi-mind run dev` — run the game frontend (dev)
- `pnpm --filter @workspace/mochi-mind run typecheck` — typecheck the frontend
- `pnpm --filter @workspace/mochi-mind run build` — production build (Vercel-ready)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + TanStack Router + Tailwind v4 + Framer Motion
- On-chain AI: genlayer-js 1.1.8, GenLayer Studio (studionet)
- Chain: studionet (chainId 61999, RPC: https://studio.genlayer.com/api)

## Where things live

- `artifacts/mochi-mind/` — main game app (frontend only, no API server needed)
- `artifacts/mochi-mind/src/game/validator.ts` — GenLayer on-chain + local fallback logic
- `artifacts/mochi-mind/src/game/stages.ts` — 20 game stages definition
- `artifacts/mochi-mind/src/routes/play.tsx` — main game screen
- `artifacts/mochi-mind/src/routes/index.tsx` — landing page
- `artifacts/mochi-mind/vercel.json` — Vercel deployment config
- `artifacts/mochi-mind/src/assets/stages/` — Mochi stage images (PNG)

## Architecture decisions

- **writeContract → waitForTransactionReceipt → readContract**: GenLayer's `submit_pick` triggers full AI consensus (non-deterministic); `get_last_result()` is a deterministic storage read. A plain `gen_call` cannot run LLM validators.
- **Spender wallet covers gas**: `VITE_SPENDER_PRIVATE_KEY` (secret) funds all contract calls — players never need a wallet.
- **Local consensus fallback**: If Studio is unreachable or times out (>4 min), 3 simulated validators (Visual, Perceived, Identity strategies) produce a result.
- **Replit-specific Vite plugins are dev-only**: `runtimeErrorOverlay`, `cartographer`, `devBanner` are excluded from production builds, making Vercel builds clean.
- **SPA routing**: `vercel.json` rewrites all paths to `/index.html`; TanStack Router handles client-side routing.

## Product

- 20 stages of increasingly revealing Mochi character art
- Players pick 2 dominant colors from 4 options within a 20s timer
- Validator AI runs on-chain via GenLayer Studio (5 AI validators reach consensus)
- Live MM:SS consensus counter shown during on-chain wait (60–120s typical)
- Scores tracked: You vs Validator AI; endgame screen with title based on performance

## User preferences

- Contract address: `0x2Ce9ec4668DA02893D6B6bB5128c77Ef3c40B7ee` (GenLayer Studio)
- Deploy target: Vercel (vercel.json in `artifacts/mochi-mind/`)

## Gotchas

- `VITE_SPENDER_PRIVATE_KEY` must be set (Replit secret) — without it, all rounds fall back to local consensus
- `VITE_STUDIO_CONTRACT` env var overrides the hardcoded fallback contract address
- On Vercel: set `VITE_SPENDER_PRIVATE_KEY` and `VITE_STUDIO_CONTRACT` in Vercel's Environment Variables settings
- Vercel root directory must be set to `artifacts/mochi-mind` in Vercel project settings
- GenLayer consensus takes 60–120s; the UI shows a live timer so players know to wait
- `pnpm install` (not `--frozen-lockfile`) is used in the Vercel build command for compatibility

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
