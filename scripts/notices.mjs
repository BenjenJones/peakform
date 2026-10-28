// Writes dist/web/THIRD_PARTY_NOTICES.txt: license and NOTICE texts of every package shipped
// in the image (server runtime dependencies plus what Vite bundles into the web app).
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Entry points of the web bundle. Keep in sync with the packages imported in web/src.
const WEB = ["react", "react-dom", "echarts", "leaflet"];

const root = JSON.parse(readFileSync("package.json", "utf8"));
const seen = new Map();

function walk(name) {
  if (seen.has(name)) return;
  const dir = join("node_modules", name);
  const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  const files = readdirSync(dir, { withFileTypes: true }).filter((f) => f.isFile()).map((f) => f.name);
  const read = (re) => files.filter((f) => re.test(f)).map((f) => readFileSync(join(dir, f), "utf8").trim());
  seen.set(name, { version: pkg.version, license: pkg.license, texts: [...read(/^(licen[cs]e|copying)/i), ...read(/^notice/i)] });
  for (const dep of Object.keys(pkg.dependencies ?? {})) walk(dep);
}

for (const name of [...Object.keys(root.dependencies ?? {}), ...WEB]) walk(name);

const out = ["PeakForm includes the following third-party software.", ""];
for (const [name, { version, license, texts }] of [...seen].sort(([a], [b]) => a.localeCompare(b))) {
  if (!texts.length) throw new Error(`No license file found for ${name}`);
  out.push("=".repeat(78), `${name} ${version} (${license})`, "=".repeat(78), "", ...texts.flatMap((t) => [t, ""]));
}
out.push("=".repeat(78), "Map data (c) OpenStreetMap contributors, https://www.openstreetmap.org/copyright", "");

const target = join("dist", "web", "THIRD_PARTY_NOTICES.txt");
if (!existsSync(join("dist", "web"))) throw new Error("Run vite build first");
writeFileSync(target, out.join("\n"));
console.log(`Wrote ${target} (${seen.size} packages)`);
