import fs from "node:fs";
import path from "node:path";

import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

import { addUsage, cachedSystem, getClient, modelFor, type UsageTotals } from "../llm.js";
import { COMPILED_DIR, REPO_ROOT, repoRelative } from "../paths.js";
import type { Action, GuideDoc, GuidePlan, GuideStep, PlanStep, Procedure } from "../types.js";
import { COMPILER_SYSTEM_PROMPT } from "./prompt.js";
import { buildSourceQuote, quoteAppearsIn } from "./quote.js";
import { compiledProcedureSchema, type CompiledAction } from "./schema.js";

/**
 * L2: GuideDoc to GuidePlan.
 *
 * The LLM runs here and only here during a normal run, once per procedure, and its output is
 * committed. That is the whole point of this layer: the model's reading of the prose becomes a
 * reviewed artifact in git rather than something re-rolled on every CI run. A run against an
 * unchanged guide is fully deterministic because it replays this file.
 */

/** What the model is shown for one step. Structured, because it was already parsed. */
const renderStep = (step: GuideStep): string => {
  const parts: string[] = [`### Step ${step.index}`];

  if (step.title) parts.push(`Title: ${step.title}`);
  if (step.prose) parts.push(`Text: ${step.prose}`);
  if (step.boldTargets.length > 0) {
    parts.push(`Delimited UI targets: ${step.boldTargets.map((t) => `"${t}"`).join(", ")}`);
  }
  if (step.navPaths.length > 0) {
    parts.push(
      `Navigation breadcrumbs: ${step.navPaths.map((p) => p.join(" > ")).join(" | ")}`
    );
  }
  if (step.fields.length > 0) {
    parts.push(
      `Documented form fields:\n${step.fields
        .map((field) => `  - ${field.label}: ${field.description}`)
        .join("\n")}`
    );
  }
  if (step.images.length > 0) {
    parts.push(`Screenshots: ${step.images.map((image) => image.raw).join(", ")}`);
  }
  if (step.codeBlocks.length > 0) {
    parts.push(
      `Code blocks:\n${step.codeBlocks
        .map((block) => `  [${block.lang ?? "text"}] ${block.value.slice(0, 300)}`)
        .join("\n")}`
    );
  }
  if (step.callouts.length > 0) {
    parts.push(
      `Callouts:\n${step.callouts.map((c) => `  - ${c.kind}: ${c.text}`).join("\n")}`
    );
  }

  return parts.join("\n");
};

const renderProcedure = (doc: GuideDoc, procedure: Procedure): string =>
  [
    `Guide: ${doc.guide}`,
    `Title: ${doc.title}`,
    procedure.heading ? `Section: ${procedure.heading}` : null,
    `Written as: ${procedure.kind}`,
    "",
    `Compile all ${procedure.steps.length} steps below.`,
    "",
    procedure.steps.map(renderStep).join("\n\n")
  ]
    .filter((part): part is string => part !== null)
    .join("\n");

/** Everything the model was shown for a step, for verbatim-quote checking. */
const haystackFor = (step: GuideStep): string =>
  [
    step.title ?? "",
    step.prose,
    ...step.boldTargets,
    ...step.navPaths.map((p) => p.join(" > ")),
    ...step.fields.flatMap((field) => [field.label, field.description]),
    ...step.images.map((image) => image.raw),
    ...step.codeBlocks.map((block) => block.value),
    ...step.callouts.map((callout) => callout.text)
  ].join("\n");

export type CompileWarning = {
  procedureIndex: number;
  docStepIndex: number;
  kind: "unquoted-action" | "unknown-step" | "empty-procedure";
  detail: string;
};

/**
 * Rejects any action whose quote is not actually in the step.
 *
 * This is the guard that keeps a finding citable. An action with an unverifiable quote is one
 * the model invented, and letting it through would put an assertion in the plan that the guide
 * never made, which is the single worst failure mode available to this design: a confident
 * false positive posted onto somebody's PR.
 */
const validateActions = (
  step: GuideStep,
  actions: CompiledAction[],
  procedureIndex: number,
  warnings: CompileWarning[]
): Action[] => {
  const haystack = haystackFor(step);
  const kept: Action[] = [];

  for (const action of actions) {
    if (!quoteAppearsIn(action.sourceQuote.text, haystack)) {
      warnings.push({
        procedureIndex,
        docStepIndex: step.index,
        kind: "unquoted-action",
        detail:
          `dropped ${action.kind}: quote is not present verbatim in the step ` +
          `("${action.sourceQuote.text.slice(0, 80)}")`
      });
      continue;
    }

    // The line is recomputed from the raw file rather than trusted from the model.
    const sourceQuote = buildSourceQuote(
      action.sourceQuote.text,
      step.file,
      step.line
    );

    switch (action.kind) {
      case "navigate":
        kept.push({ kind: "navigate", path: action.path, sourceQuote });
        break;
      case "click":
        kept.push({ kind: "click", target: action.target, role: action.role, sourceQuote });
        break;
      case "fill":
        kept.push({ kind: "fill", field: action.field, value: action.value, sourceQuote });
        break;
      case "select":
        kept.push({
          kind: "select",
          field: action.field,
          option: action.option,
          sourceQuote
        });
        break;
      case "expect_visible":
        kept.push({ kind: "expect_visible", text: action.text, sourceQuote });
        break;
      case "expect_screenshot":
        kept.push({ kind: "expect_screenshot", docImage: action.docImage, sourceQuote });
        break;
      case "external":
        kept.push({ kind: "external", reason: action.reason, sourceQuote });
        break;
      default:
        break;
    }
  }

  return kept;
};

/**
 * Screenshot assertions are derived in code, not asked of the model.
 *
 * Which images a step carries is already known exactly from L1, so this is a mechanical
 * one-per-image mapping with nothing to interpret. Leaving it to the model was a real bug: it
 * simply omitted all seven screenshots of the first guide compiled, which silently turned
 * `--screenshots` into a no-op. Deriving it here also guarantees a screenshot can never be
 * dropped by a differently-worded prompt.
 *
 * Any the model did emit are honoured rather than duplicated, since its quote may be better
 * anchored than the step's own line.
 */
const screenshotActions = (step: GuideStep, existing: Action[]): Action[] => {
  const already = new Set(
    existing
      .filter((action): action is Extract<Action, { kind: "expect_screenshot" }> =>
        action.kind === "expect_screenshot"
      )
      .map((action) => action.docImage)
  );

  return step.images
    .filter((image) => !already.has(image.raw))
    .map((image) => ({
      kind: "expect_screenshot" as const,
      docImage: image.raw,
      sourceQuote: {
        // The image's own line is exact, so there is nothing to recover by search here.
        text: image.raw,
        file: repoRelative(image.file),
        line: image.line
      }
    }));
};

export type CompileResult = {
  plan: GuidePlan;
  warnings: CompileWarning[];
  usage: UsageTotals;
};

export const compileGuide = async (
  doc: GuideDoc,
  usage: UsageTotals
): Promise<CompileResult> => {
  const client = getClient();
  const warnings: CompileWarning[] = [];
  const steps: PlanStep[] = [];

  for (const procedure of doc.procedures) {
    const response = await client.messages.parse({
      model: modelFor("compile"),
      max_tokens: 16000,
      // The rules are identical for every procedure of every guide, so this prefix is a cache
      // read on all but the first call of a run.
      system: cachedSystem(COMPILER_SYSTEM_PROMPT),
      thinking: { type: "adaptive" },
      output_config: {
        effort: "medium",
        format: zodOutputFormat(compiledProcedureSchema)
      },
      messages: [{ role: "user", content: renderProcedure(doc, procedure) }]
    });

    addUsage(usage, response.usage);

    const parsed = response.parsed_output;
    if (!parsed) {
      warnings.push({
        procedureIndex: procedure.index,
        docStepIndex: 0,
        kind: "empty-procedure",
        detail: "the model returned no parseable output for this procedure"
      });
      continue;
    }

    const byIndex = new Map(procedure.steps.map((step) => [step.index, step]));

    for (const compiled of parsed.steps) {
      const step = byIndex.get(compiled.docStepIndex);
      if (!step) {
        warnings.push({
          procedureIndex: procedure.index,
          docStepIndex: compiled.docStepIndex,
          kind: "unknown-step",
          detail: `plan referenced step ${compiled.docStepIndex}, which the guide does not have`
        });
        continue;
      }

      const actions = validateActions(step, compiled.actions, procedure.index, warnings);

      steps.push({
        procedureIndex: procedure.index,
        docStepIndex: compiled.docStepIndex,
        instruction: compiled.instruction,
        actions: [...actions, ...screenshotActions(step, actions)]
      });
    }
  }

  return {
    plan: {
      guide: doc.guide,
      guideDocHash: doc.contentHash,
      compiledAt: new Date().toISOString(),
      model: modelFor("compile"),
      steps
    },
    warnings,
    usage
  };
};

// ---------------------------------------------------------------------------
// Plan artifacts on disk
// ---------------------------------------------------------------------------

/** `docs/documentation/platform/folder.mdx` becomes `documentation-platform-folder.json`. */
export const planSlug = (guide: string): string =>
  guide
    .replace(/^docs\//, "")
    .replace(/\.mdx$/, "")
    .replace(/[/\\]/g, "-");

export const planPath = (guide: string): string =>
  path.join(COMPILED_DIR, `${planSlug(guide)}.json`);

export const writePlan = (plan: GuidePlan): string => {
  fs.mkdirSync(COMPILED_DIR, { recursive: true });
  const target = planPath(plan.guide);
  fs.writeFileSync(target, `${JSON.stringify(plan, null, 2)}\n`);
  return target;
};

export const readPlan = (guide: string): GuidePlan | null => {
  const target = planPath(guide);
  if (!fs.existsSync(target)) return null;
  try {
    return JSON.parse(fs.readFileSync(target, "utf8")) as GuidePlan;
  } catch {
    return null;
  }
};

export type DriftStatus =
  | { state: "ok"; plan: GuidePlan }
  | { state: "missing" }
  | { state: "stale"; plan: GuidePlan; expected: string; actual: string };

/**
 * The staleness gate. A guide whose MDX changed without its plan being recompiled must fail
 * CI, exactly as validate-db-schemas.yml fails on an un-regenerated schema. Without it a plan
 * silently describes a guide that no longer exists and the run verifies the wrong thing.
 */
export const checkPlanDrift = (doc: GuideDoc): DriftStatus => {
  const plan = readPlan(doc.guide);
  if (!plan) return { state: "missing" };
  if (plan.guideDocHash !== doc.contentHash) {
    return {
      state: "stale",
      plan,
      expected: doc.contentHash,
      actual: plan.guideDocHash
    };
  }
  return { state: "ok", plan };
};

export const relativePlanPath = (guide: string): string =>
  path.relative(REPO_ROOT, planPath(guide));
