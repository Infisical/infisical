/**
 * The five layers of the determinism ladder each own one of the shapes below.
 *
 *   L1 extract -> GuideDoc   (pure code, runs every time)
 *   L2 compile -> GuidePlan  (LLM once, committed, hash-gated against GuideDoc)
 *   L3 replay  -> RunResult  (generated Playwright spec, no LLM)
 *   L4 agent   -> RunResult  (bounded, one PlanStep at a time)
 *   L5 judge   -> Finding[]  (structured output, every finding cites a SourceQuote)
 */

/**
 * Anchors a claim back to the exact bytes it came from. Every Action and every Finding
 * carries one. This is what separates "the guide says X" from a plausible-sounding
 * invention, and it is what lets the reporter put a GitHub suggestion on the right line.
 *
 * `file` is not always the guide: text inlined from docs/snippets/ keeps its own origin so
 * a suggestion lands in the snippet rather than in every page that imports it.
 */
export type SourceQuote = {
  text: string;
  /**
   * Repo-relative, always. This ends up inside `compiled/*.json`, which is committed, so an
   * absolute path here would break on every other machine and leak the compiling developer's
   * home directory into git. Use `fromRepoRelative` when you actually need to open the file.
   */
  file: string;
  line: number;
};

// ---------------------------------------------------------------------------
// L1: GuideDoc
// ---------------------------------------------------------------------------

export type ImageRef = {
  /** Exactly as written in the MDX, before any root resolution. */
  raw: string;
  /** Absolute path on disk, or null when no candidate root resolved it. */
  resolved: string | null;
  alt: string;
  line: number;
  file: string;
  exists: boolean;
};

/**
 * A documented form field. Two sources produce these: `<ParamField path="..." />`
 * elements, and the `- **Label** — description` bullet convention that
 * dynamic-secret and access-control guides use to describe a modal's inputs.
 */
export type FieldSpec = {
  label: string;
  description: string;
  required: boolean;
  type: string | null;
};

export type Callout = {
  kind: "Note" | "Warning" | "Tip" | "Info" | "Check" | "Danger";
  text: string;
  line: number;
};

export type CodeBlock = {
  lang: string | null;
  value: string;
  line: number;
};

export type GuideStep = {
  /** 1-based within the owning procedure. */
  index: number;
  /**
   * The `<Step title="...">` attribute. Load-bearing rather than decorative: 2,281 of
   * the repo's 2,316 steps are titled, and in several guides the title is the entire
   * instruction with an image as the only body content.
   */
  title: string | null;
  /** Body text flattened to plaintext, with snippet imports already inlined. */
  prose: string;
  /**
   * Explicitly delimited UI targets in document order: `**bold**` spans and `inline code`,
   * which the docs use interchangeably for this (about 6% of imperative instructions use
   * backticks where the style guide would use bold). Multi-segment spans are excluded
   * because navPaths already owns those. High precision where present, but present for
   * only about half of the imperatives in core-product guides, so the compiler cannot
   * treat an empty list as "no target".
   */
  boldTargets: string[];
  /** Normalized nav breadcrumbs, collapsed from all five spellings found in docs/. */
  navPaths: string[][];
  images: ImageRef[];
  codeBlocks: CodeBlock[];
  fields: FieldSpec[];
  callouts: Callout[];
  line: number;
  file: string;
};

export type Procedure = {
  index: number;
  /** Nearest preceding markdown heading, for disambiguating multi-procedure pages. */
  heading: string | null;
  /**
   * How the procedure was written. `steps` is the style-guide form; `ordered-list` covers
   * the 43 files under docs/documentation that use bare numbered lists; `prose` covers
   * pages like folder.mdx that describe actions in running text.
   */
  kind: "steps" | "ordered-list" | "prose";
  steps: GuideStep[];
  line: number;
};

/**
 * A region deliberately not extracted. Reported as explicitly unverified rather than
 * dropped, so a guide whose API tab or third-party setup we skipped never reads as
 * fully passing.
 */
export type UnverifiedRegion = {
  reason: string;
  tab: string | null;
  line: number;
};

export type GuideDoc = {
  /** Repo-relative, e.g. `docs/documentation/platform/folder.mdx`. */
  guide: string;
  title: string;
  description: string | null;
  frontmatter: Record<string, unknown>;
  /** Which `<Tab>` the procedures came from, or null when the page has no tabs. */
  tab: string | null;
  availableTabs: string[];
  procedures: Procedure[];
  unverified: UnverifiedRegion[];
  /** Every image in the file, including ones outside any procedure. Drives the linter. */
  allImages: ImageRef[];
  /** sha256 over the normalized doc. The gate for plan staleness. */
  contentHash: string;
};

// ---------------------------------------------------------------------------
// L2: GuidePlan
// ---------------------------------------------------------------------------

export type Action =
  | { kind: "navigate"; path: string[]; sourceQuote: SourceQuote }
  | { kind: "click"; target: string; role: string | null; sourceQuote: SourceQuote }
  | { kind: "fill"; field: string; value: string; sourceQuote: SourceQuote }
  | { kind: "select"; field: string; option: string; sourceQuote: SourceQuote }
  | { kind: "expect_visible"; text: string; sourceQuote: SourceQuote }
  | { kind: "expect_screenshot"; docImage: string; sourceQuote: SourceQuote }
  | { kind: "external"; reason: string; sourceQuote: SourceQuote };

export type ActionKind = Action["kind"];

export type PlanStep = {
  procedureIndex: number;
  docStepIndex: number;
  /** The instruction as a reader would understand it, for the agent and the dashboard. */
  instruction: string;
  actions: Action[];
};

export type GuidePlan = {
  guide: string;
  /** Must equal the live GuideDoc.contentHash or the plan is stale and CI fails. */
  guideDocHash: string;
  compiledAt: string;
  model: string;
  steps: PlanStep[];
};

// ---------------------------------------------------------------------------
// L5: findings
// ---------------------------------------------------------------------------

export type Severity =
  | "BLOCKER"
  | "MISMATCH"
  | "STALE_SCREENSHOT"
  | "MISSING_STEP"
  | "EXTRA_STEP";

/**
 * Which side is wrong. This is the distinction that makes the check trustworthy:
 * DOC_DRIFT earns a docs suggestion, APP_REGRESSION is a bug report against the app,
 * and HARNESS should never reach the PR author at all.
 */
export type Blame = "DOC_DRIFT" | "APP_REGRESSION" | "HARNESS";

export type Suggestion = {
  file: string;
  line: number;
  before: string;
  after: string;
};

export type Finding = {
  severity: Severity;
  blame: Blame;
  guide: string;
  procedureIndex: number;
  stepIndex: number;
  summary: string;
  /** What the guide told the reader to expect. */
  docSays: string;
  /** What the running app actually presented. */
  appShows: string;
  sourceQuote: SourceQuote;
  suggestion: Suggestion | null;
  /**
   * Where in the frontend the change that caused this drift lives, when the run had a diff to
   * look in. Used to put the warning on the line the author is already editing, because on a
   * frontend pull request the stale docs line is not in the diff and GitHub will not accept a
   * comment there.
   */
  frontendAnchor: { file: string; line: number; reasoning: string } | null;
  evidence: {
    liveScreenshot?: string;
    docScreenshot?: string;
    ariaExcerpt?: string;
  };
};

// ---------------------------------------------------------------------------
// Run results
// ---------------------------------------------------------------------------

export type StepOutcome = "passed" | "failed" | "skipped" | "unverified";

export type StepResult = {
  procedureIndex: number;
  docStepIndex: number;
  instruction: string;
  outcome: StepOutcome;
  /** Which layer actually satisfied the step, for cost and trust accounting. */
  resolvedBy: "replay" | "agent" | "skipped";
  toolCalls: number;
  durationMs: number;
  findings: Finding[];
  /** Locators the agent resolved, serialized into resolved/<guide>.spec.ts on success. */
  resolvedLocators: ResolvedLocator[];
};

export type ResolvedLocator = {
  action: ActionKind;
  role: string | null;
  name: string | null;
  value: string | null;
  /**
   * Set only when the control the agent clicked had no accessible name, in which case `name` is
   * null and this description is the whole address. Optional so every recording written before it
   * existed still parses.
   */
  unlabelled?: { role: string; icon: string | null; near: string | null };
};

export type RunResult = {
  guide: string;
  startedAt: string;
  finishedAt: string;
  baseUrl: string;
  mode: "replay" | "agent" | "mixed";
  steps: StepResult[];
  findings: Finding[];
  unverified: UnverifiedRegion[];
};

// ---------------------------------------------------------------------------
// Registry (the "docs-test SDK")
// ---------------------------------------------------------------------------

export type GuideRegistryEntry = {
  /** Repo-relative path to the .mdx under test. */
  guide: string;
  fixture: string;
  /**
   * Globs over source paths. A PR touching any of them selects this guide.
   * Deterministic: no model decides what gets tested.
   */
  watch: string[];
  /** When true a BLOCKER may fail the job. Everything starts false and earns this. */
  critical: boolean;
  tab: string | null;
  skipSteps: number[];
  /** Whether the guide needs an enterprise license to be walkable at all. */
  requiresLicense: boolean;
  notes: string | null;
};
