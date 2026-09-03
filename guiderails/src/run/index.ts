import fs from "node:fs";
import path from "node:path";

import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";

import { checkPlanDrift } from "../compile/index.js";
import { normalizeForMatch, quoteAppearsIn } from "../compile/quote.js";
import { loadInstanceState, type InstanceState } from "../env/bootstrap.js";
import { setupFixture, type FixtureResult } from "../env/fixtures.js";
import { createBrowserSession } from "../env/session.js";
import { extractGuide } from "../extract/index.js";
import { emptyUsage, type UsageTotals } from "../llm.js";
import { type PlanOutlineProcedure } from "../live/protocol.js";
import { DOCS_ROOT, REPORTS_DIR, REPO_ROOT, repoRelative, resolveGuidePath } from "../paths.js";
import type {
  Finding,
  GuideDoc,
  GuidePlan,
  GuideStep,
  GuideRegistryEntry,
  PlanStep,
  RunResult,
  StepResult,
  UnverifiedRegion
} from "../types.js";
import { findFrontendAnchor } from "../verify/anchor.js";
import { classifyBlame, compareScreenshots, mediaTypeFor } from "../verify/judge.js";
import { runStepAgent, type StepAgentMode } from "./agent.js";
import { createBrowserTools } from "./browser.js";
import { RunEvents } from "./events.js";
import {
  parameterizeLocators,
  readResolved,
  recordablePrefix,
  replayStep,
  writeResolved
} from "./replay.js";
import { startScreencast } from "./screencast.js";

export type RunOptions = {
  entry: GuideRegistryEntry;
  /** PR changed files, used by the blame classifier. Empty on a nightly sweep. */
  changedFiles: string[];
  /**
   * The pull request's unified diff, when there is one. Used to find which frontend line caused
   * a drift so the warning can be attached to it. Null locally, where there is no diff and the
   * finding simply appears in the report without an anchor.
   */
  diff: string | null;
  /** Compare screenshots. Costly, so gated by the caller rather than always on. */
  compareScreenshots: boolean;
  /** Force the agent even when a valid recording exists, e.g. to refresh the ratchet. */
  forceAgent: boolean;
  headed: boolean;
  events: RunEvents;
};

export type RunOutput = {
  result: RunResult;
  usage: UsageTotals;
  artifactDir: string;
};

/**
 * Groups the plan's steps by procedure so the dashboard can list what is coming and label each
 * group with its heading. Procedures keep first-appearance order, which is document order.
 */
export const planOutline = (plan: GuidePlan, doc: GuideDoc): PlanOutlineProcedure[] => {
  const byIndex = new Map<number, PlanOutlineProcedure>();
  const order: number[] = [];

  for (const step of plan.steps) {
    let procedure = byIndex.get(step.procedureIndex);
    if (!procedure) {
      procedure = {
        index: step.procedureIndex,
        heading:
          doc.procedures.find((candidate) => candidate.index === step.procedureIndex)?.heading ??
          null,
        steps: []
      };
      byIndex.set(step.procedureIndex, procedure);
      order.push(step.procedureIndex);
    }
    procedure.steps.push({
      procedureIndex: step.procedureIndex,
      docStepIndex: step.docStepIndex,
      instruction: step.instruction
    });
  }

  // flatMap rather than a non-null assertion, so noUncheckedIndexedAccess stays honest.
  return order.flatMap((index) => {
    const procedure = byIndex.get(index);
    return procedure ? [procedure] : [];
  });
};

/**
 * What a step actually gives the agent to do.
 *
 * A step with no compiled action is not automatically anything. Of the four in the registry today,
 * one documents an eight-field form, one documents a three-field form, one describes behaviour the
 * app performs by itself, and one says "repeat these steps for each key-value pair". The only
 * property that decides how to treat them is whether the guide **names** any part of the UI, so
 * that is what this splits on rather than guessing at a step's genre.
 *
 * Handing such a step to the agent unchanged is what produced the false positives: with no action
 * to perform it fell back to comparing a `<Step title>` against a dialog heading.
 */
export const stepWork = (
  step: PlanStep,
  docStep: GuideStep | undefined
): StepAgentMode | { kind: "informational" } => {
  const actionable = step.actions.some(
    (action) => action.kind !== "expect_screenshot" && action.kind !== "external"
  );
  if (actionable) return { kind: "perform" };

  const named = [
    ...(docStep?.fields.map((field) => field.label) ?? []),
    ...(docStep?.boldTargets ?? [])
  ]
    .map((label) => label.trim())
    .filter((label) => label.length > 0);

  const unique = [...new Set(named)];
  return unique.length > 0 ? { kind: "gap-check", named: unique } : { kind: "informational" };
};

/**
 * Rejects a finding that compares the step's own heading against the UI.
 *
 * `<Step title="Configure Secret Share">` is a section label. The guide never claimed the dialog is
 * called that, so a MISMATCH citing it is not a documentation defect — and it was the single most
 * common false positive, because 23 of the 101 compiled actions carry a step title as their quote.
 *
 * Attaching quotes to their actions and adding a prompt rule addresses the cause; this is the
 * mechanical backstop, in the same spirit as the compiler dropping any action whose quote is not
 * verbatim in the step. Model output gets verified rather than trusted.
 *
 * A title that the guide *does* ask the reader to act on is left alone: several steps are titled
 * with their own imperative ("Navigate to the Secret Sharing tab"), and that is a real target.
 */
export const isTitleEcho = (
  finding: Pick<Finding, "severity" | "docSays">,
  step: PlanStep,
  docStep: GuideStep | undefined
): boolean => {
  if (finding.severity !== "MISMATCH") return false;
  if (!docStep?.title) return false;
  if (normalizeForMatch(finding.docSays) !== normalizeForMatch(docStep.title)) return false;

  const askedFor = step.actions.some((action) => {
    switch (action.kind) {
      case "click":
        return asksFor(action.target, docStep.title);
      case "fill":
      case "select":
        return asksFor(action.field, docStep.title);
      case "expect_visible":
        return asksFor(action.text, docStep.title);
      case "navigate":
        return action.path.some((segment) => asksFor(segment, docStep.title));
      default:
        return false;
    }
  });

  return !askedFor;
};

/**
 * Containment, not equality.
 *
 * A step titled "Navigate to the Secret Sharing tab" compiles to `navigate ["Secret Sharing"]`, so
 * an equality test says the guide never asked for the title and suppresses the finding. That is how
 * this guard first suppressed a genuine one: the app really had moved Secret Sharing out of the
 * project sidebar, and the report went silent about it. Suppressing real drift is a worse failure
 * than the false positive the guard exists to stop, so it errs toward keeping the finding.
 */
const asksFor = (target: string, title: string | null): boolean =>
  title !== null && (quoteAppearsIn(target, title) || quoteAppearsIn(title, target));

const findDocImage = (docImage: string, guideFile: string): string | null => {
  const candidate = docImage.startsWith("/")
    ? path.join(DOCS_ROOT, docImage.split("#")[0] ?? docImage)
    : path.resolve(path.dirname(guideFile), docImage.split("#")[0] ?? docImage);
  return fs.existsSync(candidate) ? candidate : null;
};

export const runGuide = async (options: RunOptions): Promise<RunOutput> => {
  const { entry, events } = options;
  const usage = emptyUsage();

  const state: InstanceState = loadInstanceState();
  const guideFile = resolveGuidePath(entry.guide);
  const doc = extractGuide(guideFile, {
    repoRoot: REPO_ROOT,
    docsRoot: DOCS_ROOT,
    tab: entry.tab
  });

  const drift = checkPlanDrift(doc);
  if (drift.state !== "ok") {
    throw new Error(
      drift.state === "missing"
        ? `No compiled plan for ${entry.guide}. Run \`guiderails compile\` first.`
        : `The compiled plan for ${entry.guide} is stale (guide has changed since it was ` +
          `compiled). Run \`guiderails compile\` and commit the result.`
    );
  }
  const plan: GuidePlan = drift.plan;

  const artifactDir = path.join(REPORTS_DIR, planSafeName(entry.guide));
  fs.mkdirSync(artifactDir, { recursive: true });

  // Announced before the fixture is built, not after. Everything needed is already in hand, and
  // the fixture takes several seconds, so this fills that time with the guide and its full step
  // list rather than an empty screen. It also stops the fixture log landing in the previous
  // guide's history segment on a multi-guide run.
  events.runStarted({
    guide: entry.guide,
    title: doc.title,
    baseUrl: state.baseUrl,
    fixture: entry.fixture,
    totalSteps: plan.steps.length
  });
  events.runPlan(planOutline(plan, doc));

  const fixture: FixtureResult = await setupFixture(entry.fixture, state);
  events.log(`fixture ${fixture.name}: ${fixture.describe.join(" ")}`);

  const recorded = options.forceAgent ? null : readResolved(entry.guide, doc.contentHash);
  if (recorded) {
    events.log(`replaying ${recorded.steps.length} recorded step(s); agent runs only on failure`);
  }

  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  const steps: StepResult[] = [];
  const findings: Finding[] = [];
  const unverified: UnverifiedRegion[] = [...doc.unverified];
  const startedAt = new Date().toISOString();

  try {
    browser = await chromium.launch({ headless: !options.headed });
    context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      // Deterministic rendering so a screenshot comparison is about labels, not locale.
      locale: "en-US",
      timezoneId: "UTC"
    });

    await createBrowserSession(context, state.baseUrl, {
      email: state.adminEmail,
      password: state.adminPassword,
      organizationId: state.organizationId
    });

    const page: Page = await context.newPage();
    const stopScreencast = await startScreencast(page, events);

    await page.goto(`${state.baseUrl}${fixture.entryPath}`, { waitUntil: "domcontentloaded" });

    const tools = createBrowserTools(page);
    await tools.settle();

    /**
     * Procedures are linear, so a step that could not be completed leaves every later step
     * standing on a state that was never reached. Running them anyway produced four findings
     * for one root cause on the first real run, which is exactly the noise that makes an
     * advisory check easy to ignore. They are reported as not-reached rather than passed or
     * failed, because we genuinely do not know whether they work.
     */
    const blockedProcedures = new Map<number, number>();

    /**
     * Findings the backstop refused. Kept and reported rather than discarded silently: a guard on
     * model output that nobody can see is a guard nobody can tell has started misfiring.
     */
    const droppedFindings: string[] = [];

    for (const step of plan.steps) {
      const blockedBy = blockedProcedures.get(step.procedureIndex);
      if (blockedBy !== undefined) {
        const reason = `not reached: step ${blockedBy} of this procedure could not be completed`;
        steps.push(emptyStepResult(step, "unverified", reason));
        events.stepResult(step.procedureIndex, step.docStepIndex, "unverified", reason);
        continue;
      }

      if (entry.skipSteps.includes(step.docStepIndex)) {
        steps.push(emptyStepResult(step, "skipped", "skipped by the registry"));
        events.stepResult(step.procedureIndex, step.docStepIndex, "skipped", "skipped by the registry");
        continue;
      }

      // A step whose only actions are out of reach is reported unverified, never passed. A
      // third-party console we cannot open is not evidence that the guide is correct.
      const externals = step.actions.filter((action) => action.kind === "external");
      if (externals.length > 0 && externals.length === step.actions.length) {
        const reason = externals
          .map((action) => (action.kind === "external" ? action.reason : ""))
          .join("; ");
        steps.push(emptyStepResult(step, "unverified", reason));
        unverified.push({ reason, tab: doc.tab, line: step.actions[0]?.sourceQuote.line ?? 0 });
        events.stepResult(step.procedureIndex, step.docStepIndex, "unverified", reason);
        continue;
      }

      const docStep = doc.procedures
        .find((procedure) => procedure.index === step.procedureIndex)
        ?.steps.find((candidate) => candidate.index === step.docStepIndex);
      const work = stepWork(step, docStep);

      if (work.kind === "informational") {
        // Nothing to do and nothing named, so there is nothing this checker can be right or wrong
        // about. Saying so costs no model call and removes the only opportunity to invent a finding.
        const reason = "the guide asks for no action here and names no part of the UI";
        steps.push(emptyStepResult(step, "skipped", reason));
        events.stepResult(step.procedureIndex, step.docStepIndex, "skipped", reason);
        continue;
      }

      // Both halves of the identity. docStepIndex alone is only unique within a procedure, so
      // matching on it made procedure 2's step 1 replay procedure 1's step 1 locators and report
      // the resulting failure against the wrong step.
      const recordedStep = recorded?.steps.find(
        (candidate) =>
          candidate.procedureIndex === step.procedureIndex &&
          candidate.docStepIndex === step.docStepIndex
      );

      const started = Date.now();
      let outcome: StepResult["outcome"] = "failed";
      let resolvedBy: StepResult["resolvedBy"] = "agent";
      let detail = "";
      let toolCalls = 0;
      let locators = recordedStep?.locators ?? [];
      const stepFindings: Finding[] = [];

      if (recordedStep) {
        events.stepStarted(step.procedureIndex, step.docStepIndex, step.instruction, "replay");
        const replay = await replayStep(recordedStep, tools, fixture.values);
        if (replay.ok) {
          outcome = "passed";
          resolvedBy = "replay";
          detail = replay.detail;
        } else {
          // Replay failure is the trigger for judgement, which is exactly when the agent is
          // worth paying for: the question is no longer "what do I click" but "what changed".
          events.log(`replay failed, escalating to the agent: ${replay.detail}`);
        }
      }

      if (outcome !== "passed") {
        events.stepStarted(step.procedureIndex, step.docStepIndex, step.instruction, "agent");
        const agent = await runStepAgent(
          step,
          tools,
          fixture.values,
          fixture.describe,
          usage,
          events,
          work
        );
        toolCalls = agent.toolCalls;
        outcome = agent.outcome;
        resolvedBy = "agent";
        detail = agent.notes.join(" ");
        locators = agent.resolvedLocators;

        // A gap-check that passed means every string the guide named was on screen. Recording that
        // as assertions turns a model judgement into a deterministic check on every later run, and
        // they go after the agent's own clicks so a disclosure it had to expand is expanded again.
        if (work.kind === "gap-check" && agent.outcome === "passed") {
          locators = [
            ...locators,
            ...work.named.map((name) => ({
              action: "expect_visible" as const,
              role: null,
              name,
              value: null
            }))
          ];
        }

        for (const partial of agent.findings) {
          if (isTitleEcho(partial, step, docStep)) {
            const note =
              `dropped a ${partial.severity} on step ${step.procedureIndex}.${step.docStepIndex}: ` +
              `"${partial.docSays}" is this step's heading, not something the guide asked for`;
            events.log(note);
            droppedFindings.push(note);
            continue;
          }

          const quote = step.actions[0]?.sourceQuote ?? {
            text: step.instruction,
            file: repoRelative(guideFile),
            line: 0
          };
          stepFindings.push({
            ...partial,
            guide: entry.guide,
            procedureIndex: step.procedureIndex,
            stepIndex: step.docStepIndex,
            sourceQuote: quote
          });
        }
      }

      if (options.compareScreenshots) {
        stepFindings.push(
          ...(await judgeScreenshots(step, guideFile, tools, artifactDir, entry, usage))
        );
      }

      // Blame is decided here, with the changed-file list in hand, rather than by the agent.
      for (const finding of stepFindings) {
        const verdict = await classifyBlame(
          {
            finding,
            guide: entry.guide,
            changedFiles: options.changedFiles
          },
          usage
        );
        finding.blame = verdict.blame;
        if (verdict.suggestedDocText && verdict.blame === "DOC_DRIFT") {
          finding.suggestion = {
            file: finding.sourceQuote.file,
            line: finding.sourceQuote.line,
            before: finding.docSays,
            after: verdict.suggestedDocText
          };
        }

        // Only worth locating for stale docs. An app regression does not want a "please update
        // your documentation" note attached to it, and a harness problem concerns nobody.
        if (finding.blame === "DOC_DRIFT" && options.diff) {
          finding.frontendAnchor = await findFrontendAnchor(
            { finding, diff: options.diff, changedFiles: options.changedFiles },
            usage
          );
        }

        findings.push(finding);
      }

      steps.push({
        procedureIndex: step.procedureIndex,
        docStepIndex: step.docStepIndex,
        instruction: step.instruction,
        outcome,
        resolvedBy,
        toolCalls,
        durationMs: Date.now() - started,
        findings: stepFindings,
        resolvedLocators: locators
      });

      events.stepResult(step.procedureIndex, step.docStepIndex, outcome, detail || outcome);

      // Close the procedure so the cascade above suppresses the rest of it.
      if (outcome === "failed") blockedProcedures.set(step.procedureIndex, step.docStepIndex);
    }

    await stopScreencast();

    if (droppedFindings.length > 0) {
      events.log(
        `${droppedFindings.length} finding(s) dropped: the agent compared a step heading against ` +
          `the UI, which the guide never claimed`
      );
    }

    const prefix = recordablePrefix(steps).map((recorded) => ({
      ...recorded,
      // Store placeholders, not this run's generated names, or the recording only ever
      // matches the fixture that produced it.
      locators: parameterizeLocators(recorded.locators, fixture.values)
    }));

    if (prefix.length > 0) {
      const target = writeResolved({
        guide: entry.guide,
        guideDocHash: doc.contentHash,
        recordedAt: new Date().toISOString(),
        steps: prefix
      });
      const total = steps.length;
      events.log(
        prefix.length === total
          ? `recorded all ${total} step(s) for replay in ${path.basename(target)}`
          : `recorded the first ${prefix.length} of ${total} step(s) for replay in ` +
            `${path.basename(target)}; the agent will resume from where this run stopped`
      );
    }
  } finally {
    await context?.close();
    await browser?.close();
  }

  const counts = {
    passed: steps.filter((step) => step.outcome === "passed").length,
    failed: steps.filter((step) => step.outcome === "failed").length,
    skipped: steps.filter((step) => step.outcome === "skipped").length,
    unverified: steps.filter((step) => step.outcome === "unverified").length
  };
  events.runFinished(counts);

  return {
    result: {
      guide: entry.guide,
      startedAt,
      finishedAt: new Date().toISOString(),
      baseUrl: state.baseUrl,
      mode: recorded ? "mixed" : "agent",
      steps,
      findings,
      unverified
    },
    usage,
    artifactDir
  };
};

const judgeScreenshots = async (
  step: PlanStep,
  guideFile: string,
  tools: ReturnType<typeof createBrowserTools>,
  artifactDir: string,
  entry: GuideRegistryEntry,
  usage: UsageTotals
): Promise<Finding[]> => {
  const out: Finding[] = [];

  for (const action of step.actions) {
    if (action.kind !== "expect_screenshot") continue;

    const docPath = findDocImage(action.docImage, guideFile);
    if (!docPath) continue;

    const live = await tools.screenshot();
    const livePath = path.join(artifactDir, `step-${step.docStepIndex}-live.png`);
    fs.writeFileSync(livePath, live);

    const verdict = await compareScreenshots(
      {
        docImageBase64: fs.readFileSync(docPath).toString("base64"),
        docMediaType: mediaTypeFor(docPath),
        liveImageBase64: live.toString("base64"),
        stepInstruction: step.instruction
      },
      usage
    );

    // A low-confidence verdict is not evidence. Reporting one would manufacture exactly the
    // kind of false positive that makes a non-deterministic check untrustworthy.
    if (!verdict || verdict.verdict === "match" || verdict.confidence === "low") continue;

    const diffs = verdict.labelDiffs
      .map((diff) => `"${diff.docText}" is now "${diff.liveText}"`)
      .join("; ");

    out.push({
      severity: "STALE_SCREENSHOT",
      blame: "DOC_DRIFT",
      guide: entry.guide,
      procedureIndex: step.procedureIndex,
      stepIndex: step.docStepIndex,
      summary:
        verdict.verdict === "wrong_screen"
          ? `The screenshot for step ${step.docStepIndex} shows a different screen than the app now presents.`
          : `The screenshot for step ${step.docStepIndex} is out of date: ${diffs || "labels have changed"}.`,
      docSays: action.docImage,
      appShows: diffs || verdict.missingInLive.join("; ") || "a visibly different screen",
      sourceQuote: action.sourceQuote,
      suggestion: null,
      frontendAnchor: null,
      evidence: { docScreenshot: docPath, liveScreenshot: livePath }
    });
  }

  return out;
};

const emptyStepResult = (
  step: PlanStep,
  outcome: StepResult["outcome"],
  detail: string
): StepResult => ({
  procedureIndex: step.procedureIndex,
  docStepIndex: step.docStepIndex,
  instruction: `${step.instruction}${detail ? ` (${detail})` : ""}`,
  outcome,
  resolvedBy: "skipped",
  toolCalls: 0,
  durationMs: 0,
  findings: [],
  resolvedLocators: []
});

const planSafeName = (guide: string): string =>
  guide
    .replace(/^docs\//, "")
    .replace(/\.mdx$/, "")
    .replace(/[/\\]/g, "-");

export { planSafeName };
