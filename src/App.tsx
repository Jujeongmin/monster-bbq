import { PhaserGame } from "./game/PhaserGame";

// Local-only prototype for now: the Verse8 game server (GameServerProvider) is wired in once the
// project is linked to GitLab and has its .env / .agent8.lock.
export function App() {
  return <PhaserGame />;
}
