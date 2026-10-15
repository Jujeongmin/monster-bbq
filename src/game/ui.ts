import Phaser from "phaser";
import { artUrl } from "./art";

// UI kit A inside Phaser scenes (walnut, hanji, brass; chosen 2026-10-14), with the Galmuri pixel fonts
// loaded by src/main.tsx. Text sizes stay at the fonts' design sizes (12 / 10 px) so the canvas scales
// them with clean pixels.
export const FONT = "Galmuri11";
export const FONT_SMALL = "Galmuri9";
export const TEXT = { fontFamily: FONT, fontSize: "12px", color: "#fff3d8", stroke: "#2b1408", strokeThickness: 3 } as const;
export const TEXT_SMALL = { fontFamily: FONT_SMALL, fontSize: "10px", color: "#fff3d8", stroke: "#2b1408", strokeThickness: 3 } as const;
export const TEXT_INK = { fontFamily: FONT, fontSize: "12px", color: "#3a2414" } as const;

const PIECES = ["panel", "btn_normal", "btn_pressed", "btn_disabled", "tab_on", "tab_off", "gauge_empty", "gauge_full", "bubble", "topbar", "icon_gold", "icon_day", "icon_charcoal"];

export function loadUiArt(scene: Phaser.Scene) {
  for (const p of PIECES) if (!scene.textures.exists(`ui_${p}`)) scene.load.image(`ui_${p}`, artUrl(`test/ui/${p}.png`));
}

export interface UiButton {
  box: Phaser.GameObjects.Container;
  label: Phaser.GameObjects.Text;
  setEnabled(on: boolean): void;
  setText(text: string): void;
}

// A lacquered wooden button with brass corners; presses in while held, greyed when disabled.
export function addButton(scene: Phaser.Scene, x: number, y: number, text: string, onClick: () => void, minWidth = 56): UiButton {
  const label = scene.add.text(0, -1, text, { ...TEXT, fontStyle: "bold" }).setOrigin(0.5);
  const w = Math.max(minWidth, Math.ceil(label.width) + 22);
  const bg = scene.add.nineslice(0, 0, "ui_btn_normal", undefined, w, 26, 13, 13, 13, 13);
  const box = scene.add.container(x, y, [bg, label]).setSize(w, 26);
  let enabled = true;
  box.setInteractive({ useHandCursor: true });
  box.on("pointerdown", () => {
    if (!enabled) return;
    bg.setTexture("ui_btn_pressed");
    box.y = y + 1;
  });
  const release = () => {
    bg.setTexture(enabled ? "ui_btn_normal" : "ui_btn_disabled");
    box.y = y;
  };
  box.on("pointerup", () => {
    const was = enabled && bg.texture.key === "ui_btn_pressed";
    release();
    if (was) onClick();
  });
  box.on("pointerout", release);
  return {
    box,
    label,
    setEnabled(on: boolean) {
      if (on === enabled) return;
      enabled = on;
      bg.setTexture(on ? "ui_btn_normal" : "ui_btn_disabled");
      label.setColor(on ? "#fff3d8" : "#d8d0c4");
    },
    setText(t: string) {
      label.setText(t);
    },
  };
}

export interface UiTab {
  box: Phaser.GameObjects.Container;
  setOn(on: boolean): void;
}

// A wooden tab with a brass knob, at its own size (the knob must not stretch).
export function addTab(scene: Phaser.Scene, x: number, y: number, text: string, onClick: () => void): UiTab {
  const bg = scene.add.image(0, 0, "ui_tab_off");
  const label = scene.add.text(0, 3, text, { ...TEXT, fontStyle: "bold" }).setOrigin(0.5);
  const box = scene.add.container(x, y, [bg, label]).setSize(bg.width, bg.height);
  box.setInteractive({ useHandCursor: true }).on("pointerdown", onClick);
  return {
    box,
    setOn(on: boolean) {
      bg.setTexture(on ? "ui_tab_on" : "ui_tab_off");
      label.setColor(on ? "#3a2414" : "#fff3d8").setStroke(on ? "#00000000" : "#2b1408", on ? 0 : 3);
    },
  };
}

export interface UiGauge {
  box: Phaser.GameObjects.Container;
  set(fraction: number): void;
}

// A brass-capped bar; the warm fill is the full picture cropped to the fraction.
export function addGauge(scene: Phaser.Scene, x: number, y: number): UiGauge {
  const empty = scene.add.image(0, 0, "ui_gauge_empty").setOrigin(0, 0.5);
  const full = scene.add.image(0, 0, "ui_gauge_full").setOrigin(0, 0.5);
  const box = scene.add.container(x - empty.width / 2, y, [empty, full]);
  const w = full.width;
  const h = full.height;
  return {
    box,
    set(f: number) {
      // the brass caps (10 px each side) stay; only the inside fills
      const inner = Math.round(10 + (w - 20) * Math.max(0, Math.min(1, f)));
      full.setCrop(0, 0, f <= 0 ? 0 : inner, h);
    },
  };
}
