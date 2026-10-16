import { GameServerProvider, useGameServer } from "@agent8/gameserver";
import { useMemo } from "react";
import { wantsOnline } from "./net/connection";
import { LocalTransport, Verse8Transport } from "./net/transport";
import { DayFlow } from "./screens/DayFlow";

// Online once the build has a Verse8 project (.env's VITE_AGENT8_VERSE, after the GitLab link);
// until then, or with ?local in a development build, the server's rules run in the page.
const online = wantsOnline(import.meta.env.VITE_AGENT8_VERSE, location.search, import.meta.env.DEV);

export function App() {
  if (!online) return <LocalApp />;
  return (
    <GameServerProvider>
      <OnlineApp />
    </GameServerProvider>
  );
}

function LocalApp() {
  const transport = useMemo(() => new LocalTransport(window.localStorage), []);
  // the shop buys through the same in-page rules here (src/net/shop.ts)
  return <DayFlow transport={transport} localShop={transport} />;
}

function OnlineApp() {
  const { server, connected } = useGameServer();
  const transport = useMemo(() => (server ? new Verse8Transport(server) : null), [server]);
  if (!connected || !transport) return <div className="dayflow-wait">…</div>;
  return <DayFlow transport={transport} localShop={null} />;
}
