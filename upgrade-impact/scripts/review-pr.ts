import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { loadPackageEnv } from "../src/env.js";
import { renderComment, reviewPullRequest } from "../src/review-pr.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const getValue = (name: string) => {
  const args = process.argv.slice(2);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

const main = async () => {
  loadPackageEnv(packageRoot);

  const base = getValue("--base");
  const head = getValue("--head") ?? "HEAD";
  const output = getValue("--output");

  if (!base) {
    throw new Error("Usage: npm run review:pr -- --base <ref> [--head <ref>] [--output <file>]");
  }

  const findings = await reviewPullRequest({
    base,
    head,
    title: process.env.PR_TITLE ?? "",
    body: process.env.PR_BODY ?? ""
  });
  const comment = renderComment(findings);

  // Empty file means the fragments match, and the workflow then removes any earlier comment.
  if (output) {
    await fs.writeFile(output, comment);
  }

  process.stdout.write(comment || "The declared upgrade impact matches the changes.\n");
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
