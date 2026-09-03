import Anthropic from "@anthropic-ai/sdk";

/**
 * Shared Claude client and model policy.
 *
 * Model choice and effort are set per task rather than globally, because the three jobs this
 * harness gives the model have genuinely different shapes:
 *
 *   compile  a well-specified transformation over text we already parsed        medium
 *   navigate one bounded UI step at a time, with a tool-call cap                medium
 *   judge    "which side is wrong, and can you cite it" - the call that matters high
 *
 * Opus 5 is unusually strong at the low and medium end, so medium is the starting point and
 * the judge is the only place that pays for more.
 */

export type Task = "compile" | "navigate" | "screenshot" | "blame" | "anchor";

/**
 * Model per task, because the four jobs have genuinely different demands and a single global
 * constant hides that.
 *
 *   compile     A transformation over text already parsed into structured fields. Runs once per
 *               guide change and its output is reviewed by a human before being committed, so
 *               the review gate absorbs model error.
 *   navigate    One bounded step: read an accessibility tree, match a label, click, report.
 *               Small context, eight tools, hard call cap.
 *   screenshot  Two images against a strict rubric, with low-confidence verdicts discarded.
 *   blame       Which side of a mismatch is wrong. One call per finding, and the judgment the
 *               whole report rests on: a wrong "docs are stale" puts a bad patch on somebody's
 *               pull request, and a wrong "app regressed" sends them chasing a bug that does not
 *               exist. Needs calibrated uncertainty to honour "prefer harness when unsure",
 *               which is the one place here worth paying for capability.
 *
 * Override any of them per run, e.g. GUIDERAILS_MODEL_NAVIGATE=claude-opus-5, to compare
 * without editing code.
 */
const DEFAULT_MODELS: Record<Task, string> = {
  compile: "claude-sonnet-5",
  navigate: "claude-sonnet-5",
  screenshot: "claude-sonnet-5",
  blame: "claude-opus-5",
  // Reading a diff to find which line produces a label. Bounded input, and a wrong answer is
  // rejected by verification rather than reaching anybody.
  anchor: "claude-sonnet-5"
};

export const modelFor = (task: Task): string =>
  process.env[`GUIDERAILS_MODEL_${task.toUpperCase()}`] ?? DEFAULT_MODELS[task];

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

let client: Anthropic | null = null;

/**
 * Credentials are left entirely to the SDK's resolution chain (ANTHROPIC_API_KEY, then
 * ANTHROPIC_AUTH_TOKEN, then an `ant auth login` profile, then workload identity). Checking
 * for ANTHROPIC_API_KEY here would wrongly reject a machine that authenticates by profile,
 * which is the normal local setup.
 */
export const getClient = (): Anthropic => {
  if (!client) client = new Anthropic();
  return client;
};

/**
 * True when some credential source is likely available. Used only to print a useful message
 * before starting work that would otherwise fail on the first call; never to gate the client.
 */
export const hasLikelyCredentials = (): boolean =>
  Boolean(
    process.env.ANTHROPIC_API_KEY ||
      process.env.ANTHROPIC_AUTH_TOKEN ||
      process.env.ANTHROPIC_PROFILE ||
      process.env.ANTHROPIC_IDENTITY_TOKEN ||
      process.env.ANTHROPIC_IDENTITY_TOKEN_FILE
  );

export const CREDENTIALS_HINT =
  "No Claude credentials found. Set ANTHROPIC_API_KEY, or run `ant auth login` to store a " +
  "profile the SDK picks up automatically. The extractor, image linter and drift check all " +
  "run offline and need none of this.";

/**
 * Marks a system prompt as cacheable.
 *
 * Render order is tools, then system, then messages, so a byte-identical system block plus a
 * stable tool set means every call after the first in a run is a cache read at roughly a
 * tenth of the input price. That is why per-step content goes in the user message and never
 * gets interpolated into the system prompt: a single interpolated step number would
 * invalidate the prefix on every call and silently undo the saving.
 *
 * Opus 5's minimum cacheable prefix is 512 tokens, which every prompt here clears.
 */
export const cachedSystem = (text: string): Anthropic.TextBlockParam[] => [
  { type: "text", text, cache_control: { type: "ephemeral" } }
];

/** Accumulated across a run so the report can state what the run actually cost. */
export type UsageTotals = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  calls: number;
};

export const emptyUsage = (): UsageTotals => ({
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  calls: 0
});

export const addUsage = (
  totals: UsageTotals,
  usage: {
    input_tokens?: number | null;
    output_tokens?: number | null;
    cache_read_input_tokens?: number | null;
    cache_creation_input_tokens?: number | null;
  } | null
): void => {
  totals.calls += 1;
  if (!usage) return;
  totals.inputTokens += usage.input_tokens ?? 0;
  totals.outputTokens += usage.output_tokens ?? 0;
  totals.cacheReadTokens += usage.cache_read_input_tokens ?? 0;
  totals.cacheWriteTokens += usage.cache_creation_input_tokens ?? 0;
};

export const formatUsage = (totals: UsageTotals): string => {
  const cacheRatio =
    totals.cacheReadTokens + totals.inputTokens > 0
      ? Math.round(
          (totals.cacheReadTokens / (totals.cacheReadTokens + totals.inputTokens)) * 100
        )
      : 0;
  return (
    `${totals.calls} model call(s), ` +
    `${totals.inputTokens} uncached in / ${totals.cacheReadTokens} cached in / ` +
    `${totals.outputTokens} out (${cacheRatio}% of input served from cache)`
  );
};
