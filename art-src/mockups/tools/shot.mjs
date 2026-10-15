// Screenshots of the real kitchen at 1280x720 (headless Chrome over CDP), after the seed save:
//   S=<scratch dir> node art-src/mockups/tools/shot.mjs <out-prefix> "<js step>" ...
// each step runs in the page, then one screenshot <out-prefix>_<n>.png is taken
import { spawn } from "node:child_process";
import { writeFileSync, rmSync } from "node:fs";
const S = process.env.S;
const [prefix, ...steps] = process.argv.slice(2);
rmSync(`${S}/chrome-cdp`, { recursive: true, force: true });
const chrome = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1", "--window-size=1280,720", `--user-data-dir=${S}/chrome-cdp`, "--remote-debugging-port=9333", "about:blank"]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let list;
for (let i = 0; i < 50; i++) { try { list = await (await fetch("http://127.0.0.1:9333/json")).json(); if (list.find((t) => t.type === "page")) break; } catch {} await sleep(200); }
const ws = new WebSocket(list.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const wait = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (wait.has(d.id)) { wait.get(d.id)(d); wait.delete(d.id); } };
const call = (method, params = {}) => new Promise((r) => { const n = ++id; wait.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
await call("Emulation.setDeviceMetricsOverride", { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
await call("Page.navigate", { url: "http://localhost:5190/art-src/mockups/seed-kitchen.html" });
await sleep(6000);
let n = 0;
for (const js of steps) {
  const r = await call("Runtime.evaluate", { expression: js, returnByValue: true });
  console.log(n, JSON.stringify(r.result?.result?.value ?? r.result?.exceptionDetails?.text));
  await sleep(800);
  const shot = await call("Page.captureScreenshot", { format: "png" });
  writeFileSync(`${prefix}_${n++}.png`, Buffer.from(shot.result.data, "base64"));
}
ws.close(); chrome.kill();
