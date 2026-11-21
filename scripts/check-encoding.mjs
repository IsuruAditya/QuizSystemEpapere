// Fails if any source file is not valid UTF-8 or contains typical mojibake (UTF-8 read as cp1252).
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const roots = ["src", "tests", "scripts", "prisma", ".kiro", "docs"];
const skip = /node_modules|generated|\.next/;
const exts = /\.(ts|tsx|mjs|js|json|md|sql|prisma|csv|css|yaml|yml)$/;
// Built from code points so this file does not match itself.
const mojibake = new RegExp(["\u00c3.", "\u00e2\u20ac", "\u00e0\u00b7", "\u00c2[\u00a0-\u00bf]"].join("|"));
let bad = 0;
function walk(d) {
  for (const n of readdirSync(d)) {
    const p = path.join(d, n);
    if (skip.test(p)) continue;
    if (statSync(p).isDirectory()) walk(p);
    else if (exts.test(n)) {
      const buf = readFileSync(p);
      let text;
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(buf);
      } catch {
        console.log(`INVALID UTF-8: ${p}`);
        bad++;
        continue;
      }
      if (mojibake.test(text)) {
        console.log(`MOJIBAKE: ${p}: ${text.match(mojibake)[0]}`);
        bad++;
      }
    }
  }
}
for (const r of roots) {
  try {
    walk(r);
  } catch {
    /* root missing */
  }
}
console.log(bad ? `${bad} file(s) with encoding problems` : "All files valid UTF-8, no mojibake.");
process.exit(bad ? 1 : 0);
