import Phaser from "phaser";
import { artUrl } from "./art";

// The pixel UI kit inside Phaser scenes (approved 2026-10-15), with the Galmuri pixel fonts
// loaded by src/main.tsx. Text sizes stay at the fonts' design sizes (12 / 10 px) so the canvas scales
// them with clean pixels.
const FONT = "Galmuri11";
const FONT_SMALL = "Galmuri9";
export const TEXT = { fontFamily: FONT, fontSize: "12px", color: "#fff3d8", stroke: "#2b1408", strokeThickness: 3 } as const;
export const TEXT_SMALL = { fontFamily: FONT_SMALL, fontSize: "10px", color: "#fff3d8", stroke: "#2b1408", strokeThickness: 3 } as const;

// the pixel UI kit (art/test/ui2) inside Phaser scenes; each art pixel is KIT game pixels
const PIECES = ["btn_normal", "btn_pressed", "btn_disabled", "gauge_empty", "gauge_full", "bubble_plain", "topbar", "panel", "slot"];
const ICONS = ["icon_gold", "icon_day", "icon_charcoal"];
export const KIT = 2;

export function loadUiArt(scene: Phaser.Scene) {
  for (const p of PIECES) if (!scene.textures.exists(`ui_${p}`)) scene.load.image(`ui_${p}`, artUrl(`test/ui2/${p}.png`));
  for (const p of ICONS) if (!scene.textures.exists(`ui_${p}`)) scene.load.image(`ui_${p}`, artUrl(`test/ui/${p}.png`));
}

// A kit piece as a 9-slice `w` x `h` game pixels big: built at art size, drawn KIT times bigger, so its
// edges stay whole art pixels. l/r/t/b are the piece's edge widths in art pixels.
export function kitSlice(scene: Phaser.Scene, x: number, y: number, piece: string, w: number, h: number, l: number, r: number, t: number, b: number) {
  return scene.add.nineslice(x, y, `ui_${piece}`, undefined, Math.round(w / KIT), Math.round(h / KIT), l, r, t, b).setScale(KIT);
}

export interface UiButton {
  box: Phaser.GameObjects.Container;
  label: Phaser.GameObjects.Text;
  setEnabled(on: boolean): void;
  setText(text: string): void;
}

// A lacquered wooden button with brass corners; presses in while held, greyed when disabled.
export function addButton(scene: Phaser.Scene, x: number, y: number, text: string, onClick: () => void, minWidth = 56): UiButton {
  const label = scene.add.text(0, 0, text, { ...TEXT, fontStyle: "bold" }).setOrigin(0.5);
  // the red face sits 4 art px in from each brass cap; the label keeps 8 game px of face on each side
  const w = Math.max(minWidth, Math.ceil(label.width) + 32);
  const bg = kitSlice(scene, 0, 0, "btn_normal", w, 24, 4, 4, 2, 1);
  const box = scene.add.container(x, y, [bg, label]).setSize(w, 24);
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

export interface MenuItem extends UiButton {
  setLit(on: boolean): void;
  press(): void;
}

// A menu line (the pause menu: user, 2026-10-20, buttons there doubled the panel): plain lettering, a ▶
// beside the one picked, which turns gold. The pointer picks it by passing over (onHover) and presses it;
// the scene moves the pick with the keys and presses it with Space.
export function addMenuItem(scene: Phaser.Scene, x: number, y: number, text: string, onClick: () => void, onHover?: () => void): MenuItem {
  const label = scene.add.text(0, 0, text, { ...TEXT, fontStyle: "bold" }).setOrigin(0.5);
  const mark = scene.add.text(0, 0, "▶", { ...TEXT, color: "#ffd166" }).setOrigin(1, 0.5).setVisible(false);
  const place = () => mark.setX(-label.width / 2 - 6);
  place();
  const box = scene.add.container(x, y, [mark, label]).setSize(Math.max(120, label.width + 40), 22);
  box.setInteractive({ useHandCursor: true });
  const lit = (on: boolean) => (mark.setVisible(on), label.setColor(on ? "#ffd166" : "#fff3d8"));
  box.on("pointerover", () => (onHover ? onHover() : lit(true)));
  if (!onHover) box.on("pointerout", () => lit(false));
  box.on("pointerup", onClick);
  return {
    box,
    label,
    setLit: lit,
    press: onClick,
    setEnabled() {},
    setText(t: string) {
      label.setText(t);
      place();
    },
  };
}

export interface UiGauge {
  box: Phaser.GameObjects.Container;
  set(fraction: number): void;
}

// A brass-capped bar `width` game pixels wide (default 96); both the track and the warm fill are kit
// 9-slices, so the brass caps keep their size at any width and the fill grows from the left.
export function addGauge(scene: Phaser.Scene, x: number, y: number, width = 96): UiGauge {
  const empty = kitSlice(scene, 0, 0, "gauge_empty", width, 14, 3, 3, 2, 2).setOrigin(0, 0.5);
  const full = kitSlice(scene, 0, 0, "gauge_full", width, 14, 3, 3, 2, 2).setOrigin(0, 0.5);
  const box = scene.add.container(x - width / 2, y, [empty, full]);
  const art = Math.round(width / KIT);
  return {
    box,
    set(f: number) {
      const c = Math.max(0, Math.min(1, f));
      // the caps (3 art pixels each side) always show; only the middle grows
      full.setVisible(c > 0);
      if (c > 0) full.setSize(Math.round(6 + (art - 6) * c), 7);
    },
  };
}
