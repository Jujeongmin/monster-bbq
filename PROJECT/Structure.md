# Structure — 몬스터 고깃집

## `src/main.tsx`

Entry point. Mounts `<App />` into `#root` via `createRoot`, wrapped in `StrictMode`. Imports `index.css`.

## `src/App.tsx`

Root component. Displays only the localized "준비 중" placeholder.

## `src/App.css`

Component-scoped styles center the placeholder text on the page.

## `src/index.css`

Global stylesheet — Tailwind directives, page reset, and base typography/colors.

## `src/locales/ko.json`

Korean player-facing text. Keep screen copy here rather than embedding it in components.

## `src/assets.json`

Asset manifest. Empty (`{ "images": {} }`) until project assets are introduced.

## `server/src/server.ts`

Exported Agent8 GameServer 2.x `Server` class. Currently contains only a `ping()` setup check; gameplay and room logic have not been added.

## `server/test/server.test.ts`

Server test covering the `ping()` setup check.
