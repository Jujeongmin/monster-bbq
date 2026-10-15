// Online when the build has a Verse8 project id (.env's VITE_AGENT8_VERSE), unless a development
// build was opened with ?local to play against the in-page server instead.
export function wantsOnline(verse: string | undefined, search: string, dev: boolean): boolean {
  if (!verse) return false;
  if (dev && new URLSearchParams(search).has("local")) return false;
  return true;
}
