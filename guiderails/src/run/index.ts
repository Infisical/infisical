import fs from "node:fs";
import path from "node:path";

import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";

import { checkPlanDrift } from "../compile/index.js";
import { loadInstanceState, type InstanceState } from "../env/bootstrap.js";
import { setupFixture, type FixtureResult } from "../env/fixtures.js";
import { createBrowserSession } from "../env/session.js";
import { extractGuide } from "../extract/index.js";
import { emptyUsage, type UsageTotals } from "../llm.js";
import { DOCS_ROOT, REPORTS_DIR, REPO_ROOT, repoRelative, resolveGuidePath } from "../paths.js";
import type {
  Finding,
  GuidePlan,
  GuideRegistryEntry,
  PlanStep,
  RunResult,
  StepResult,
  UnverifiedRegion
} from "../types.js";
import { findFrontendAnchor } from "../verify/anchor.js";
import { classifyBlame, compareScreenshots, mediaTypeFor } from "../verify/judge.js";
import { runStepAgent } from "./agent.js";
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

  const fixture: FixtureResult = await setupFixture(entry.fixture, state);
  events.log(`fixture ${fixture.name}: ${fixture.describe.join(" ")}`);

  const recorded = options.forceAgent ? null : readResolved(entry.guide, doc.contentHash);
  events.runStarted(entry.guide, state.baseUrl, plan.steps.length, fixture.name);
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

    for (const step of plan.steps) {
      const blockedBy = blockedProcedures.get(step.procedureIndex);
      if (blockedBy !== undefined) {
        const reason = `not reached: step ${blockedBy} of this procedure could not be completed`;
        steps.push(emptyStepResult(step, "unverified", reason));
        events.stepResult(step.docStepIndex, "unverified", reason);
        continue;
      }

      if (entry.skipSteps.includes(step.docStepIndex)) {
        steps.push(emptyStepResult(step, "skipped", "skipped by the registry"));
        events.stepResult(step.docStepIndex, "skipped", "skipped by the registry");
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
        events.stepResult(step.docStepIndex, "unverified", reason);
        continue;
      }

      const recordedStep = recorded?.steps.find(
        (candidate) => candidate.docStepIndex === step.docStepIndex
      );

      const started = Date.now();
      let outcome: StepResult["outcome"] = "failed";
      let resolvedBy: StepResult["resolvedBy"] = "agent";
      let detail = "";
      let toolCalls = 0;
      let locators = recordedStep?.locators ?? [];
      const stepFindings: Finding[] = [];

      if (recordedStep) {
        events.stepStarted(step.docStepIndex, step.instruction, "replay");
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
        events.stepStarted(step.docStepIndex, step.instruction, "agent");
        const agent = await runStepAgent(
          step,
          tools,
          fixture.values,
          fixture.describe,
          usage,
          events
        );
        toolCalls = agent.toolCalls;
        outcome = agent.outcome;
        resolvedBy = "agent";
        detail = agent.notes.join(" ");
        locators = agent.resolvedLocators;

        for (const partial of agent.findings) {
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

      events.stepResult(step.docStepIndex, outcome, detail || outcome);

      // Close the procedure so the cascade above suppresses the rest of it.
      if (outcome === "failed") blockedProcedures.set(step.procedureIndex, step.docStepIndex);
    }

    await stopScreencast();

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
