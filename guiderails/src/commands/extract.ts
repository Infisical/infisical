import { parseArgs } from "../args.js";
import { extractGuide } from "../extract/index.js";
import { DOCS_ROOT, REPO_ROOT, repoRelative, resolveGuidePath } from "../paths.js";
import { formatNavPath } from "../extract/nav.js";
import type { GuideDoc } from "../types.js";

const summarize = (doc: GuideDoc): string => {
  const lines: string[] = [];

  lines.push(`${doc.guide}`);
  lines.push(`  title:  ${doc.title}`);
  lines.push(`  hash:   ${doc.contentHash.slice(0, 12)}`);
  if (doc.availableTabs.length > 0) {
    lines.push(`  tabs:   ${doc.availableTabs.join(", ")}  (walking: ${doc.tab ?? "-"})`);
  }
  lines.push(`  images: ${doc.allImages.length} (${doc.allImages.filter((i) => i.resolved && !i.exists).length} broken)`);

  for (const procedure of doc.procedures) {
    lines.push("");
    lines.push(
      `  procedure ${procedure.index} [${procedure.kind}] ${
        procedure.heading ? `under "${procedure.heading}"` : ""
      } (${procedure.steps.length} steps, line ${procedure.line})`
    );

    for (const step of procedure.steps) {
      lines.push(`    ${step.index}. ${step.title ?? step.prose.slice(0, 78)}`);
      if (step.navPaths.length > 0) {
        lines.push(`       nav:     ${step.navPaths.map(formatNavPath).join(" | ")}`);
      }
      if (step.boldTargets.length > 0) {
        lines.push(`       targets: ${step.boldTargets.join(" | ")}`);
      }
      if (step.fields.length > 0) {
        lines.push(`       fields:  ${step.fields.map((f) => f.label).join(", ")}`);
      }
      if (step.images.length > 0) {
        lines.push(
          `       shots:   ${step.images
            .map((i) => `${i.raw.split("/").pop()}${i.exists ? "" : " (MISSING)"}`)
            .join(", ")}`
        );
      }
      if (step.codeBlocks.length > 0) {
        lines.push(`       code:    ${step.codeBlocks.map((c) => c.lang ?? "text").join(", ")}`);
      }
      if (step.callouts.length > 0) {
        lines.push(`       notes:   ${step.callouts.map((c) => c.kind).join(", ")}`);
      }
      if (step.file !== undefined && repoRelative(step.file) !== doc.guide) {
        lines.push(`       from:    ${repoRelative(step.file)}:${step.line}`);
      }
    }
  }

  if (doc.unverified.length > 0) {
    lines.push("");
    lines.push("  unverified:");
    for (const region of doc.unverified) {
      lines.push(`    line ${region.line}: ${region.reason}`);
    }
  }

  return lines.join("\n");
};

export const runExtract = async (argv: string[]): Promise<number> => {
  const args = parseArgs(argv, { valueFlags: ["--tab"], booleanFlags: ["--json"] });

  if (args.unknown.length > 0) {
    process.stderr.write(`unknown flag(s): ${args.unknown.join(", ")}\n`);
    return 2;
  }

  if (args.positionals.length === 0) {
    process.stderr.write("usage: guiderails extract <guide>... [--tab <title>] [--json]\n");
    return 2;
  }

  for (const target of args.positionals) {
    const doc = extractGuide(resolveGuidePath(target), {
      repoRoot: REPO_ROOT,
      docsRoot: DOCS_ROOT,
      tab: args.value("--tab")
    });

    if (args.has("--json")) process.stdout.write(`${JSON.stringify(doc, null, 2)}\n`);
    else process.stdout.write(`${summarize(doc)}\n`);
  }

  return 0;
};
