# Context — 몬스터 고깃집

## Project Overview

Minimal Vite + React + TypeScript starting point for the Korean 2D web game project "몬스터 고깃집". The visible page intentionally contains only the localized placeholder "준비 중". Gameplay is not implemented in this project scaffold; the game code is expected to be pushed from an external repository.

## Tech Stack

_Exact versions are in `package.json`._

- **Framework**: React, React DOM
- **Build / Lang**: Vite, TypeScript
- **Styling**: Tailwind CSS, PostCSS (autoprefixer), small custom CSS
- **Game server**: Agent8 GameServer SDK 2.x with the structured TypeScript project in `server/`
- **Player-facing strings**: `src/locales/ko.json`

## Critical Memory

- Keep the initial screen as a placeholder until game code is supplied from the external repository.
- Agent8 server functions must remain exported methods on `server/src/server.ts`.
