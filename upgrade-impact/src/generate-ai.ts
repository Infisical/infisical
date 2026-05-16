import path from "node:path";

import { Agent, run, tool } from "@openai/agents";
import { z } from "zod";

import { ReleaseEvidenceBundle } from "./evidence.js";
import { runGit } from "./git.js";
import { Evidence, ImpactEntry, ImpactEntrySchema } from "./schema.js";

export const MODEL = "gpt-5.4";

const GeneratedDraftSchema = z.object({
  impactLevel: z.enum(["none", "low", "medium", "high"]),
  summary: z.string().min(1),
  requiresDbMigration: z.boolean(),
  breakingChanges: z.array(ImpactEntrySchema),
  dbSchemaChanges: z.array(ImpactEntrySchema),
  configChanges: z.array(ImpactEntrySchema),
  deploymentNotes: z.array(ImpactEntrySchema),
  knownIssues: z.array(ImpactEntrySchema)
});

export type GeneratedDraft = z.infer<typeof GeneratedDraftSchema>;

const agenticLimits = {
  maxToolCalls: 45,
  maxDiffCharsPerFile: 20000,
  maxFileChars: 20000,
  maxTotalToolResultChars: 220000,
  maxCompletionTokens: 5000,
  maxTurns: 20
};

const evidenceForFile = (file: string, description?: string) => ({
  type: "file" as const,
  ref: file,
  path: file,
  description
});

export const deterministicDraft = (bundle: ReleaseEvidenceBundle): GeneratedDraft => {
  const dbSchemaChanges: GeneratedDraft["dbSchemaChanges"] = [];
  const configChanges: GeneratedDraft["configChanges"] = [];
  const deploymentNotes: GeneratedDraft["deploymentNotes"] = [];

  if (bundle.migrationFiles.length > 0) {
    dbSchemaChanges.push({
      title: "Database schema migrations are included",
      description: `This release adds ${bundle.migrationFiles.length} database migration file(s). Self-hosted instances should expect the application to run migrations during startup.`,
      action: "Back up the database before upgrading and monitor startup logs until migrations complete.",
      confidence: "high",
      evidence: bundle.migrationFiles.map((file) => evidenceForFile(file, "Added migration file"))
    });
  }

  if (bundle.configFiles.length > 0) {
    configChanges.push({
      title: "Configuration-related files changed",
      description: "This release changes application configuration code that may affect self-hosted deployments.",
      action: "Review the linked configuration changes before upgrading.",
      confidence: "medium",
      evidence: bundle.configFiles.map((file) => evidenceForFile(file, "Configuration-related file changed"))
    });
  }

  if (bundle.deploymentFiles.length > 0 || bundle.selfHostingDocs.length > 0) {
    deploymentNotes.push({
      title: "Deployment-related files changed",
      description: "This release updates deployment or self-hosting documentation files.",
      action: "Review deployment configuration and self-hosting documentation before upgrading.",
      confidence: "medium",
      evidence: [...bundle.deploymentFiles, ...bundle.selfHostingDocs].map((file) =>
        evidenceForFile(file, "Deployment or self-hosting file changed")
      )
    });
  }

  let impactLevel: GeneratedDraft["impactLevel"] = "none";

  if (deploymentNotes.length > 0) {
    impactLevel = "low";
  }

  if (dbSchemaChanges.length > 0 || configChanges.length > 0) {
    impactLevel = "medium";
  }

  let summary = "No self-hosted upgrade impact was detected from deterministic release signals.";

  if (impactLevel !== "none") {
    summary = "Self-hosted upgrade impact was detected from deterministic release signals.";
  }

  return {
    impactLevel,
    summary,
    requiresDbMigration: bundle.migrationFiles.length > 0,
    breakingChanges: [],
    dbSchemaChanges,
    configChanges,
    deploymentNotes,
    knownIssues: []
  };
};

const PROMPT_RULES = `You are generating Infisical self-hosted upgrade impact data.

Only include changes that may affect self-hosted customers upgrading Infisical. Focus on breaking changes, database migrations, environment variables, Docker, Helm, Kubernetes, deployment behavior, startup/runtime requirements, manual actions, and known upgrade issues.

Do not include ordinary product features unless they create a self-hosted upgrade action. Every entry must include evidence. If there is no meaningful self-hosted impact, return empty arrays and impactLevel "none".

Write for a busy self-hosted operator deciding whether and how to upgrade:
- Be concise, direct, and action-oriented.
- Lead with what changes for the operator, not how you discovered it.
- Use active voice and simple verbs.
- Do not say "the release", "this release", "code changes indicate", "evidence bundle", "identified", or "detected".
- Do not mention that no Docker, Helm, Kubernetes, or database changes exist unless that absence changes the upgrade action.
- Do not duplicate the same risk across breakingChanges, configChanges, deploymentNotes, and knownIssues. Pick one category.
- Do not include the same evidence item twice in one entry.
- Do not repeat a release note or PR URL across multiple entries when a more specific file diff can support the claim.
- Before finalizing, audit the JSON for duplicate titles, duplicate descriptions, and duplicate evidence.
- Every entry title must clearly name the affected product area, for example "PAM domains migration", "PKI certificate metadata", "Kubernetes auth TLS setting", "SMTP HELO hostname", or "Platform startup migration".
- Only write an action when there is a specific operator task. If there is no manual task, write "No manual action required; Infisical runs this migration during startup."
- For additive database migrations, prefer "No manual action required; Infisical runs this migration during startup." Do not tell users to run migrations manually unless the diff proves they must.
- If a migration failure is the only risk, say "If startup fails during migration, keep the previous version running and inspect migration logs before retrying."
- Do not say "run migrations before serving traffic", "verify migration jobs complete", "account for", or "review X if you rely on Y".
- Do not tell operators to change proxy, Helm, Docker, or environment configuration unless the diff introduces a required setting or changes a default that existing deployments must respond to.
- Optional security-hardening settings such as TRUSTED_PROXY_CIDRS are not upgrade actions when unset preserves legacy behavior.
- Do not tell API automation owners to update payloads when the service layer provides backwards-compatible defaults or auto-promotion.
- For optional environment variables, nullable columns, or additive feature tables, include an entry only when existing deployments may need a decision; otherwise omit it or state that no manual action is required.
- Before using breakingChanges, inspect whether existing records or configs are backfilled or compatibility-preserved. If compatibility exists, do not mark it breaking.
- Use breakingChanges for changes that can make existing auth, API, startup, database, or integrations fail after upgrade.
- Use deploymentNotes only when deployment files, self-hosting docs, Docker, Helm, Kubernetes manifests, startup/runtime, or rollout behavior changed.
- Use configChanges only for environment variables, config files, defaults, or settings that operators must update.
- Use knownIssues only for confirmed bugs or documented upgrade failures, not inferred risks.
- Prefer one strong entry over several overlapping entries.
- Keep summary to 35 words or fewer.
- Keep titles to 9 words or fewer.
- Keep descriptions to 45 words or fewer.
- Keep actions to 35 words or fewer.
- Use at most 4 evidence items per entry.
- Keep evidence descriptions to 12 words or fewer. Omit them when the ref is clear.
- Use one or two sentences per field. No preambles.

Return only JSON matching this TypeScript shape:
{
  "impactLevel": "none" | "low" | "medium" | "high",
  "summary": "string",
  "requiresDbMigration": boolean,
  "breakingChanges": ImpactEntry[],
  "dbSchemaChanges": ImpactEntry[],
  "configChanges": ImpactEntry[],
  "deploymentNotes": ImpactEntry[],
  "knownIssues": ImpactEntry[]
}

ImpactEntry:
{
  "title": "string",
  "description": "string",
  "action": "string",
  "confidence": "low" | "medium" | "high",
  "evidence": Evidence[]
}

Evidence:
{
  "type": "commit" | "file" | "pr" | "release" | "url",
  "ref": "string",
  "url": "required for pr, release, url evidence",
  "path": "required for file evidence",
  "description": "optional string"
}

Evidence rules:
- Use type "file" for repository file paths and include path. Do not include url for file evidence.
- For type "file", set ref to the same repository path as path.
- Use type "pr", "release", or "url" only when url is a complete absolute https:// URL.
- Do not use Markdown links, Slack links, relative URLs, commit ranges, or bare PR numbers in url fields.
- Prefer file evidence when you are not certain of the exact absolute URL.
`;

const normalizeDraft = (draft: GeneratedDraft): GeneratedDraft => {
  const evidenceKey = (evidence: Evidence) =>
    [evidence.type, evidence.ref, evidence.path ?? "", evidence.url ?? ""].join("\u0000");

  const dedupeEvidence = (evidenceItems: Evidence[]) => {
    const seen = new Set<string>();

    return evidenceItems.filter((evidence) => {
      const key = evidenceKey(evidence);
      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
  };

  const entryKey = (entry: ImpactEntry) =>
    [entry.title.trim().toLowerCase(), entry.description.trim().toLowerCase()].join("\u0000");

  const normalizeEntries = (entries: ImpactEntry[]) =>
    entries
      .map((entry) => ({
        ...entry,
        evidence: dedupeEvidence(
          entry.evidence.map((evidence) =>
            evidence.type === "file" && evidence.path ? { ...evidence, ref: evidence.path } : evidence
          )
        )
      }))
      .filter((entry, index, normalizedEntries) => {
        const key = entryKey(entry);
        return normalizedEntries.findIndex((candidate) => entryKey(candidate) === key) === index;
      });

  return {
    ...draft,
    breakingChanges: normalizeEntries(draft.breakingChanges),
    dbSchemaChanges: normalizeEntries(draft.dbSchemaChanges),
    configChanges: normalizeEntries(draft.configChanges),
    deploymentNotes: normalizeEntries(draft.deploymentNotes),
    knownIssues: normalizeEntries(draft.knownIssues)
  };
};

const truncateText = (value: string, maxChars: number) => {
  if (value.length <= maxChars) {
    return { value, truncated: false };
  }

  return { value: value.slice(0, maxChars), truncated: true };
};

type BundleIndex = {
  changedFiles: Set<string>;
  addedFiles: Set<string>;
  migrationFiles: Set<string>;
  configFiles: Set<string>;
  deploymentFiles: Set<string>;
  selfHostingDocs: Set<string>;
};

const indexBundle = (bundle: ReleaseEvidenceBundle): BundleIndex => ({
  changedFiles: new Set(bundle.changedFiles),
  addedFiles: new Set(bundle.addedFiles),
  migrationFiles: new Set(bundle.migrationFiles),
  configFiles: new Set(bundle.configFiles),
  deploymentFiles: new Set(bundle.deploymentFiles),
  selfHostingDocs: new Set(bundle.selfHostingDocs)
});

const isSafeChangedPath = (file: string, index: BundleIndex) =>
  !path.isAbsolute(file) &&
  !file.split(/[\\/]/).includes("..") &&
  (index.changedFiles.has(file) || index.addedFiles.has(file));

const FILE_CATEGORIES = [
  "migration",
  "config",
  "deployment",
  "selfHostingDocs",
  "backendService",
  "api",
  "frontend",
  "docs",
  "other"
] as const;

type FileCategory = (typeof FILE_CATEGORIES)[number];

const categorizeChangedFile = (file: string, index: BundleIndex): FileCategory => {
  if (index.migrationFiles.has(file)) return "migration";
  if (index.configFiles.has(file)) return "config";
  if (index.deploymentFiles.has(file)) return "deployment";
  if (index.selfHostingDocs.has(file)) return "selfHostingDocs";
  if (file.startsWith("backend/src/services/") || file.startsWith("backend/src/ee/services/")) return "backendService";
  if (file.startsWith("backend/src/server/") || file.startsWith("backend/src/ee/routes/")) return "api";
  if (file.startsWith("frontend/")) return "frontend";
  if (file.startsWith("docs/")) return "docs";
  return "other";
};

const buildReleaseMap = (bundle: ReleaseEvidenceBundle, index: BundleIndex) => {
  const filesByCategory = bundle.changedFiles.reduce<Record<string, string[]>>((acc, file) => {
    const category = categorizeChangedFile(file, index);
    acc[category] = [...(acc[category] ?? []), file];
    return acc;
  }, {});

  return {
    tag: bundle.tag,
    previousTag: bundle.previousTag,
    release: bundle.release,
    counts: {
      changedFiles: bundle.changedFiles.length,
      addedFiles: bundle.addedFiles.length,
      commits: bundle.commits.length,
      pullRequests: bundle.pullRequests.length
    },
    highSignalFiles: {
      migrationFiles: bundle.migrationFiles,
      configFiles: bundle.configFiles,
      deploymentFiles: bundle.deploymentFiles,
      selfHostingDocs: bundle.selfHostingDocs
    },
    filesByCategory,
    commits: bundle.commits,
    pullRequests: bundle.pullRequests.map((pr) => ({
      number: pr.number,
      title: pr.title,
      url: pr.url,
      labels: pr.labels,
      body: pr.body
    }))
  };
};

const buildAgenticPrompt = (bundle: ReleaseEvidenceBundle, index: BundleIndex) => `${PROMPT_RULES}
Tool-use workflow:
- Start from the release map, then inspect only changed files that may affect self-hosted upgrades.
- Use list_changed_files to orient yourself.
- Use get_file_diff before making claims about env vars, migrations, Docker, Helm, Kubernetes, startup/runtime behavior, auth, integrations, queues, workers, or database behavior.
- When reading diffs, distinguish added/removed lines from unchanged context. Do not describe unchanged context as new behavior.
- Use get_file_at_ref only when the diff is too narrow and the surrounding file context matters.
- Before finalizing, inspect representative diffs from every non-empty high-signal bucket: migrationFiles, configFiles, deploymentFiles, and selfHostingDocs.
- In deploymentFiles, prioritize Dockerfile*, .nvmrc, backend/package.json, Helm values, and Helm templates.
- Include runtime/build notes for Node version, base image, package engine, Dockerfile, or Helm default changes when operators with custom images, charts, or manifests may need action.
- Do not inspect frontend-only files unless PR text or release notes connect them to deployment, auth, or self-hosted operation.
- Stop inspecting once you have enough evidence for concise operator-facing entries.
- Return final JSON only after tool use is complete.

Release map:
${JSON.stringify(buildReleaseMap(bundle, index), null, 2)}
`;

export const generateWithOpenAiAgentic = async (bundle: ReleaseEvidenceBundle): Promise<GeneratedDraft> => {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required for agentic generation");
  }

  if (!bundle.previousTag) {
    throw new Error("Agentic generation requires a previous stable tag");
  }

  const index = indexBundle(bundle);
  const toolState = { calls: 0, resultChars: 0 };

  const recordToolResult = (result: unknown) => {
    const json = JSON.stringify(result);
    const remainingChars = agenticLimits.maxTotalToolResultChars - toolState.resultChars;

    if (remainingChars <= 0) {
      return { error: `Total tool result character limit reached (${agenticLimits.maxTotalToolResultChars})` };
    }

    const truncated = truncateText(json, remainingChars);
    toolState.resultChars += truncated.value.length;
    return truncated.truncated
      ? { truncatedByTotalToolBudget: true, partialResultJson: truncated.value }
      : result;
  };

  const recordToolCall = () => {
    if (toolState.calls >= agenticLimits.maxToolCalls) {
      return { error: `Tool call limit reached (${agenticLimits.maxToolCalls})` };
    }

    toolState.calls += 1;
    return null;
  };

  const listChangedFiles = tool({
    name: "list_changed_files",
    description: "List changed files in this release, optionally filtered by category.",
    parameters: z.object({
      category: z.enum(FILE_CATEGORIES).nullable()
    }),
    async execute({ category }) {
      const limitError = recordToolCall();
      if (limitError) {
        return limitError;
      }

      const files = bundle.changedFiles.map((file) => ({
        file,
        added: index.addedFiles.has(file),
        category: categorizeChangedFile(file, index)
      }));

      return recordToolResult({
        files: category ? files.filter((file) => file.category === category) : files
      });
    }
  });

  const getFileDiff = tool({
    name: "get_file_diff",
    description:
      "Return a capped git diff for a changed file in this release. Use this before making claims about file-level behavior.",
    parameters: z.object({
      file: z.string(),
      contextLines: z.number().min(0).max(120).nullable()
    }),
    async execute({ file, contextLines }) {
      const limitError = recordToolCall();
      if (limitError) {
        return limitError;
      }

      if (!isSafeChangedPath(file, index)) {
        return { error: `File is not in changed file set: ${file}` };
      }

      const diff = runGit([
        "diff",
        `--unified=${contextLines ?? 40}`,
        `${bundle.previousTag}..${bundle.tag}`,
        "--",
        file
      ]);
      const truncated = truncateText(diff, agenticLimits.maxDiffCharsPerFile);

      return recordToolResult({
        file,
        from: bundle.previousTag,
        to: bundle.tag,
        category: categorizeChangedFile(file, index),
        truncated: truncated.truncated,
        diff: truncated.value
      });
    }
  });

  const getFileAtRef = tool({
    name: "get_file_at_ref",
    description: "Return capped file contents for a changed file at the previous or current tag.",
    parameters: z.object({
      file: z.string(),
      ref: z.enum(["previous", "current"])
    }),
    async execute({ file, ref: refName }) {
      const limitError = recordToolCall();
      if (limitError) {
        return limitError;
      }

      const ref = refName === "previous" ? bundle.previousTag : bundle.tag;

      if (!ref) {
        return { error: "Missing git ref" };
      }

      if (!isSafeChangedPath(file, index)) {
        return { error: `File is not in changed file set: ${file}` };
      }

      try {
        const content = runGit(["show", `${ref}:${file}`]);
        const truncated = truncateText(content, agenticLimits.maxFileChars);

        return recordToolResult({
          file,
          ref,
          truncated: truncated.truncated,
          content: truncated.value
        });
      } catch (error) {
        return { error: `Could not read ${file} at ${ref}: ${(error as Error).message}` };
      }
    }
  });

  const getPullRequest = tool({
    name: "get_pull_request",
    description: "Return release-collected metadata for a pull request that is part of this release.",
    parameters: z.object({
      number: z.number()
    }),
    async execute({ number }) {
      const limitError = recordToolCall();
      if (limitError) {
        return limitError;
      }

      const pr = bundle.pullRequests.find((candidate) => candidate.number === number);

      if (!pr) {
        return { error: `PR #${number} is not in this release evidence` };
      }

      return recordToolResult(pr);
    }
  });

  const agent = new Agent({
    name: "Infisical upgrade impact analyst",
    instructions: buildAgenticPrompt(bundle, index),
    model: MODEL,
    modelSettings: {
      temperature: 0.2,
      maxTokens: agenticLimits.maxCompletionTokens,
      toolChoice: "auto",
      parallelToolCalls: false
    },
    outputType: GeneratedDraftSchema,
    tools: [listChangedFiles, getFileDiff, getFileAtRef, getPullRequest]
  });

  const result = await run(agent, "Generate the self-hosted upgrade impact JSON for this release.", {
    maxTurns: agenticLimits.maxTurns
  });

  if (!result.finalOutput) {
    throw new Error("OpenAI returned no final output");
  }

  const usageTotals = result.rawResponses.reduce(
    (totals, response) => ({
      inputTokens: totals.inputTokens + response.usage.inputTokens,
      outputTokens: totals.outputTokens + response.usage.outputTokens
    }),
    { inputTokens: 0, outputTokens: 0 }
  );

  process.stderr.write(
    `Agentic generation used ${toolState.calls} tool call(s), ${toolState.resultChars} tool result chars, ${usageTotals.inputTokens} input token(s), and ${usageTotals.outputTokens} output token(s).\n`
  );

  return normalizeDraft(GeneratedDraftSchema.parse(result.finalOutput));
};
