import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const out = path.resolve(root, "../cipher/r");
const built = path.join(root, "public/r");

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const items = readdirSync(built).filter((file) => file.endsWith(".json"));
items.forEach((file) => cpSync(path.join(built, file), path.join(out, file)));
writeFileSync(path.join(out, "registry.json"), readFileSync(path.join(root, "registry.json")));
process.stdout.write(
  `Released ${items.length} Cipher registry items to ${path.relative(process.cwd(), out)}.\n`
);
