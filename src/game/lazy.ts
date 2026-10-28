import { lazy } from "react";

// Phaser (the hunt and the night without WebGL) in a file of its own (loading pass, user 2026-10-28): the
// page's first script is smaller, so the loading screen comes up sooner. The loading screen fetches these
// alongside the pictures (loadGameChunks), so a hunt never waits on them.
const hunt = () => import("./PhaserGame");
const night = () => import("./service/ServiceGame");

export const PhaserGame = lazy(() => hunt().then((m) => ({ default: m.PhaserGame })));
export const ServiceGame = lazy(() => night().then((m) => ({ default: m.ServiceGame })));
export const loadGameChunks = (): Promise<unknown> => Promise.all([hunt(), night()]);
