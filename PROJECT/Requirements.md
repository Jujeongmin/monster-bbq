# Requirements — 몬스터 고깃집

## Coding Patterns

- Use Vite + React + TypeScript.
- Keep the current screen limited to the single Korean message "준비 중"; do not add gameplay until requested or supplied by the external repository.
- Keep player-visible copy in `src/locales/ko.json`.
- Keep Agent8 server code in the structured `server/src/server.ts` project.
- Register new image/asset URLs under `src/assets.json` rather than hardcoding.

## Known Issues / Constraints

- No gameplay, networking behavior, routes, or game assets are implemented in this scaffold.
- `server/src/server.ts` exposes only the generic `ping()` setup check; no game state or room behavior exists yet.
