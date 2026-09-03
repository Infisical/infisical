import { parseArgs } from "../args.js";
import {
  checkPlanDrift,
  compileGuide,
  relativePlanPath,
  writePlan
} from "../compile/index.js";
import { extractGuide } from "../extract/index.js";
import { CREDENTIALS_HINT, emptyUsage, formatUsage, hasLikelyCredentials } from "../llm.js";
import { DOCS_ROOT, REPO_ROOT, resolveGuidePath } from "../paths.js";
import { resolveRegistryTargets } from "../registry.js";
import type { GuideRegistryEntry } from "../types.js";

const docFor = (entry: GuideRegistryEntry) =>
  extractGuide(resolveGuidePath(entry.guide), {
    repoRoot: REPO_ROOT,
    docsRoot: DOCS_ROOT,
    tab: entry.tab
  });

export const runCompile = async (argv: string[]): Promise<number> => {
  const args = parseArgs(argv, { booleanFlags: ["--force"] });
  const force = args.has("--force");

  if (!hasLikelyCredentials()) {
    process.stderr.write(`${CREDENTIALS_HINT}\n`);
    return 2;
  }

  const usage = emptyUsage();
  let compiled = 0;
  let skipped = 0;
  let warned = 0;

  for (const entry of resolveRegistryTargets(args.positionals)) {
    const doc = docFor(entry);
    const drift = checkPlanDrift(doc);

    if (drift.state === "ok" && !force) {
      process.stdout.write(`up to date  ${entry.guide}\n`);
      skipped += 1;
      continue;
    }

    const reason =
      drift.state === "missing"
        ? "no plan yet"
        : drift.state === "stale"
          ? "guide changed since the plan was compiled"
          : "--force";
    process.stdout.write(`compiling   ${entry.guide}  (${reason})\n`);

    const result = await compileGuide(doc, usage);
    writePlan(result.plan);
    compiled += 1;

    const actionCount = result.plan.steps.reduce(
      (sum, step) => sum + step.actions.length,
      0
    );
    process.stdout.write(
      `            ${result.plan.steps.length} steps, ${actionCount} actions -> ${relativePlanPath(
        entry.guide
      )}\n`
    );

    for (const warning of result.warnings) {
      warned += 1;
      process.stdout.write(
        `            warning [proc ${warning.procedureIndex} step ${warning.docStepIndex}] ${warning.kind}: ${warning.detail}\n`
      );
    }
  }

  process.stdout.write(
    `\n${compiled} compiled, ${skipped} up to date, ${warned} warning(s)\n`
  );
  if (usage.calls > 0) process.stdout.write(`${formatUsage(usage)}\n`);
  return 0;
};

/**
 * The CI gate. Fails when a guide's MDX has changed without its plan being recompiled, so a run
 * can never verify a plan that describes an older version of the guide.
 *
 * Accepts guide names for the same reason `compile` does: while iterating on one page you want to
 * check that page. With no names it checks the whole registry, which is what CI runs.
 */
export const runCheckDrift = async (argv: string[]): Promise<number> => {
  const args = parseArgs(argv, { booleanFlags: ["--json"] });
  const asJson = args.has("--json");

  const targets = resolveRegistryTargets(args.positionals);
  const problems: { guide: string; state: string; detail: string }[] = [];

  for (const entry of targets) {
    const doc = docFor(entry);
    const drift = checkPlanDrift(doc);

    if (drift.state === "missing") {
      problems.push({
        guide: entry.guide,
        state: "missing",
        detail: `no committed plan at ${relativePlanPath(entry.guide)}`
      });
    } else if (drift.state === "stale") {
      problems.push({
        guide: entry.guide,
        state: "stale",
        detail: `plan was compiled against ${drift.actual.slice(0, 12)}, guide is now ${drift.expected.slice(0, 12)}`
      });
    }
  }

  if (asJson) {
    process.stdout.write(
      `${JSON.stringify({ checked: targets.map((t) => t.guide), problems }, null, 2)}\n`
    );
    return problems.length === 0 ? 0 : 1;
  }

  if (problems.length === 0) {
    process.stdout.write(
      args.positionals.length === 0
        ? "every registered guide has an up-to-date compiled plan\n"
        : `${targets.length === 1 ? "that guide has" : `all ${targets.length} guides have`} ` +
          `an up-to-date compiled plan\n`
    );
    return 0;
  }

  process.stdout.write(`${problems.length} of ${targets.length} guide(s) need recompiling:\n`);
  for (const problem of problems) {
    process.stdout.write(`  ${problem.guide}\n    ${problem.state}: ${problem.detail}\n`);
  }
  process.stdout.write(
    `\nrun \`npx tsx src/cli.ts compile${
      args.positionals.length > 0 ? ` ${args.positionals.join(" ")}` : ""
    }\` and commit the result\n`
  );
  return 1;
};
