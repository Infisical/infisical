import fs from "node:fs";
import path from "node:path";

import { RESOLVED_DIR } from "../paths.js";
import type { ResolvedLocator, StepOutcome } from "../types.js";
import type { BrowserTools } from "./browser.js";
import { planSlug } from "../compile/index.js";

/**
 * L3: the ratchet.
 *
 * Once the agent has walked a guide successfully, the locators it resolved are written here and
 * every later run replays them with no model involved. That is what makes the steady state
 * cheap and deterministic: the agent is a compiler from prose to selectors, run once, not a
 * runtime.
 *
 * The resolved artifact is JSON replayed through the same BrowserTools the agent uses, rather
 * than a generated .spec.ts driven by the Playwright test runner. Deliberate: a generated spec
 * would be a second execution path with its own process, its own auth setup and its own failure
 * modes, and any divergence between the two would show up as a phantom finding. Same tools plus
 * same page means replay failure is a real signal.
 */

export type ResolvedStep = {
  docStepIndex: number;
  procedureIndex: number;
  instruction: string;
  locators: ResolvedLocator[];
};

export type ResolvedGuide = {
  guide: string;
  /** Ties the artifact to the plan it came from; a plan change invalidates replay. */
  guideDocHash: string;
  recordedAt: string;
  steps: ResolvedStep[];
};

const resolvedPath = (guide: string): string =>
  path.join(RESOLVED_DIR, `${planSlug(guide)}.json`);

export const writeResolved = (resolved: ResolvedGuide): string => {
  fs.mkdirSync(RESOLVED_DIR, { recursive: true });
  const target = resolvedPath(resolved.guide);
  fs.writeFileSync(target, `${JSON.stringify(resolved, null, 2)}\n`);
  return target;
};

export const readResolved = (guide: string, guideDocHash: string): ResolvedGuide | null => {
  const target = resolvedPath(guide);
  if (!fs.existsSync(target)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(target, "utf8")) as ResolvedGuide;
    // A stale recording describes a guide that has since changed; replaying it would verify
    // the wrong thing, so fall back to the agent instead.
    return parsed.guideDocHash === guideDocHash ? parsed : null;
  } catch {
    return null;
  }
};

/**
 * Works out how much of a walk is safe to replay next time.
 *
 * Originally this recorded nothing unless every step passed, which turned out to be far too
 * strict: a seven-step guide with one broken step recorded none of its six working ones, so it
 * stayed on the expensive model-driven path forever. Since procedures are independent and
 * linear, the contiguous run of passing steps at the start of each one is replayable on its own,
 * and the agent simply resumes at the first step that stopped.
 *
 * Where the prefix stops matters more than where it starts:
 *
 *   passed      recorded, and the prefix continues.
 *   skipped     the prefix continues but nothing is recorded. A registry skip is deliberate and
 *               will be skipped identically next run, so it does not change the browser state.
 *   failed      stop. Anything after this ran against a state the guide never reached.
 *   unverified  stop. Either the step was never reached, or it needed something outside this
 *               instance, which means a reader would have gone off and done something we did not
 *               do. Replaying past it would act on a state we cannot reproduce.
 */
export const recordablePrefix = (results: StepResultLike[]): ResolvedStep[] => {
  const byProcedure = new Map<number, StepResultLike[]>();
  for (const result of results) {
    const list = byProcedure.get(result.procedureIndex) ?? [];
    list.push(result);
    byProcedure.set(result.procedureIndex, list);
  }

  const out: ResolvedStep[] = [];

  for (const procedureIndex of [...byProcedure.keys()].sort((a, b) => a - b)) {
    for (const result of byProcedure.get(procedureIndex) ?? []) {
      if (result.outcome !== "passed" && result.outcome !== "skipped") break;
      if (result.outcome !== "passed" || result.resolvedLocators.length === 0) continue;

      out.push({
        docStepIndex: result.docStepIndex,
        procedureIndex: result.procedureIndex,
        instruction: result.instruction,
        locators: result.resolvedLocators
      });
    }
  }

  return out;
};

/**
 * Fixture values are regenerated every run, so a recorded locator has to store the placeholder
 * rather than the value it happened to resolve to.
 *
 * Without this the first recording of a guide that touches a fixture-created resource is dead on
 * arrival: it captures something like `guiderails-subject-868a0d62`, next run's fixture makes
 * `guiderails-subject-1f4c9ab2`, the locator never matches, and every guide with a generated name
 * in it falls back to the agent forever.
 *
 * Only values of 8 characters or more are substituted. The values that actually vary between runs
 * are the generated ones (project slugs, identity names, UUIDs) and all of them are long, while
 * the short ones are fixed strings like `dev` that are identical every run. Replacing `dev`
 * everywhere would corrupt unrelated labels such as "Development".
 */
const PARAMETERIZABLE_MIN_LENGTH = 8;

const substitutionPairs = (fixtureValues: Record<string, string>): [string, string][] =>
  Object.entries(fixtureValues)
    .filter(([, value]) => value.length >= PARAMETERIZABLE_MIN_LENGTH)
    // Longest first, so a value that contains another is replaced before its substring is.
    .sort((a, b) => b[1].length - a[1].length)
    .map(([key, value]) => [value, `{{fixture.${key}}}`]);

const applyPairs = (text: string | null, pairs: [string, string][]): string | null => {
  if (text === null) return null;
  let out = text;
  for (const [from, to] of pairs) out = out.split(from).join(to);
  return out;
};

/** Value to placeholder, for writing a recording. */
export const parameterizeLocators = (
  locators: ResolvedLocator[],
  fixtureValues: Record<string, string>
): ResolvedLocator[] => {
  const pairs = substitutionPairs(fixtureValues);
  return locators.map((locator) => ({
    ...locator,
    name: applyPairs(locator.name, pairs),
    value: applyPairs(locator.value, pairs)
  }));
};

/** Placeholder to value, for replaying one. */
export const resolveLocators = (
  locators: ResolvedLocator[],
  fixtureValues: Record<string, string>
): ResolvedLocator[] => {
  const replace = (text: string | null): string | null =>
    text === null
      ? null
      : text.replace(
          /\{\{fixture\.(\w+)\}\}/g,
          (whole, key: string) => fixtureValues[key] ?? whole
        );

  return locators.map((locator) => ({
    ...locator,
    name: replace(locator.name),
    value: replace(locator.value)
  }));
};

/** The slice of StepResult the prefix calculation needs, so it can be tested in isolation. */
export type StepResultLike = {
  procedureIndex: number;
  docStepIndex: number;
  instruction: string;
  outcome: StepOutcome;
  resolvedLocators: ResolvedLocator[];
};

export type ReplayOutcome = {
  ok: boolean;
  detail: string;
  /** Which locator failed, so the agent escalation knows where to pick up. */
  failedAt: number | null;
};

/**
 * Replays one step's locators in order. The first failure stops the step: a locator that no
 * longer resolves is precisely the signal that something drifted, and continuing past it would
 * act on a page the recording never anticipated.
 */
export const replayStep = async (
  step: ResolvedStep,
  tools: BrowserTools,
  fixtureValues: Record<string, string>
): Promise<ReplayOutcome> => {
  // Placeholders go back to this run's values before anything is clicked.
  const locators = resolveLocators(step.locators, fixtureValues);

  for (let index = 0; index < locators.length; index += 1) {
    const locator = locators[index];
    if (!locator) continue;

    const outcome = await (async () => {
      switch (locator.action) {
        case "click":
          return tools.click(locator.name ?? "", locator.role);
        case "fill":
          return tools.fill(locator.name ?? "", locator.value ?? "");
        case "select":
          return tools.select(locator.name ?? "", locator.value ?? "");
        case "expect_visible":
          return tools.expectVisible(locator.name ?? "");
        default:
          return { ok: true, detail: `nothing to replay for ${locator.action}` };
      }
    })();

    if (!outcome.ok) {
      return {
        ok: false,
        detail: `locator ${index + 1}/${locators.length} (${locator.action} "${locator.name ?? ""}") no longer resolves: ${outcome.detail}`,
        failedAt: index
      };
    }
  }

  return {
    ok: true,
    detail: `replayed ${locators.length} locator(s)`,
    failedAt: null
  };
};

export { resolvedPath };
