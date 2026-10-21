import { describe, expect, it } from "vitest";
import { makeBgm } from "./bgm";

const setup = (urls: Record<string, string> = { day: "day.mp3", night: "night.mp3" }) => {
  const log: string[] = [];
  let muted = false;
  const bgm = makeBgm({
    urls,
    make: (url) => ({ play: () => void log.push(`play ${url}`), pause: () => void log.push(`stop ${url}`), volume: 1, loop: false }),
    isMuted: () => muted,
  });
  return { bgm, log, mute: (m: boolean) => (muted = m) };
};

describe("the background music", () => {
  it("waits for the player's first key or tap, then plays the scene's track on a loop", () => {
    const { bgm, log } = setup();
    bgm.set("day");
    expect(log).toEqual([]);
    bgm.unlock();
    expect(log).toEqual(["play day.mp3"]);
  });
  it("changes track with the scene and does not restart the same one", () => {
    const { bgm, log } = setup();
    bgm.unlock();
    bgm.set("day");
    bgm.set("day");
    bgm.set("night");
    expect(log).toEqual(["play day.mp3", "stop day.mp3", "play night.mp3"]);
  });
  it("goes quiet for a scene with no track yet", () => {
    const { bgm, log } = setup();
    bgm.unlock();
    bgm.set("day");
    bgm.set("hunt");
    expect(log).toEqual(["play day.mp3", "stop day.mp3"]);
  });
  it("stops when muted and picks the scene's track up again when unmuted", () => {
    const { bgm, log, mute } = setup();
    bgm.unlock();
    bgm.set("night");
    mute(true);
    bgm.refresh();
    mute(false);
    bgm.refresh();
    expect(log).toEqual(["play night.mp3", "stop night.mp3", "play night.mp3"]);
  });
});
