import { PhaserGame } from "./game/PhaserGame";

// Hunt only until the day flow lands (plan 02 Task 7): the result goes to the console.
export function App() {
  return <PhaserGame onHuntEnd={(result) => console.info("hunt:end", JSON.stringify(result))} />;
}
