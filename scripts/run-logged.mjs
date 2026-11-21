// Runs a command, tees output to a UTF-8 log, and appends a reliable "EXIT=<code>" marker.
// Usage: node scripts/run-logged.mjs <logfile> <command...>
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";

const [log, ...cmd] = process.argv.slice(2);
const out = createWriteStream(log, { encoding: "utf8" });
const p = spawn(cmd.join(" "), { shell: true, env: process.env });
p.stdout.pipe(out, { end: false });
p.stderr.pipe(out, { end: false });
p.on("close", (code) => {
  out.end(`\nEXIT=${code}\n`);
  process.exit(code ?? 1);
});
