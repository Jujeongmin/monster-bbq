// Who made what the game uses (shown on the credits page; docs/CREDITS.md keeps the same list with its
// licence files). Music is CC BY 4.0 and must be credited inside the game: each track its title, its
// author and the licence. A track joins MUSIC when it is approved and goes in.
export interface MusicCredit {
  title: string;
  by: string;
  site: string;
}

export const MUSIC: MusicCredit[] = [
  // the day shop and the prologue (approved 2026-10-21): https://maou.audio/category/game/game-town/
  { title: "村07", by: "魔王魂 (MaouDamashii)", site: "maou.audio" },
  // the night shop (approved 2026-10-21): https://soundimage.org/funnyquirky/
  { title: "Monkey Island Band", by: "Music by Eric Matyas", site: "www.soundimage.org" },
];

export const CREDITS = {
  musicLicence: "CC BY 4.0 · creativecommons.org/licenses/by/4.0",
  sounds: { by: "Mixkit", site: "mixkit.co" },
  font: { name: "Galmuri", by: "© 2019–2025 Lee Minseo", licence: "SIL Open Font License 1.1" },
};
