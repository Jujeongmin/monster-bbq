// Screenshots of the real kitchen at 1280x720 (headless Chrome over CDP), after the seed save:
//   S=<scratch dir> node art-src/mockups/tools/shot.mjs <out-prefix> "<js step>" ...
// each step runs in the page, then one screenshot <out-prefix>_<n>.png is taken
import { spawn } from "node:child_process";
import { writeFileSync, rmSync } from "node:fs";
const S = process.env.S;
const [prefix, ...steps] = process.argv.slice(2);
rmSync(`${S}/chrome-cdp`, { recursive: true, force: true });
const chrome = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1", `--window-size=${(process.env.SIZE ?? "1280x720").replace("x", ",")}`, `--user-data-dir=${S}/chrome-cdp`, "--remote-debugging-port=9333", "about:blank"]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let list;
for (let i = 0; i < 50; i++) { try { list = await (await fetch("http://127.0.0.1:9333/json")).json(); if (list.find((t) => t.type === "page")) break; } catch {} await sleep(200); }
const ws = new WebSocket(list.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const wait = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (wait.has(d.id)) { wait.get(d.id)(d); wait.delete(d.id); } };
const call = (method, params = {}) => new Promise((r) => { const n = ++id; wait.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
const [VW, VH] = (process.env.SIZE ?? "1280x720").split("x").map(Number);
await call("Emulation.setDeviceMetricsOverride", { width: VW, height: VH, deviceScaleFactor: 1, mobile: false });
await call("Page.navigate", { url: `http://localhost:5190/art-src/mockups/${process.env.SEED ?? "seed-kitchen"}.html` });
await sleep(Number(process.env.WAIT ?? 6000));
let n = 0;
// keyboard and mouse steps: "@hold W,A 800" holds keys for 800 ms, "@press E" taps a key, "@wait 1500" waits,
// "@mouse x y", "@click x y", "@rclick x y" (screen pixels);
// several may share one step, separated by ";". Anything else is JavaScript run in the page.
const KEY = (k) => (k === "Space" ? { key: " ", code: "Space", windowsVirtualKeyCode: 32 } : k === "Escape" ? { key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 } : { key: k.toLowerCase(), code: `Key${k}`, windowsVirtualKeyCode: k.charCodeAt(0) });
async function keys(cmd) {
  // "@clickjs" takes the whole step (its expression may hold ";")
  const parts = cmd.startsWith("@clickjs") ? [cmd] : cmd.split(";").map((p) => p.trim()).filter(Boolean);
  for (const part of parts) {
    const [op, a, b] = part.split(/\s+/);
    if (op === "@wait") await sleep(Number(a));
    else if (op === "@press") {
      await call("Input.dispatchKeyEvent", { type: "keyDown", ...KEY(a) });
      await sleep(80);
      await call("Input.dispatchKeyEvent", { type: "keyUp", ...KEY(a) });
    } else if (op === "@clickjs") {
      // "@clickjs <expression>": the page works out where to click ({x, y} in screen pixels), then a left click
      const r = await call("Runtime.evaluate", { expression: part.slice("@clickjs".length).trim(), returnByValue: true });
      const at = r.result?.result?.value;
      if (at) {
        await call("Input.dispatchMouseEvent", { type: "mouseMoved", x: at.x, y: at.y });
        await call("Input.dispatchMouseEvent", { type: "mousePressed", x: at.x, y: at.y, button: "left", buttons: 1, clickCount: 1 });
        await sleep(60);
        await call("Input.dispatchMouseEvent", { type: "mouseReleased", x: at.x, y: at.y, button: "left", clickCount: 1 });
      }
    } else if (op === "@mouse" || op === "@click" || op === "@rclick") {
      // "@mouse x y" moves the mouse; "@click x y" / "@rclick x y" press the left / right button there
      const x = Number(a), y = Number(b);
      await call("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
      if (op !== "@mouse") {
        const button = op === "@click" ? "left" : "right";
        await call("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button, buttons: button === "left" ? 1 : 2, clickCount: 1 });
        await sleep(60);
        await call("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button, clickCount: 1 });
      }
    } else if (op === "@hold") {
      const ks = a.split(",");
      for (const k of ks) await call("Input.dispatchKeyEvent", { type: "keyDown", ...KEY(k) });
      await sleep(Number(b));
      for (const k of ks) await call("Input.dispatchKeyEvent", { type: "keyUp", ...KEY(k) });
    }
  }
  return "keys";
}
for (const js of steps) {
  const r = js.startsWith("@") ? { result: { result: { value: await keys(js) } } } : await call("Runtime.evaluate", { expression: js, returnByValue: true, awaitPromise: true });
  console.log(n, JSON.stringify(r.result?.result?.value ?? r.result?.exceptionDetails?.text));
  await sleep(Number(process.env.STEP ?? 800));
  const shot = await call("Page.captureScreenshot", { format: "png" });
  writeFileSync(`${prefix}_${n++}.png`, Buffer.from(shot.result.data, "base64"));
}
ws.close(); chrome.kill();
