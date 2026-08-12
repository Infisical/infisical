import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import * as z from "zod/v4";

import { addUsage, cachedSystem, getClient, modelFor, type UsageTotals } from "../llm.js";
import type { Finding, PlanStep, ResolvedLocator, Severity } from "../types.js";
import type { BrowserTools } from "./browser.js";
import type { RunEvents } from "./events.js";

/**
 * L4: the agent, scoped to exactly one plan step at a time.
 *
 * The scoping is the safety mechanism, not a convenience. The agent never sees the whole guide,
 * so it cannot skip ahead, cannot decide a later step is a better idea, and cannot wander into
 * an expensive tangent. It must finish by reporting the step done or blocked, and a hard
 * tool-call cap means a lost agent fails loudly instead of quietly burning budget.
 */

const MAX_TOOL_CALLS_PER_STEP = 8;

const AGENT_SYSTEM_PROMPT = `You are verifying one step of an Infisical documentation guide against a live instance, acting as a reader who has the guide open and is following it literally.

You see the page only through its accessibility tree, and you address controls by their visible label. That is deliberate: it is the mechanical equivalent of a person reading the screen.

## What you are deciding

Whether a reader following this step, on this page, could do what the guide says. Nothing else. You are not testing the product, and you are not judging whether the guide is well written.

## How to work

Call snapshot first to see the page. Then act. Then report.

If the step succeeds, call step_done. Include the exact label you actually used for each control, because a successful run is serialized into a replayable script and a paraphrased label breaks the replay.

If the step cannot be completed as written, call report_finding once and then step_blocked. Be specific about the difference between what the guide said and what the page offered:

- The guide names a control that does not exist, but a differently labelled one clearly does the same job. That is a label mismatch: report both strings exactly.
- The guide names a control that does not exist and nothing equivalent does either. That is a blocker.
- The page requires something the guide never mentions (a required field, a confirmation dialog, a prerequisite). That is a missing step.
- The guide describes a step the page has no trace of. That is an extra step.

## Rules

1. Do only what this step says. Do not perform the next step because it seems helpful, and do not clean up after yourself.
2. Quote real strings. When you report a mismatch, "what the app shows" must be a label you actually saw in the snapshot, copied exactly. Never paraphrase it and never guess at one.
3. Some controls in this app genuinely have no accessible name, usually icon-only buttons. If the step needs one of those, say so as the reason and block. Do not guess at a positional workaround: a confident wrong click produces a misleading finding, which is worse than an honest inability to proceed.
4. If a snapshot looks like a loading state, take one more snapshot before concluding anything is missing.
5. You have a small budget of tool calls. Spend it on acting, not on re-reading an unchanged page.`;

export type StepAgentResult = {
  outcome: "passed" | "failed";
  toolCalls: number;
  findings: Omit<Finding, "guide" | "procedureIndex" | "stepIndex" | "sourceQuote">[];
  resolvedLocators: ResolvedLocator[];
  notes: string[];
};

const findingSchema = z.object({
  severity: z
    .enum(["BLOCKER", "MISMATCH", "STALE_SCREENSHOT", "MISSING_STEP", "EXTRA_STEP"])
    .describe("MISMATCH for a label difference; BLOCKER when the step cannot be completed."),
  summary: z.string().min(1).describe("One sentence stating the defect."),
  docSays: z
    .string()
    .min(1)
    .describe("What the guide told the reader to look for, copied from the step."),
  appShows: z
    .string()
    .min(1)
    .describe(
      "What the page actually presented, copied exactly from the snapshot. If nothing " +
        "equivalent exists, say so plainly rather than inventing a label."
    )
});

/**
 * Renders the step for the agent. Kept out of the system prompt so the cache prefix holds.
 *
 * Placeholders are resolved in **every** field the agent reads, not just fill values. Resolving
 * only some of them was a real bug: a click target left as a literal `{{fixture.subjectName}}`
 * gave the agent an unresolvable string, so it improvised and clicked the wrong principal
 * entirely, and the six cascading blockers that followed looked like the guide's fault.
 */
const renderStep = (
  step: PlanStep,
  fixtureValues: Record<string, string>,
  startingState: string[]
): string => {
  const fill = (text: string): string => resolvePlaceholders(text, fixtureValues);

  const actions = step.actions.map((action, index) => {
    switch (action.kind) {
      case "navigate":
        return `${index + 1}. Navigate: ${action.path.map(fill).join(" > ")}`;
      case "click":
        return `${index + 1}. Click "${fill(action.target)}"${action.role ? ` (role ${action.role})` : ""}`;
      case "fill":
        return `${index + 1}. Fill "${fill(action.field)}" with "${fill(action.value)}"`;
      case "select":
        return `${index + 1}. In "${fill(action.field)}" choose "${fill(action.option)}"`;
      case "expect_visible":
        return `${index + 1}. Confirm the page shows "${fill(action.text)}"`;
      case "expect_screenshot":
        return `${index + 1}. (a screenshot is compared separately; no action needed)`;
      case "external":
        return `${index + 1}. (skipped, needs something outside this instance: ${action.reason})`;
      default:
        return `${index + 1}. (unknown action)`;
    }
  });

  return [
    `Step ${step.docStepIndex}: ${fill(step.instruction)}`,
    "",
    // Without this the agent cannot tell that the subject it is asked to act on is a machine
    // identity rather than a user, which in this app lives behind a different tab.
    "Starting state of this instance:",
    ...startingState.map((line) => `- ${line}`),
    "",
    "What the guide says to do:",
    actions.length > 0 ? actions.join("\n") : "(nothing actionable)",
    "",
    "Quotes from the guide, for reporting mismatches accurately:",
    ...step.actions.map((action) => `- "${action.sourceQuote.text}"`)
  ].join("\n");
};

export const resolvePlaceholders = (
  value: string,
  fixtureValues: Record<string, string>
): string =>
  value.replace(/\{\{fixture\.(\w+)\}\}/g, (whole, key: string) => fixtureValues[key] ?? whole);

export const runStepAgent = async (
  step: PlanStep,
  tools: BrowserTools,
  fixtureValues: Record<string, string>,
  startingState: string[],
  usage: UsageTotals,
  events: RunEvents
): Promise<StepAgentResult> => {
  const client = getClient();

  let toolCalls = 0;
  let terminal: "passed" | "failed" | null = null;
  const findings: StepAgentResult["findings"] = [];
  const resolvedLocators: ResolvedLocator[] = [];
  const notes: string[] = [];

  /** Shared by every tool so the cap applies to the step as a whole. */
  const budgetExceeded = (): boolean => toolCalls >= MAX_TOOL_CALLS_PER_STEP;

  /**
   * Stops the runner as soon as the step reaches a verdict.
   *
   * The runner calls the API, yields the message, and only then executes that message's tools,
   * so a `terminal` flag checked in the consumer loop is always one turn behind: by the time we
   * could see it, another request has already gone out and its response is discarded. Aborting
   * from inside the terminal tool closes the loop on the turn that actually ended it, which cut
   * roughly a third of the calls in a seven-step walk.
   */
  const finish = new AbortController();

  const guardedTool = <T>(name: string, fn: () => Promise<T>) =>
    async (): Promise<T | string> => {
      if (budgetExceeded()) {
        return `Tool budget for this step is exhausted (${MAX_TOOL_CALLS_PER_STEP} calls). Report the step blocked with what you know.` as T | string;
      }
      toolCalls += 1;
      events.toolCall(name);
      return fn();
    };

  const snapshotTool = betaZodTool({
    name: "snapshot",
    description:
      "Read the page's accessibility tree: every control with its role and visible label.",
    inputSchema: z.object({}),
    run: guardedTool("snapshot", async () => tools.snapshot())
  });

  const clickTool = betaZodTool({
    name: "click",
    description: "Click a control by its visible label.",
    inputSchema: z.object({
      name: z.string().describe("The visible label, copied from the snapshot."),
      role: z
        .string()
        .nullable()
        .describe("ARIA role if you are certain of it, otherwise null.")
    }),
    run: async (input) => {
      if (budgetExceeded()) return "Tool budget exhausted; report and block.";
      toolCalls += 1;
      events.toolCall(`click ${input.name}`);
      const result = await tools.click(input.name, input.role);
      if (result.locator) resolvedLocators.push(result.locator);
      return `${result.ok ? "ok" : "failed"}: ${result.detail}`;
    }
  });

  const fillTool = betaZodTool({
    name: "fill",
    description: "Type a value into a labelled text field.",
    inputSchema: z.object({
      field: z.string().describe("The field's visible label."),
      value: z.string().describe("The value to type.")
    }),
    run: async (input) => {
      if (budgetExceeded()) return "Tool budget exhausted; report and block.";
      toolCalls += 1;
      events.toolCall(`fill ${input.field}`);
      const result = await tools.fill(input.field, input.value);
      if (result.locator) resolvedLocators.push(result.locator);
      return `${result.ok ? "ok" : "failed"}: ${result.detail}`;
    }
  });

  const selectTool = betaZodTool({
    name: "select",
    description: "Choose an option from a dropdown or radio group.",
    inputSchema: z.object({
      field: z.string().describe("The control's visible label."),
      option: z.string().describe("The option to choose.")
    }),
    run: async (input) => {
      if (budgetExceeded()) return "Tool budget exhausted; report and block.";
      toolCalls += 1;
      events.toolCall(`select ${input.field}`);
      const result = await tools.select(input.field, input.option);
      if (result.locator) resolvedLocators.push(result.locator);
      return `${result.ok ? "ok" : "failed"}: ${result.detail}`;
    }
  });

  const expectVisibleTool = betaZodTool({
    name: "expect_visible",
    description: "Check whether some text is present on the page.",
    inputSchema: z.object({ text: z.string() }),
    run: async (input) => {
      if (budgetExceeded()) return "Tool budget exhausted; report and block.";
      toolCalls += 1;
      events.toolCall(`expect_visible ${input.text}`);
      const result = await tools.expectVisible(input.text);
      if (result.locator) resolvedLocators.push(result.locator);
      return `${result.ok ? "ok" : "failed"}: ${result.detail}`;
    }
  });

  const reportFindingTool = betaZodTool({
    name: "report_finding",
    description:
      "Record a discrepancy between the guide and the app. Call at most once per step.",
    inputSchema: findingSchema,
    run: async (input) => {
      events.toolCall(`report_finding ${input.severity}`);
      findings.push({
        severity: input.severity as Severity,
        // Blame is decided by a separate pass with the diff in hand; the agent only observes.
        blame: "DOC_DRIFT",
        summary: input.summary,
        docSays: input.docSays,
        appShows: input.appShows,
        suggestion: null,
        frontendAnchor: null,
        evidence: {}
      });
      events.finding(input.severity, input.summary);
      return "recorded";
    }
  });

  const stepDoneTool = betaZodTool({
    name: "step_done",
    description: "The step succeeded as written. Ends the step.",
    inputSchema: z.object({
      note: z
        .string()
        .describe("One short sentence on what you did, for the run log.")
    }),
    run: async (input) => {
      terminal = "passed";
      notes.push(input.note);
      finish.abort();
      return "acknowledged";
    }
  });

  const stepBlockedTool = betaZodTool({
    name: "step_blocked",
    description: "The step cannot be completed as written. Ends the step.",
    inputSchema: z.object({
      reason: z.string().describe("Why a reader could not proceed.")
    }),
    run: async (input) => {
      terminal = "failed";
      notes.push(input.reason);
      finish.abort();
      return "acknowledged";
    }
  });

  const runner = client.beta.messages.toolRunner({
    model: modelFor("navigate"),
    max_tokens: 8000,
    // Frozen prefix plus a fixed tool set, so every step after the first is a cache read.
    system: cachedSystem(AGENT_SYSTEM_PROMPT),
    thinking: { type: "adaptive", display: "summarized" },
    output_config: { effort: "medium" },
    tools: [
      snapshotTool,
      clickTool,
      fillTool,
      selectTool,
      expectVisibleTool,
      reportFindingTool,
      stepDoneTool,
      stepBlockedTool
    ],
    messages: [{ role: "user", content: renderStep(step, fixtureValues, startingState) }],
    max_iterations: MAX_TOOL_CALLS_PER_STEP + 4
  }, { signal: finish.signal });

  try {
    for await (const message of runner) {
      for (const block of message.content) {
        if (block.type === "thinking" && block.thinking) events.thinking(block.thinking);
        else if (block.type === "text" && block.text.trim()) events.assistantText(block.text);
      }
      addUsage(usage, message.usage);
      if (terminal) break;
    }
  } catch (error) {
    // Our own abort is the expected way this loop ends; anything else is a real failure.
    if (!(error instanceof Anthropic.APIUserAbortError)) throw error;
  }

  // An agent that ran out of turns without reporting is a failure, not a pass. Defaulting the
  // other way would turn every timeout into a silent green step.
  if (!terminal) {
    notes.push(
      `Agent ended without reporting an outcome after ${toolCalls} tool call(s); treated as failed.`
    );
    if (findings.length === 0) {
      findings.push({
        severity: "BLOCKER",
        blame: "HARNESS",
        summary: "The agent did not reach a conclusion for this step.",
        docSays: step.instruction,
        appShows: "no conclusion reached",
        suggestion: null,
        frontendAnchor: null,
        evidence: {}
      });
    }
  }

  return {
    outcome: terminal ?? "failed",
    toolCalls,
    findings,
    resolvedLocators,
    notes
  };
};

export { MAX_TOOL_CALLS_PER_STEP, AGENT_SYSTEM_PROMPT };
