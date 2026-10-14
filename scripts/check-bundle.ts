// Gate for plan 04: the research kitchen's answers must not ship to players (spec 7). Run after a
// production build (npm run check:bundle): no recipe's item list may appear as an array literal in any
// built script, whatever quotes and spacing the minifier picks (it writes `a` style strings).
// Node 24 runs this file as is (type stripping).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { RECIPES } from "../server/src/recipes.ts";

function scripts(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? scripts(p) : p.endsWith(".js") ? [p] : [];
  });
}

const files = scripts("dist").map((path) => ({ path, text: readFileSync(path, "utf8") }));
const leaks: string[] = [];
const quoted = (id: string) => String.raw`\s*["'` + "`" + String.raw`]${id}["'` + "`" + String.raw`]\s*`;
for (const [dish, recipe] of Object.entries(RECIPES)) {
  const literal = new RegExp(String.raw`\[` + recipe.items.map(quoted).join(",") + String.raw`\]`);
  for (const f of files) if (literal.test(f.text)) leaks.push(`${dish} [${recipe.items.join(", ")}] in ${f.path}`);
}
if (files.length === 0) {
  console.error("check-bundle: no built scripts in dist/ (run vite build first)");
  process.exit(1);
}
if (leaks.length > 0) {
  console.error(`check-bundle: recipe answers found in the client bundle:\n  ${leaks.join("\n  ")}`);
  process.exit(1);
}
console.log(`check-bundle: ${Object.keys(RECIPES).length} recipes, ${files.length} scripts, no answers shipped`);
