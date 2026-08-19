import { parseArgs } from "../args.js";
import { extractGuide } from "../extract/index.js";
import {
  DOCS_ROOT,
  listDocGuides,
  REPO_ROOT,
  repoRelative,
  resolveGuidePath
} from "../paths.js";
import type { ImageRef } from "../types.js";

/**
 * Deterministic, offline, sub-second check that every local image reference in docs/
 * resolves. The measured baseline on a clean tree is 2,764 references and zero breakage,
 * so this is a regression guard rather than a bug-finder.
 *
 * It runs on the extracted AST rather than a grep, which is what makes it correct: a
 * regex-based checker reports `{/* ![alt](path) *\/}` comments and fenced-code examples
 * as breakage, and both exist in docs/ today.
 */
export const runLintImages = async (argv: string[]): Promise<number> => {
  const args = parseArgs(argv, { booleanFlags: ["--json"] });
  const asJson = args.has("--json");

  if (args.unknown.length > 0) {
    process.stderr.write(`unknown flag(s): ${args.unknown.join(", ")}\n`);
    return 2;
  }

  // Named pages only, for checking the one you are editing. No names means the whole corpus,
  // which is what CI runs and still takes about a second.
  const guides =
    args.positionals.length > 0
      ? args.positionals.map((name) => resolveGuidePath(name))
      : listDocGuides();

  const broken: ImageRef[] = [];
  let referenceCount = 0;
  let externalCount = 0;
  let fileCount = 0;

  for (const absolute of guides) {
    let doc;
    try {
      doc = extractGuide(absolute, { repoRoot: REPO_ROOT, docsRoot: DOCS_ROOT });
    } catch (error) {
      process.stderr.write(
        `parse failure: ${repoRelative(absolute)}: ${
          error instanceof Error ? error.message : String(error)
        }\n`
      );
      return 1;
    }

    fileCount += 1;
    for (const image of doc.allImages) {
      if (image.resolved === null) {
        externalCount += 1;
        continue;
      }
      referenceCount += 1;
      if (!image.exists) broken.push(image);
    }
  }

  if (asJson) {
    process.stdout.write(
      `${JSON.stringify(
        {
          files: fileCount,
          localReferences: referenceCount,
          externalReferences: externalCount,
          broken: broken.map((image) => ({
            file: repoRelative(image.file),
            line: image.line,
            ref: image.raw,
            alt: image.alt
          }))
        },
        null,
        2
      )}\n`
    );
    return broken.length === 0 ? 0 : 1;
  }

  process.stdout.write(
    `scanned ${fileCount} guides, ${referenceCount} local image references ` +
      `(${externalCount} external, not checked)\n`
  );

  if (broken.length === 0) {
    process.stdout.write("all local image references resolve\n");
    return 0;
  }

  process.stdout.write(`\n${broken.length} broken image reference(s):\n`);
  for (const image of broken) {
    process.stdout.write(`  ${repoRelative(image.file)}:${image.line}\n`);
    process.stdout.write(`    ref:   ${image.raw}\n`);
    process.stdout.write(`    tried: ${image.resolved ? repoRelative(image.resolved) : "-"}\n`);
  }
  return 1;
};
