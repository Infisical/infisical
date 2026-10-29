import type { Resource } from "../../secrets-model";

export type CommitResourceChange = {
  resourceType: "secret" | "folder";
  action: "create" | "update" | "delete";
  name: string;
  before?: Resource;
  after?: Resource;
};

export type LocalCommit = {
  id: string;
  project: string;
  environment: string;
  path: string;
  message: string;
  actor: string;
  createdAt: string;
  changes: CommitResourceChange[];
  actorType?: "user" | "identity" | "platform";
};

export type CommitSummary = {
  secretCount: number;
  folderCount: number;
  addedCount: number;
  updatedCount: number;
  deletedCount: number;
};

export type CommitScope = { project: string; environment: string; path: string };

export type RollbackFolder = { path: string; changes: CommitResourceChange[] };

type Tracked = Extract<Resource, { kind: "secret" | "folder" }>;

export const LOCAL_ACTOR = "Avery Chen";

const isTracked = (resource: Resource): resource is Tracked =>
  resource.kind === "secret" || resource.kind === "folder";

const sameSlot = (a: Resource, b: Resource) =>
  a.kind === b.kind &&
  a.project === b.project &&
  a.environment === b.environment &&
  a.path === b.path &&
  a.name === b.name;

const childPath = (path: string, name: string) => `${path === "/" ? "" : path}/${name}`;

export const isWithin = (path: string, root: string, deep: boolean) => {
  if (path === root) return true;
  if (!deep) return false;
  return root === "/" || path.startsWith(`${root}/`);
};

export const inScope = (commit: LocalCommit, scope: CommitScope) =>
  commit.project === scope.project &&
  commit.environment === scope.environment &&
  commit.path === scope.path;

export const summarizeChanges = (changes: readonly CommitResourceChange[]): CommitSummary =>
  changes.reduce(
    (acc, change) => {
      if (change.resourceType === "secret") acc.secretCount += 1;
      else acc.folderCount += 1;
      if (change.action === "create") acc.addedCount += 1;
      else if (change.action === "update") acc.updatedCount += 1;
      else acc.deletedCount += 1;
      return acc;
    },
    { secretCount: 0, folderCount: 0, addedCount: 0, updatedCount: 0, deletedCount: 0 }
  );

const signature = (resource: Tracked) =>
  resource.kind === "folder"
    ? JSON.stringify([resource.name, resource.description])
    : JSON.stringify([
        resource.name,
        resource.value,
        resource.comment,
        [...resource.tags].sort(),
        resource.metadata,
        Boolean(resource.skipMultilineEncoding)
      ]);

const undoChange = (state: Resource[], change: CommitResourceChange) => {
  const { before, after } = change;
  const without = after
    ? state.filter((resource) => resource.id !== after.id && !sameSlot(resource, after))
    : state;
  if (!before) return without;
  return [...without.filter((resource) => !sameSlot(resource, before)), before];
};

const undoCommit = (state: Resource[], commit: LocalCommit) =>
  [...commit.changes].reverse().reduce(undoChange, state);

const chronological = (commits: readonly LocalCommit[]) =>
  commits
    .map((commit, index) => ({ commit, index }))
    .sort((a, b) => a.commit.createdAt.localeCompare(b.commit.createdAt) || a.index - b.index)
    .map(({ commit }) => commit);

const scopeHistory = (commits: readonly LocalCommit[], commit: LocalCommit) =>
  chronological(commits.filter((candidate) => inScope(candidate, commit)));

export const isFirstCommit = (commits: readonly LocalCommit[], commit: LocalCommit) =>
  scopeHistory(commits, commit)[0]?.id === commit.id;

export const isLatestCommit = (commits: readonly LocalCommit[], commit: LocalCommit) =>
  scopeHistory(commits, commit).at(-1)?.id === commit.id;

const trackedAt = (resources: readonly Resource[], scope: CommitScope, path: string) =>
  resources.filter(
    (resource): resource is Tracked =>
      isTracked(resource) &&
      resource.project === scope.project &&
      resource.environment === scope.environment &&
      resource.path === path
  );

export const diffState = (
  current: readonly Resource[],
  target: readonly Resource[],
  scope: CommitScope,
  path: string
): CommitResourceChange[] => {
  const now = trackedAt(current, scope, path);
  const then = trackedAt(target, scope, path);
  const changes: CommitResourceChange[] = [];
  then.forEach((after) => {
    const before = now.find((resource) => sameSlot(resource, after));
    if (!before)
      changes.push({ resourceType: after.kind, action: "create", name: after.name, after });
    else if (signature(before) !== signature(after))
      changes.push({ resourceType: after.kind, action: "update", name: after.name, before, after });
  });
  now.forEach((before) => {
    if (!then.some((resource) => sameSlot(resource, before)))
      changes.push({ resourceType: before.kind, action: "delete", name: before.name, before });
  });
  return changes;
};

const replaceTrackedAt = (
  current: readonly Resource[],
  target: readonly Resource[],
  scope: CommitScope,
  paths: readonly string[]
) => {
  const touched = (resource: Resource) =>
    isTracked(resource) &&
    resource.project === scope.project &&
    resource.environment === scope.environment &&
    paths.includes(resource.path);
  return [...current.filter((resource) => !touched(resource)), ...target.filter(touched)];
};

export const revertState = (current: readonly Resource[], commit: LocalCommit) => {
  const target = undoCommit([...current], commit);
  return {
    resources: replaceTrackedAt(current, target, commit, [commit.path]),
    changes: diffState(current, target, commit, commit.path)
  };
};

const knownPaths = (resources: readonly Resource[], scope: CommitScope) =>
  resources
    .filter(
      (resource) =>
        isTracked(resource) &&
        resource.project === scope.project &&
        resource.environment === scope.environment
    )
    .flatMap((resource) =>
      resource.kind === "folder"
        ? [resource.path, childPath(resource.path, resource.name)]
        : [resource.path]
    );

export const rollbackState = (
  commits: readonly LocalCommit[],
  commit: LocalCommit,
  current: readonly Resource[],
  deep: boolean
) => {
  const ordered = chronological(
    commits.filter(
      (candidate) =>
        candidate.project === commit.project &&
        candidate.environment === commit.environment &&
        isWithin(candidate.path, commit.path, deep)
    )
  );
  const cutoff = ordered.findIndex((candidate) => candidate.id === commit.id);
  const later = cutoff < 0 ? [] : ordered.slice(cutoff + 1);
  const target = [...later].reverse().reduce(undoCommit, [...current]);
  const nested = [...new Set(knownPaths([...current, ...target], commit))]
    .filter((path) => path !== commit.path && isWithin(path, commit.path, deep))
    .sort();
  const paths = [commit.path, ...nested];
  return {
    resources: replaceTrackedAt(current, target, commit, paths),
    folders: paths.map((path): RollbackFolder => ({
      path,
      changes: diffState(current, target, commit, path)
    }))
  };
};

const hex = (input: string, length: number) => {
  let out = "";
  let seed = 5381;
  while (out.length < length) {
    for (let index = 0; index < input.length; index += 1) {
      seed = (seed * 33 + input.charCodeAt(index) + out.length) % 2147483647;
    }
    for (let round = 0; round < 4; round += 1) seed = (seed * 48271) % 2147483647;
    out += seed.toString(16).padStart(8, "0");
  }
  return out.slice(0, length);
};

export const commitId = (key: string) => {
  const raw = hex(key, 32);
  return [
    raw.slice(0, 8),
    raw.slice(8, 12),
    raw.slice(12, 16),
    raw.slice(16, 20),
    raw.slice(20)
  ].join("-");
};

export const newCommitId = () => commitId(`local:${Date.now()}:${Math.random()}`);

type SecretPatch = { name?: string; value?: string; comment?: string; tags?: string[] };
type FolderPatch = { name?: string; description?: string };
type SeedRemoved =
  | { kind: "secret"; name: string; value: string }
  | { kind: "folder"; name: string; description?: string };
type SeedStep = {
  at: string;
  message: string;
  actor: string;
  actorType?: LocalCommit["actorType"];
  create?: string[];
  update?: [string, SecretPatch | FolderPatch][];
  remove?: SeedRemoved[];
  createAll?: boolean;
};

const AVERY = "Avery Chen";
const JORDAN = "Jordan Lee";
const CI = "ci-deployer";
const PLATFORM = { actor: "Platform", actorType: "platform" as const };
const IDENTITY = { actor: CI, actorType: "identity" as const };
const at = (day: number, time: string) => `2026-10-${day}T${time}:00Z`;

const seedScripts: Record<string, SeedStep[]> = {
  "payments-api:dev:/": [
    {
      at: at(22, "12:06"),
      message: "Point DATABASE_URL at secret references",
      actor: AVERY,
      update: [
        [
          "secret:DATABASE_URL",
          { value: "postgres://fake-user:fake-password@db.dev.example.test:5432/payments" }
        ]
      ]
    },
    {
      at: at(22, "10:15"),
      message: "Document when to raise LOG_LEVEL",
      actor: AVERY,
      update: [["secret:LOG_LEVEL", { comment: "" }]]
    },
    {
      at: at(22, "09:30"),
      message: "Rotated app database credentials",
      ...PLATFORM,
      update: [
        ["secret:APP_DB_PASSWORD", { value: "fake-app-db-password-previous" }],
        ["secret:APP_DB_USERNAME", { value: "fake-app-db-username-previous" }]
      ]
    },
    {
      at: at(21, "18:05"),
      message: "Remove legacy webhook URL",
      actor: JORDAN,
      remove: [
        {
          kind: "secret",
          name: "LEGACY_WEBHOOK_URL",
          value: "https://hooks.dev.example.test/legacy"
        }
      ]
    },
    {
      at: at(21, "16:40"),
      message: "Move database to the shared dev host",
      ...IDENTITY,
      update: [
        [
          "secret:DATABASE_URL",
          { value: "postgres://fake-user:fake-password@localhost:5432/payments" }
        ]
      ]
    },
    {
      at: at(21, "14:20"),
      message: "Tag feature flags as config",
      actor: AVERY,
      update: [["secret:FEATURE_FLAGS", { tags: [] }]]
    },
    {
      at: at(21, "11:00"),
      message: "Add workers folder and queue cache",
      actor: JORDAN,
      create: ["folder:workers", "secret:REDIS_URL"]
    },
    {
      at: at(20, "17:45"),
      message: "Rename STRIPE_KEY to STRIPE_SECRET_KEY",
      actor: AVERY,
      update: [["secret:STRIPE_SECRET_KEY", { name: "STRIPE_KEY" }]]
    },
    {
      at: at(20, "15:10"),
      message: "",
      actor: JORDAN,
      create: ["secret:STRIPE_KEY", "secret:STRIPE_WEBHOOK_SECRET"]
    },
    {
      at: at(20, "12:30"),
      message: "Add JWT signing key",
      actor: AVERY,
      create: ["secret:JWT_SIGNING_KEY"]
    },
    {
      at: at(20, "10:05"),
      message: "Add app database credentials",
      actor: JORDAN,
      create: ["secret:APP_DB_USERNAME", "secret:APP_DB_PASSWORD"]
    },
    {
      at: at(20, "09:00"),
      message: "Initial payments configuration",
      actor: JORDAN,
      createAll: true
    }
  ],
  "payments-api:staging:/": [
    {
      at: at(22, "11:40"),
      message: "Clear webhook secret until the staging endpoint is live",
      actor: AVERY,
      update: [
        ["secret:STRIPE_WEBHOOK_SECRET", { value: "fake-stripe-webhook-secret-staging-old" }]
      ]
    },
    {
      at: at(22, "08:20"),
      message: "Sync feature flags from the release pipeline",
      ...IDENTITY,
      update: [["secret:FEATURE_FLAGS", { value: "fake-feature-flags-staging-previous", tags: [] }]]
    },
    {
      at: at(21, "17:30"),
      message: "Add workers folder",
      actor: JORDAN,
      create: ["folder:workers", "secret:REDIS_URL"]
    },
    {
      at: at(21, "13:15"),
      message: "Raise staging log verbosity",
      actor: AVERY,
      update: [["secret:LOG_LEVEL", { value: "fake-log-level-staging-previous", comment: "" }]]
    },
    {
      at: at(21, "09:50"),
      message: "Remove deprecated SESSION_TTL",
      actor: JORDAN,
      remove: [{ kind: "secret", name: "SESSION_TTL", value: "3600" }]
    },
    {
      at: at(20, "16:00"),
      message: "Add JWT signing key",
      actor: AVERY,
      create: ["secret:JWT_SIGNING_KEY"]
    },
    {
      at: at(20, "14:25"),
      message: "Update staging API base URL",
      actor: JORDAN,
      update: [["secret:API_BASE_URL", { value: "https://api.staging-old.example.test" }]]
    },
    {
      at: at(20, "11:10"),
      message: "",
      ...IDENTITY,
      create: ["secret:CURRENCY_ALLOWLIST", "secret:STRIPE_WEBHOOK_SECRET"]
    },
    {
      at: at(20, "09:20"),
      message: "Initial staging configuration",
      actor: JORDAN,
      createAll: true
    }
  ],
  "payments-api:prod:/": [
    {
      at: at(22, "13:30"),
      message: "Rotate Stripe secret key",
      actor: AVERY,
      update: [["secret:STRIPE_SECRET_KEY", { value: "fake-stripe-secret-key-prod-previous" }]]
    },
    {
      at: at(22, "09:05"),
      message: "Remove workers folder from production",
      actor: JORDAN,
      remove: [{ kind: "folder", name: "workers" }]
    },
    {
      at: at(21, "20:10"),
      message: "Created 2 secrets",
      ...PLATFORM,
      create: ["secret:AWS_ACCESS_KEY_ID_LEGACY", "secret:AWS_SECRET_ACCESS_KEY_LEGACY"]
    },
    {
      at: at(21, "15:45"),
      message: "Promote feature flags from staging",
      ...IDENTITY,
      update: [["secret:FEATURE_FLAGS", { value: "fake-feature-flags-prod-previous", tags: [] }]]
    },
    {
      at: at(21, "10:30"),
      message: "Add Sentry DSN",
      actor: AVERY,
      create: ["secret:SENTRY_DSN"]
    },
    {
      at: at(20, "19:00"),
      message: "Clear api folder description",
      actor: JORDAN,
      update: [["folder:api", { description: "Public API configuration" }]]
    },
    {
      at: at(20, "17:20"),
      message: "Lower production log level",
      actor: AVERY,
      update: [["secret:LOG_LEVEL", { value: "fake-log-level-prod-previous", comment: "" }]]
    },
    {
      at: at(20, "14:00"),
      message: "Add workers folder",
      actor: JORDAN,
      create: ["folder:workers"]
    },
    {
      at: at(20, "12:15"),
      message: "Add payment signing keys",
      actor: AVERY,
      create: ["secret:JWT_SIGNING_KEY", "secret:STRIPE_SECRET_KEY", "secret:STRIPE_WEBHOOK_SECRET"]
    },
    {
      at: at(20, "10:40"),
      message: "Update production database host",
      actor: JORDAN,
      update: [["secret:DATABASE_URL", { value: "fake-database-url-prod-initial" }]]
    },
    {
      at: at(20, "09:40"),
      message: "Initial production configuration",
      actor: JORDAN,
      createAll: true
    }
  ],
  "payments-api:dev:/api": [
    {
      at: at(22, "12:40"),
      message: "Allow the API base URL as a CORS origin",
      actor: AVERY,
      update: [["secret:CORS_ORIGINS", { value: "https://app.dev.example.test" }]]
    },
    {
      at: at(22, "10:50"),
      message: "Clear idempotency TTL to use the default",
      actor: JORDAN,
      update: [["secret:IDEMPOTENCY_TTL_SECONDS", { value: "86400" }]]
    },
    {
      at: at(22, "08:45"),
      message: "Created 2 secrets",
      ...PLATFORM,
      create: ["secret:BILLING_AWS_ACCESS_KEY_ID", "secret:BILLING_AWS_SECRET_ACCESS_KEY"]
    },
    {
      at: at(21, "19:30"),
      message: "Tag webhook retry limit",
      actor: AVERY,
      update: [["secret:WEBHOOK_RETRY_LIMIT", { tags: [] }]]
    },
    {
      at: at(21, "16:00"),
      message: "Rotate PayPal client secret",
      ...IDENTITY,
      update: [["secret:PAYPAL_CLIENT_SECRET", { value: "fake-paypal-client-secret-dev-previous" }]]
    },
    {
      at: at(21, "12:20"),
      message: "Remove PayPal sandbox flag",
      actor: JORDAN,
      remove: [{ kind: "secret", name: "PAYPAL_SANDBOX_MODE", value: "true" }]
    },
    {
      at: at(21, "09:10"),
      message: "Add webhooks folder",
      actor: AVERY,
      create: ["folder:webhooks", "secret:WEBHOOK_RETRY_LIMIT", "secret:SIGNING_SECRET"]
    },
    {
      at: at(20, "18:30"),
      message: "Document rate limit scope",
      actor: JORDAN,
      update: [["secret:RATE_LIMIT_PER_MIN", { comment: "" }]]
    },
    {
      at: at(20, "16:45"),
      message: "Add ledger integration",
      actor: AVERY,
      create: ["secret:LEDGER_API_KEY"]
    },
    {
      at: at(20, "13:30"),
      message: "Switch payment provider",
      actor: JORDAN,
      update: [["secret:PAYMENT_PROVIDER", { value: "fake-payment-provider-dev-legacy" }]]
    },
    {
      at: at(20, "11:20"),
      message: "Add PayPal credentials",
      actor: JORDAN,
      create: [
        "secret:PAYPAL_CLIENT_ID",
        "secret:PAYPAL_CLIENT_SECRET",
        "secret:PAYPAL_SANDBOX_MODE"
      ]
    },
    {
      at: at(20, "09:10"),
      message: "Initial API configuration",
      actor: JORDAN,
      createAll: true
    }
  ]
};

const keyOf = (resource: Pick<Tracked, "kind" | "name">) => `${resource.kind}:${resource.name}`;

const resourceId = (scope: CommitScope, kind: Tracked["kind"], name: string) =>
  `${scope.project}:${scope.environment}:${scope.path}:${kind}:${name}`;

const patched = (resource: Tracked, patch: SecretPatch | FolderPatch, time: string): Tracked => {
  const name = patch.name ?? resource.name;
  const base = {
    ...resource,
    name,
    id: patch.name ? resourceId(resource, resource.kind, name) : resource.id,
    updatedAt: time
  };
  if (base.kind === "folder") {
    const { description } = patch as FolderPatch;
    return { ...base, description: description ?? base.description };
  }
  const { value, comment, tags } = patch as SecretPatch;
  return {
    ...base,
    value:
      value === undefined || base.value.status !== "present"
        ? base.value
        : { status: "present", value },
    comment: comment ?? base.comment,
    tags: tags ?? base.tags,
    version: Math.max(1, base.version - 1),
    versions: undefined
  };
};

const removedResource = (scope: CommitScope, seed: SeedRemoved, time: string): Tracked => {
  const base = {
    ...scope,
    id: resourceId(scope, seed.kind, seed.name),
    name: seed.name,
    createdAt: "2026-10-20T09:00:00Z",
    updatedAt: time
  };
  if (seed.kind === "folder")
    return { ...base, kind: "folder", description: seed.description ?? "" };
  return {
    ...base,
    kind: "secret",
    value: { status: "present", value: seed.value },
    comment: "",
    tags: [],
    metadata: [],
    version: 1
  };
};

const toChange = (
  action: CommitResourceChange["action"],
  before?: Tracked,
  after?: Tracked
): CommitResourceChange => {
  const subject = (after ?? before) as Tracked;
  return { resourceType: subject.kind, action, name: subject.name, before, after };
};

export function seedCommits(resources: readonly Resource[]): LocalCommit[] {
  return Object.entries(seedScripts).flatMap(([key, steps]) => {
    const [project, environment, path] = key.split(":");
    const scope = { project, environment, path };
    const working = new Map(
      trackedAt(resources, scope, path).map((resource) => [keyOf(resource), resource])
    );
    if (!working.size) return [];
    return steps
      .map((step, index): LocalCommit => {
        const changes: CommitResourceChange[] = [];
        step.update?.forEach(([slot, patch]) => {
          const after = working.get(slot);
          if (!after) return;
          const before = patched(after, patch, step.at);
          working.delete(slot);
          working.set(keyOf(before), before);
          changes.push(toChange("update", before, after));
        });
        step.remove?.forEach((seed) => {
          const before = removedResource(scope, seed, step.at);
          working.set(keyOf(before), before);
          changes.push(toChange("delete", before));
        });
        (step.createAll ? [...working.keys()] : (step.create ?? [])).forEach((slot) => {
          const after = working.get(slot);
          if (!after) return;
          working.delete(slot);
          changes.push(toChange("create", undefined, after));
        });
        return {
          id: commitId(`${key}:${index}`),
          ...scope,
          message: step.message,
          actor: step.actor,
          actorType: step.actorType ?? "user",
          createdAt: step.at,
          changes
        };
      })
      .filter((commit) => commit.changes.length > 0)
      .reverse();
  });
}
