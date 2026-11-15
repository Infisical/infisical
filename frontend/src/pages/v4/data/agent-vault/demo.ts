import {
  AgentVaultCredentialType,
  AgentVaultDelegationScope,
  AgentVaultHttpMethod,
  AgentVaultMemberType,
  AgentVaultOauthAuthorizationStatus,
  AgentVaultServiceType,
  AgentVaultSessionLogDecision,
  AgentVaultSessionLogStorageType,
  AgentVaultSessionScope,
  AgentVaultSessionStatus
} from "@app/hooks/api/agentVault/enums";
import { sessionLogChunkKey } from "@app/hooks/api/agentVault/sessionLogDecrypt";
import type {
  TAddAgentVaultMembersDTO,
  TAddAgentVaultProductMembersDTO,
  TAgentVaultActorIdsDTO,
  TAgentVaultDecryptedSessionLogPage,
  TAgentVaultDelegationDetail,
  TAgentVaultSessionLogHistoryPage,
  TAgentVaultSessionLogRecord,
  TAgentVaultProductMember,
  TAgentVaultSession,
  TAgentVaultSessionActor,
  TAgentVaultSessionInlineService,
  TChangeAgentVaultDelegationSubjectsDTO,
  TCompleteAgentVaultOauthAuthorizationDTO,
  TCreateAgentVaultSessionDTO,
  TSetAgentVaultDelegationDTO,
  TUpdateAgentVaultMemberRolesDTO,
  TUpdateAgentVaultSessionLabelDTO
} from "@app/hooks/api/agentVault/types";
import type { IdentityUniversalAuth } from "@app/hooks/api/identities/types";

import {
  agentVaultDemoStore,
  demoBundleListItem,
  demoProject,
  seedDemoProject,
  type TDemoProject,
  updateDemoProject
} from "../agent-vault-demo-store";
import { createFixtureStore, fixtureMutation } from "../fixture-store";
import type { AgentVaultAdapter, TAgentVaultSessionLogs } from "./contract";

const uuid = (prefix: string, index: number) =>
  `${prefix}000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
const loadedAt = Date.now();
const at = (minutes: number) => new Date(loadedAt + minutes * 60_000).toISOString();

const seedUser = (
  id: string | null,
  firstName: string,
  lastName: string
): Extract<TAgentVaultSessionActor, { type: AgentVaultMemberType.User }> => ({
  type: AgentVaultMemberType.User,
  id,
  username: `${firstName.toLowerCase()}@acme.dev`,
  email: `${firstName.toLowerCase()}@acme.dev`,
  firstName,
  lastName
});

const machine = (id: string | null, name: string): TAgentVaultSessionActor => ({
  type: AgentVaultMemberType.MachineIdentity,
  id,
  name
});

const sarah = seedUser(uuid("a1", 1), "Sarah", "Lin");
const people = [
  sarah,
  seedUser(uuid("a1", 2), "Marcus", "Webb"),
  seedUser(uuid("a1", 3), "Priya", "Raman"),
  seedUser(uuid("a1", 4), "Diego", "Alvarez"),
  seedUser(null, "Tom", "Becker")
];
const machines = [
  machine(uuid("a2", 1), "ci-release-agent"),
  machine(uuid("a2", 2), "support-triage-bot"),
  machine(uuid("a2", 3), "nightly-eval-runner")
];

const inline = (
  index: number,
  name: string,
  hostPattern: string
): TAgentVaultSessionInlineService => ({
  id: uuid("c1", index),
  name,
  description: null,
  type: AgentVaultServiceType.Http,
  hostPattern,
  allowedMethods: [AgentVaultHttpMethod.Get],
  allowedPathPrefixes: null,
  credential: {
    type: AgentVaultCredentialType.Bearer,
    headerName: "Authorization",
    headerPrefix: "Bearer"
  },
  customHeaders: [],
  substitutions: []
});

type Seed = [
  label: string | null,
  actor: TAgentVaultSessionActor,
  onBehalfOf: TAgentVaultSession["onBehalfOf"],
  bundle: number | null,
  services: TAgentVaultSessionInlineService[],
  status: AgentVaultSessionStatus,
  createdMinutesAgo: number,
  expiresInMinutes: number | null
];

const { Active, Revoked, Expired } = AgentVaultSessionStatus;

const seeds: Seed[] = [
  ["release-notes-drafter", machines[0], null, 0, [], Active, 18, 60 * 8],
  ["Refund triage", sarah, null, 1, [], Active, 42, 60 * 4],
  ["support-queue-sweep", machines[1], people[2], 2, [], Active, 95, 60 * 24],
  [null, people[1], null, 0, [], Active, 140, 60 * 2],
  ["Incident 4821 investigation", people[3], null, 3, [], Active, 210, 60 * 6],
  [
    "nightly-evals",
    machines[2],
    sarah,
    3,
    [inline(1, "Eval dashboard", "evals.acme.dev")],
    Active,
    300,
    null
  ],
  ["Pull request reviewer", sarah, null, 0, [], Revoked, 60 * 9, 60 * 3],
  ["Stripe sandbox checks", people[2], null, 1, [], Expired, 60 * 26, -60 * 2],
  [
    "Partner API smoke test",
    people[1],
    null,
    null,
    [inline(2, "Partner API", "partners.acme.dev"), inline(3, "Status page", "status.acme.dev")],
    Active,
    60 * 30,
    60 * 18
  ],
  ["Weekly churn report", sarah, null, 1, [], Expired, 60 * 24 * 3, -60 * 24 * 2],
  ["support-handoff", machines[1], people[1], 2, [], Revoked, 60 * 24 * 3 + 40, 60 * 20],
  [null, people[4], null, 3, [], Expired, 60 * 24 * 4, -60 * 24 * 3],
  ["Dependency audit", people[3], null, 0, [], Expired, 60 * 24 * 5, -60 * 24 * 4],
  ["Quarterly billing reconciliation", sarah, null, 1, [], Expired, 60 * 24 * 6, -60 * 24 * 5],
  ["release-notes-drafter", machines[0], null, 0, [], Expired, 60 * 24 * 7, -60 * 24 * 6],
  ["Alert noise review", people[2], null, 3, [], Revoked, 60 * 24 * 8, 60 * 24],
  ["Customer escalation 1193", sarah, null, 2, [], Expired, 60 * 24 * 9, -60 * 24 * 8],
  ["nightly-evals", machines[2], sarah, 3, [], Expired, 60 * 24 * 10, -60 * 24 * 9],
  ["Repo cleanup", people[1], null, 0, [], Expired, 60 * 24 * 12, -60 * 24 * 11],
  ["Invoice export", people[3], null, 1, [], Expired, 60 * 24 * 14, -60 * 24 * 13],
  ["Ticket tagging backfill", machines[1], people[2], 2, [], Expired, 60 * 24 * 16, -60 * 24 * 15],
  ["Latency regression hunt", sarah, null, 3, [], Expired, 60 * 24 * 18, -60 * 24 * 17],
  [
    "Changelog generator",
    machines[0],
    null,
    null,
    [inline(4, "Docs CMS", "cms.acme.dev")],
    Expired,
    60 * 24 * 21,
    -60 * 24 * 20
  ],
  ["Old billing bundle check", people[2], null, null, [], Expired, 60 * 24 * 30, -60 * 24 * 29]
];

const bundleRef = (bundle: number | null, index: number): TAgentVaultSession["accessBundle"] => {
  if (bundle !== null) return { id: uuid("b1", bundle + 1), name: "" };
  return index === seeds.length - 1 ? { id: null, name: "Legacy billing" } : null;
};

seedDemoProject("agent-platform", {
  sessions: seeds.map(
    ([label, actor, onBehalfOf, bundle, services, status, created, expires], index) => ({
      id: uuid("d1", index + 1),
      label,
      actor,
      onBehalfOf,
      status,
      createdAt: at(-created),
      expiresAt: expires === null ? null : at(expires),
      revokedAt: status === Revoked ? at(-created + 30) : null,
      accessBundle: bundleRef(bundle, index),
      services,
      stats: null
    })
  )
});

const withBundleNames = (project: TDemoProject) => {
  const names = new Map(project.bundles.map((bundle) => [bundle.id, bundle.name]));
  return (session: TAgentVaultSession): TAgentVaultSession => {
    const id = session.accessBundle?.id;
    const name = id ? names.get(id) : undefined;
    return id && name ? { ...session, accessBundle: { id, name } } : session;
  };
};

const findSession = (sessionId: string) =>
  Object.values(agentVaultDemoStore.get().projects)
    .flatMap((project) => project.sessions.map(withBundleNames(project)))
    .find((session) => session.id === sessionId);

const LOG_PROXY = uuid("d2", 1);
const LOG_CHUNK_SIZE = 25;
const {
  Brokered,
  Passthrough,
  Blocked,
  Error: Failed,
  Discovery,
  Skills
} = AgentVaultSessionLogDecision;

type TLogEntry = Omit<TAgentVaultSessionLogRecord, "ts" | "seq" | "proxyId" | "accessBundle"> & {
  secondsIn: number;
};

const http = (
  secondsIn: number,
  method: string,
  host: string,
  path: string,
  status: number,
  decision: AgentVaultSessionLogDecision,
  service: string | null = null
): TLogEntry => ({
  secondsIn,
  method,
  host,
  port: "443",
  path,
  status,
  decision,
  service,
  serviceType: service ? AgentVaultServiceType.Http : null
});

const sessionStart = (index: number) => {
  const [, , , , , , created] = seeds[index];
  return loadedAt - created * 60_000;
};

const releaseNotesLog = (): TLogEntry[] => [
  http(4, "GET", "app.infisical.com", "/api/v1/agent-vault/session/services", 200, Discovery),
  http(5, "GET", "app.infisical.com", "/api/v1/agent-vault/session/skills", 200, Skills),
  ...Array.from({ length: 34 }, (_, step) =>
    http(
      20 + step * 28,
      step % 5 === 4 ? "POST" : "GET",
      "api.github.com",
      [
        "/repos/acme/web/pulls?state=closed",
        "/repos/acme/web/pulls/1482/commits",
        "/repos/acme/api/releases/latest",
        "/search/issues?q=label:release-note",
        "/repos/acme/web/issues/1482/comments"
      ][step % 5],
      step === 17 ? 404 : 200,
      Brokered,
      "github-api"
    )
  ),
  http(640, "GET", "registry.npmjs.org", "/@acme%2fchangelog-kit", 200, Passthrough),
  http(702, "POST", "api.openai.com", "/v1/chat/completions", 403, Blocked),
  http(905, "GET", "uploads.github.com", "/repos/acme/web/releases/assets", 502, Failed)
];

const refundTriageLog = (): TLogEntry[] => [
  http(3, "GET", "app.infisical.com", "/api/v1/agent-vault/session/services", 200, Discovery),
  ...Array.from({ length: 12 }, (_, step) =>
    http(
      30 + step * 140,
      step % 3 === 2 ? "POST" : "GET",
      "api.stripe.com",
      ["/v1/charges?limit=20", "/v1/refunds/re_demo_0042", "/v1/refunds"][step % 3],
      step === 7 ? 402 : 200,
      Brokered,
      "stripe-test"
    )
  ),
  {
    ...http(260, "POST", "mcp.linear.app", "/mcp", 200, Brokered, "linear-mcp"),
    serviceType: AgentVaultServiceType.Mcp,
    mcp: {
      parsed: true,
      calls: [
        { method: "tools/call", tool: "search_issues" },
        { method: "tools/call", tool: "get_issue" },
        { method: "tools/call", tool: "get_issue" }
      ]
    }
  },
  {
    secondsIn: 410,
    method: "POSTGRES",
    host: "orders-db.internal.acme.dev",
    port: "5432",
    path: "",
    status: 0,
    decision: Brokered,
    service: "orders-db",
    serviceType: AgentVaultServiceType.Postgres,
    native: {
      statement:
        "SELECT id, amount, status FROM refunds WHERE created_at > now() - interval '1 day'",
      result: "SELECT 14"
    }
  },
  {
    secondsIn: 470,
    method: "POSTGRES",
    host: "orders-db.internal.acme.dev",
    port: "5432",
    path: "",
    status: 0,
    decision: Failed,
    service: "orders-db",
    serviceType: AgentVaultServiceType.Postgres,
    native: {
      statement: "UPDATE refunds SET status = 'reviewed' WHERE id = 'rf_demo_19'",
      result: "ERROR: permission denied for table refunds",
      note: "The service only allows read-only statements."
    }
  },
  http(
    1900,
    "GET",
    "billing.internal.acme.dev",
    "/v2/customers/cus_demo_7/invoices",
    200,
    Passthrough
  )
];

const LONG_PATH_SEGMENT = "aggregate-latency-percentiles-by-region-and-service-tier";

const incidentLog = (): TLogEntry[] =>
  Array.from({ length: 1200 }, (_, step) => {
    const secondsIn = 10 + step * 10;
    if (step % 97 === 50)
      return {
        secondsIn,
        method: "SSH",
        host: "bastion-us-east-1-production-observability.internal.acme.dev",
        port: "22",
        path: "",
        status: 0,
        decision: Brokered,
        service: "production-observability-bastion-us-east-1",
        serviceType: AgentVaultServiceType.Ssh,
        native: {
          command:
            "journalctl -u checkout-api --since '30 minutes ago' --no-pager | grep -i timeout",
          output: Array.from(
            { length: 12 },
            (__, line) =>
              `Nov 15 09:${String(10 + line).padStart(2, "0")}:04 checkout-api[2214]: upstream request timeout after 30000ms on /v1/checkout/sessions/cs_demo_${line}`
          ).join("\n"),
          truncated: true
        }
      };
    if (step % 41 === 7)
      return http(
        secondsIn,
        "POST",
        "hooks.slack.com",
        "/services/T0DEMO/B0DEMO/incident-updates",
        403,
        Blocked
      );
    if (step % 53 === 11)
      return http(secondsIn, "GET", "api.datadoghq.com", "/api/v1/query", 504, Failed);
    return step % 3 === 0
      ? http(
          secondsIn,
          "GET",
          "sentry.io",
          `/api/0/organizations/acme/issues/?query=is:unresolved+release:checkout-api@4.18.${step % 9}&statsPeriod=24h`,
          step % 29 === 0 ? 429 : 200,
          Brokered,
          "sentry-production-error-tracking-read-only"
        )
      : http(
          secondsIn,
          "GET",
          "api.datadoghq.com",
          `/api/v2/metrics/checkout-api/${LONG_PATH_SEGMENT}/${LONG_PATH_SEGMENT}?from=${step}`,
          200,
          Brokered,
          "datadog-metrics-and-monitors-read-only"
        );
  });

const SESSION_LOG_FIXTURES: Record<string, { index: number; entries: () => TLogEntry[] }> = {
  [uuid("d1", 1)]: { index: 0, entries: releaseNotesLog },
  [uuid("d1", 2)]: { index: 1, entries: refundTriageLog },
  [uuid("d1", 5)]: { index: 4, entries: incidentLog }
};

const LOGS_OFF_SESSION = uuid("d1", 8);

const chunkIdAt = (time: number, index: number) => {
  const hex = time.toString(16).padStart(12, "0");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-7000-8000-${String(index).padStart(12, "0")}`;
};

const buildSessionLogPage = (
  sessionId: string
): TAgentVaultDecryptedSessionLogPage<TAgentVaultSessionLogHistoryPage> => {
  const fixture = SESSION_LOG_FIXTURES[sessionId];
  const session = findSession(sessionId);
  const start = fixture ? sessionStart(fixture.index) : 0;
  const records: TAgentVaultSessionLogRecord[] = (fixture?.entries() ?? []).map(
    ({ secondsIn, ...entry }, seq) => ({
      ...entry,
      ts: new Date(start + secondsIn * 1000).toISOString(),
      seq,
      proxyId: LOG_PROXY,
      accessBundle: session?.accessBundle?.name ?? null
    })
  );
  const chunks = Array.from({ length: Math.ceil(records.length / LOG_CHUNK_SIZE) }, (_, index) => {
    const slice = records.slice(index * LOG_CHUNK_SIZE, (index + 1) * LOG_CHUNK_SIZE);
    return {
      chunk: {
        chunkId: chunkIdAt(Date.parse(slice[slice.length - 1].ts), index),
        proxyId: LOG_PROXY,
        ciphertextBytes: slice.length * 400,
        presignedGetUrl: ""
      },
      records: slice
    };
  });
  const isOff = sessionId === LOGS_OFF_SESSION;
  return {
    sessionLogs: {
      enabled: !isOff,
      disabledReason: isOff ? "off" : null,
      storageType: AgentVaultSessionLogStorageType.Default,
      isRecordable: true,
      sessionKey: null
    },
    chunks: chunks.map(({ chunk }) => chunk),
    nextCursor: null,
    decrypted: Object.fromEntries(
      chunks.map(({ chunk, records: chunkRecords }) => [
        sessionLogChunkKey(chunk),
        { records: chunkRecords, gap: null, arrivedAt: null }
      ])
    )
  };
};

const resolved = () => Promise.resolve();
const sessionLogCache = new Map<string, TAgentVaultSessionLogs>();
const demoSessionLogs = (sessionId: string): TAgentVaultSessionLogs => {
  const cached = sessionLogCache.get(sessionId);
  if (cached) return cached;
  const logs: TAgentVaultSessionLogs = {
    history: {
      data: { pages: [buildSessionLogPage(sessionId)] },
      error: null,
      isPending: false,
      isPlaceholderData: false,
      isError: false,
      isFetching: false,
      isRefetching: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      isFetchNextPageError: false,
      refetch: resolved,
      fetchNextPage: resolved
    },
    live: { isError: false, isFetching: false, refetch: resolved },
    arrived: undefined,
    isLiveGapUnfilled: false
  };
  sessionLogCache.set(sessionId, logs);
  return logs;
};

const assignableIdentities = [
  { id: uuid("a2", 10), name: "github-actions-deployer" },
  { id: uuid("a2", 11), name: "data-pipeline-scheduler" }
];

const universalAuthIdentities = new Set([machines[0].id, machines[2].id]);

const randomToken = () =>
  `avs_${Array.from(crypto.getRandomValues(new Uint8Array(24)), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("")}`;

const ttlMinutes = (ttl: string) => {
  const match = /^(\d+(?:\.\d+)?)([smhdw])$/.exec(ttl.trim());
  if (!match) return null;
  const unit = { s: 1 / 60, m: 1, h: 60, d: 60 * 24, w: 60 * 24 * 7 }[match[2] as "s"];
  return Number(match[1]) * unit;
};

const displayName = (actor: TAgentVaultSessionActor) =>
  actor.type === AgentVaultMemberType.User
    ? [actor.firstName, actor.lastName].filter(Boolean).join(" ")
    : actor.name;

const isMine = (session: TAgentVaultSession) =>
  session.actor.id === sarah.id || session.onBehalfOf?.id === sarah.id;

type DemoMember = TAgentVaultProductMember & { projectId: string };
type DemoUserMember = Extract<TAgentVaultProductMember, { type: AgentVaultMemberType.User }>;

const demoUser = (
  id: string,
  firstName: string,
  lastName: string,
  isOrgMembershipPending = false
): DemoUserMember => ({
  type: AgentVaultMemberType.User,
  id,
  username: `${firstName.toLowerCase()}@acme.dev`,
  email: `${firstName.toLowerCase()}@acme.dev`,
  firstName,
  lastName,
  isOrgMembershipPending,
  role: "member",
  isActive: true,
  addedAt: at(-60 * 24 * 30)
});

const orgUsers = [
  demoUser(uuid("a1", 1), "Sarah", "Lin"),
  demoUser(uuid("a1", 2), "Marcus", "Webb"),
  demoUser(uuid("a1", 3), "Priya", "Raman", true),
  demoUser(uuid("a1", 4), "Diego", "Alvarez"),
  demoUser(uuid("a1", 6), "Omar", "")
];
const orgGroups = [
  { id: uuid("a3", 1), name: "platform-eng" },
  { id: uuid("a3", 2), name: "security-team" },
  { id: uuid("a3", 3), name: "support-leads" }
];

const memberStore = createFixtureStore<DemoMember[]>([
  { ...orgUsers[0], role: "admin", projectId: "agent-platform" },
  { ...orgUsers[3], projectId: "agent-platform" },
  { ...orgUsers[2], projectId: "agent-platform" },
  { ...orgUsers[4], projectId: "agent-platform" },
  {
    type: AgentVaultMemberType.Group,
    id: orgGroups[0].id,
    name: orgGroups[0].name,
    role: "member",
    isActive: true,
    addedAt: at(-60 * 24 * 40),
    projectId: "agent-platform"
  },
  {
    type: AgentVaultMemberType.MachineIdentity,
    id: machines[0].id as string,
    name: "ci-release-agent",
    isManagedByAgentVault: true,
    orgId: null,
    role: "member",
    isActive: true,
    addedAt: at(-60 * 24 * 20),
    projectId: "agent-platform"
  },
  {
    type: AgentVaultMemberType.MachineIdentity,
    id: uuid("a2", 9),
    name: "terraform-runner",
    isManagedByAgentVault: false,
    orgId: "demo",
    role: "admin",
    isActive: true,
    addedAt: at(-60 * 24 * 10),
    projectId: "agent-platform"
  }
]);

const delegations = createFixtureStore<Record<string, TAgentVaultDelegationDetail | null>>({});
const delegationKey = (projectId: string, identityId: string) => `${projectId}:${identityId}`;
const now = () => new Date().toISOString();
const excluded = [{ id: uuid("b1", 2), name: "billing-apis" }];

const delegationSubjects = (
  members: DemoMember[],
  dto: TChangeAgentVaultDelegationSubjectsDTO
) => ({
  users: members.filter(
    (member): member is DemoMember & DemoUserMember =>
      member.type === AgentVaultMemberType.User && (dto.userIds ?? []).includes(member.id)
  ),
  groups: members.flatMap((member) =>
    member.type === AgentVaultMemberType.Group && (dto.groupIds ?? []).includes(member.id)
      ? [{ id: member.id, name: member.name }]
      : []
  )
});

const memberName = (member: TAgentVaultProductMember) =>
  member.type === AgentVaultMemberType.User
    ? [member.firstName, member.lastName, member.email, member.username].join(" ")
    : member.name;

const slice = <T>(rows: T[], limit = 20, offset = 0) => ({
  rows: rows.slice(offset, offset + limit),
  totalCount: rows.length
});

export const agentVaultDemo: AgentVaultAdapter = {
  useProjectPermission: () => ({
    data: { memberships: [{ roles: [{ role: "admin" }] }] },
    isPending: false,
    error: null
  }),
  useSessions: (_, projectId, { scope, statuses, search, limit = 20, offset = 0 }) => {
    const term = search?.toLowerCase();
    const project = demoProject(agentVaultDemoStore.use(), projectId);
    const matched = project.sessions
      .map(withBundleNames(project))
      .filter(
        (session) =>
          (scope !== AgentVaultSessionScope.Mine || isMine(session)) &&
          (!statuses?.length || statuses.includes(session.status)) &&
          (!term ||
            [
              session.label,
              displayName(session.actor),
              session.actor.type === AgentVaultMemberType.User ? session.actor.email : null,
              session.onBehalfOf ? displayName(session.onBehalfOf) : null,
              session.onBehalfOf?.email,
              session.accessBundle?.name
            ].some((value) => value?.toLowerCase().includes(term)))
      );
    return {
      data: { sessions: matched.slice(offset, offset + limit), totalCount: matched.length },
      isPending: false,
      error: null
    };
  },
  useSession: (_, projectId, sessionId) => {
    const project = demoProject(agentVaultDemoStore.use(), projectId);
    const session = project.sessions.find((entry) => entry.id === sessionId);
    return {
      data: session && withBundleNames(project)(session),
      isPending: false,
      error: null
    };
  },
  useCreateSession: (_, projectId) =>
    fixtureMutation(({ accessBundle, ttl, label }: TCreateAgentVaultSessionDTO) => {
      const bundle = demoProject(agentVaultDemoStore.get(), projectId).bundles.find(
        (entry) => entry.name === accessBundle
      );
      const minutes = ttl === "never" ? null : ttlMinutes(ttl);
      const session: TAgentVaultSession = {
        id: crypto.randomUUID(),
        label: label ?? null,
        actor: sarah,
        onBehalfOf: null,
        status: Active,
        createdAt: now(),
        expiresAt: minutes === null ? null : new Date(Date.now() + minutes * 60_000).toISOString(),
        revokedAt: null,
        accessBundle: bundle ? { id: bundle.id, name: bundle.name } : null,
        services: [],
        stats: null
      };
      updateDemoProject(projectId, (project) => ({
        ...project,
        sessions: [session, ...project.sessions]
      }));
      return {
        id: session.id,
        label: session.label,
        token: randomToken(),
        expiresAt: session.expiresAt,
        createdAt: session.createdAt,
        projectId,
        accessBundle: session.accessBundle,
        services: []
      };
    })(),
  useUpdateSessionLabel: (_, projectId) =>
    fixtureMutation(({ sessionId, label }: TUpdateAgentVaultSessionLabelDTO) => {
      updateDemoProject(projectId, (project) => ({
        ...project,
        sessions: project.sessions.map((session) =>
          session.id === sessionId ? { ...session, label } : session
        )
      }));
      return findSession(sessionId) as TAgentVaultSession;
    })(),
  useRevokeSession: (_, projectId) =>
    fixtureMutation((sessionId: string) => {
      const revokedAt = now();
      updateDemoProject(projectId, (project) => ({
        ...project,
        sessions: project.sessions.map((session) =>
          session.id === sessionId ? { ...session, status: Revoked, revokedAt } : session
        )
      }));
      return { id: sessionId, revokedAt };
    })(),
  useSessionLogs: (_, __, sessionId) => demoSessionLogs(sessionId),
  useAssignableIdentities: (projectId) => {
    const taken = new Set(
      memberStore
        .use()
        .filter((member) => member.projectId === projectId)
        .map((member) => member.id)
    );
    return {
      data: assignableIdentities.filter((identity) => !taken.has(identity.id)),
      isPending: false,
      error: null
    };
  },
  useCreateManagedIdentity: (projectId) =>
    fixtureMutation(({ name, role }: { name: string; role: string }) => {
      const id = crypto.randomUUID();
      memberStore.update((members) => [
        ...members,
        {
          type: AgentVaultMemberType.MachineIdentity,
          id,
          name,
          isManagedByAgentVault: true,
          orgId: null,
          role,
          isActive: true,
          addedAt: now(),
          projectId
        }
      ]);
      universalAuthIdentities.add(id);
      return { id, name, authAttachFailed: false };
    })(),
  useProxies: (_, projectId, { limit = 20, offset = 0 }) => {
    const { rows, totalCount } = slice(
      demoProject(agentVaultDemoStore.use(), projectId).proxies,
      limit,
      offset
    );
    return { data: { proxies: rows, totalCount }, isPending: false, error: null };
  },
  useIsAccessBundleMember: (_, projectId, accessBundleId, actor) => {
    const bundle = demoProject(agentVaultDemoStore.use(), projectId).bundles.find(
      (entry) => entry.id === accessBundleId
    );
    return {
      data:
        actor && accessBundleId
          ? Boolean(bundle?.members.some((member) => member.id === actor.id))
          : undefined,
      isPending: false,
      error: null
    };
  },
  useGrantAccessBundle: () =>
    fixtureMutation(({ accessBundleId, machineIdentityIds = [] }: TAddAgentVaultMembersDTO) => {
      const grantedAt = now();
      const granted = machineIdentityIds.map((id) => ({
        type: AgentVaultMemberType.MachineIdentity as const,
        id,
        name:
          memberStore
            .get()
            .flatMap((member) =>
              member.type === AgentVaultMemberType.MachineIdentity && member.id === id
                ? [member.name]
                : []
            )[0] ??
          assignableIdentities.find((identity) => identity.id === id)?.name ??
          id,
        grantedAt
      }));
      agentVaultDemoStore.update((state) => ({
        ...state,
        projects: Object.fromEntries(
          Object.entries(state.projects).map(([projectId, project]) => [
            projectId,
            {
              ...project,
              bundles: project.bundles.map((bundle) =>
                bundle.id === accessBundleId
                  ? {
                      ...bundle,
                      members: [
                        ...bundle.members,
                        ...granted.filter(
                          ({ id }) => !bundle.members.some((member) => member.id === id)
                        )
                      ]
                    }
                  : bundle
              )
            }
          ])
        )
      }));
    })(),
  useIdentityUniversalAuth: (identityId) => {
    if (!identityId) return { data: undefined, isPending: true, error: null };
    if (!universalAuthIdentities.has(identityId))
      return {
        data: undefined,
        isPending: false,
        error: {
          isAxiosError: true,
          response: {
            status: 404,
            data: { message: "Failed to find Universal Auth configuration for this identity" }
          }
        }
      };
    return {
      data: {
        identityId,
        clientId: `${identityId.slice(0, 8)}-5f2c-4b1e-9a7d-3c8e1f0b6d42`
      } as IdentityUniversalAuth,
      isPending: false,
      error: null
    };
  },
  useAccessBundles: (_, projectId, { search, orderBy, orderDirection, limit = 20, offset = 0 }) => {
    const term = search?.trim().toLowerCase();
    const project = demoProject(agentVaultDemoStore.use(), projectId);
    const reachable = project.bundles
      .map((bundle) => demoBundleListItem(project, bundle))
      .filter((bundle) => !term || bundle.name.toLowerCase().includes(term))
      .sort((a, b) => {
        const direction = orderDirection === "desc" ? -1 : 1;
        if (orderBy === "serviceCount") return (a.serviceCount - b.serviceCount) * direction;
        if (orderBy === "createdAt") return a.createdAt.localeCompare(b.createdAt) * direction;
        return orderBy === "name" ? a.name.localeCompare(b.name) * direction : 0;
      });
    return {
      data: {
        accessBundles: reachable.slice(offset, offset + limit),
        totalCount: reachable.length
      },
      isPending: false,
      error: null
    };
  },
  useMembers: (projectId, { actorType, search, limit, offset }) => {
    const term = search?.trim().toLowerCase();
    const matched = memberStore
      .use()
      .filter(
        (member) =>
          member.projectId === projectId &&
          member.type === actorType &&
          (!term || memberName(member).toLowerCase().includes(term))
      );
    const { rows, totalCount } = slice(matched, limit, offset);
    return { data: { members: rows as never, totalCount }, isPending: false, error: null };
  },
  useAvailableMembers: (projectId, { actorType, search, limit }) => {
    const term = search?.trim().toLowerCase();
    const taken = new Set(
      memberStore
        .use()
        .filter((member) => member.projectId === projectId)
        .map((member) => member.id)
    );
    const pool: TAgentVaultProductMember[] =
      actorType === AgentVaultMemberType.Group
        ? orgGroups.map((group) => ({
            type: AgentVaultMemberType.Group,
            ...group,
            role: "member",
            isActive: true,
            addedAt: at(0)
          }))
        : orgUsers;
    const matched = pool.filter(
      (actor) => !taken.has(actor.id) && (!term || memberName(actor).toLowerCase().includes(term))
    );
    const { rows, totalCount } = slice(matched, limit);
    return { data: { actors: rows as never, totalCount }, isPending: false, error: null };
  },
  useAddMembers: (projectId) =>
    fixtureMutation(
      ({
        userIds = [],
        groupIds = [],
        machineIdentityIds = [],
        role
      }: TAddAgentVaultProductMembersDTO) => {
        const taken = new Set(
          memberStore
            .get()
            .filter((member) => member.projectId === projectId)
            .map((member) => member.id)
        );
        const additions: DemoMember[] = [];
        const skipped: { type: AgentVaultMemberType; id: string; identifier: string }[] = [];
        const addedAt = new Date().toISOString();
        const consider = (
          type: AgentVaultMemberType,
          id: string,
          found: TAgentVaultProductMember | undefined
        ) => {
          if (!found || taken.has(id)) {
            skipped.push({ type, id, identifier: id });
            return;
          }
          additions.push({ ...found, role, addedAt, projectId });
        };
        userIds.forEach((id) =>
          consider(
            AgentVaultMemberType.User,
            id,
            orgUsers.find((user) => user.id === id)
          )
        );
        groupIds.forEach((id) => {
          const group = orgGroups.find((entry) => entry.id === id);
          consider(
            AgentVaultMemberType.Group,
            id,
            group && {
              type: AgentVaultMemberType.Group,
              ...group,
              role,
              isActive: true,
              addedAt
            }
          );
        });
        machineIdentityIds.forEach((id) => {
          const identity = assignableIdentities.find((entry) => entry.id === id);
          consider(
            AgentVaultMemberType.MachineIdentity,
            id,
            identity && {
              type: AgentVaultMemberType.MachineIdentity,
              ...identity,
              isManagedByAgentVault: false,
              orgId: "demo",
              role,
              isActive: true,
              addedAt
            }
          );
        });
        memberStore.update((members) => [...members, ...additions]);
        return {
          members: additions.map(({ type, id }) => ({ type, id, role, addedAt })),
          skipped
        };
      }
    )(),
  useUpdateMemberRoles: (projectId) =>
    fixtureMutation(
      ({
        userIds = [],
        groupIds = [],
        machineIdentityIds = [],
        role
      }: TUpdateAgentVaultMemberRolesDTO) => {
        const ids = new Set([...userIds, ...groupIds, ...machineIdentityIds]);
        const changed = memberStore
          .get()
          .filter((member) => member.projectId === projectId && ids.has(member.id));
        memberStore.update((members) =>
          members.map((member) =>
            member.projectId === projectId && ids.has(member.id) ? { ...member, role } : member
          )
        );
        return {
          members: changed.map(({ type, id, addedAt }) => ({ type, id, role, addedAt })),
          skipped: []
        };
      }
    )(),
  useRevokeMembers: (projectId) =>
    fixtureMutation(
      ({ userIds = [], groupIds = [], machineIdentityIds = [] }: TAgentVaultActorIdsDTO) => {
        const ids = new Set([...userIds, ...groupIds, ...machineIdentityIds]);
        const removed = memberStore
          .get()
          .filter((member) => member.projectId === projectId && ids.has(member.id));
        memberStore.update((members) =>
          members.filter((member) => !(member.projectId === projectId && ids.has(member.id)))
        );
        return { members: removed.map(({ type, id }) => ({ type, id })), skipped: [] };
      }
    )(),
  useDeleteManagedIdentity: (projectId) =>
    fixtureMutation(({ identityId }: { identityId: string }) => {
      memberStore.update((members) =>
        members.filter((member) => !(member.projectId === projectId && member.id === identityId))
      );
    })(),
  useDelegation: (projectId, machineIdentityId) => ({
    data: delegations.use()[delegationKey(projectId, machineIdentityId)] ?? null,
    isPending: false,
    error: null
  }),
  useAvailableDelegationSubjects: (projectId, machineIdentityId, { actorType, search, limit }) => {
    const term = search?.trim().toLowerCase();
    const current = delegations.use()[delegationKey(projectId, machineIdentityId)];
    const inDelegation = new Set([
      ...(current?.users ?? []).map((user) => user.id),
      ...(current?.groups ?? []).map((group) => group.id)
    ]);
    const matched = memberStore
      .use()
      .filter(
        (member) =>
          member.projectId === projectId &&
          member.type !== AgentVaultMemberType.MachineIdentity &&
          (!actorType || member.type === actorType) &&
          !inDelegation.has(member.id) &&
          (!term || memberName(member).toLowerCase().includes(term))
      );
    const { rows, totalCount } = slice(matched, limit);
    return { data: { members: rows, totalCount }, isPending: false, error: null };
  },
  useSetDelegation: (projectId) =>
    fixtureMutation((dto: TSetAgentVaultDelegationDTO) => {
      const { machineIdentityId, scope } = dto;
      const members = memberStore.get().filter((member) => member.projectId === projectId);
      const picked = delegationSubjects(members, dto);
      const detail: TAgentVaultDelegationDetail = {
        machineIdentity: { id: machineIdentityId, name: "" },
        scope,
        users:
          scope === AgentVaultDelegationScope.AllMembers
            ? []
            : picked.users.map((user) => ({ ...user, addedAt: now(), missingAccessBundles: [] })),
        groups:
          scope === AgentVaultDelegationScope.AllMembers
            ? []
            : picked.groups.map((group) => ({
                ...group,
                addedAt: now(),
                missingAccessBundles: []
              })),
        createdAt: now(),
        updatedAt: now(),
        missingAccessBundles: scope === AgentVaultDelegationScope.AllMembers ? excluded : []
      };
      delegations.update((all) => ({
        ...all,
        [delegationKey(projectId, machineIdentityId)]: detail
      }));
      return detail;
    })(),
  useDeleteDelegation: (projectId) =>
    fixtureMutation(({ machineIdentityId }: { machineIdentityId: string }) => {
      delegations.update((all) => ({
        ...all,
        [delegationKey(projectId, machineIdentityId)]: null
      }));
    })(),
  useAddDelegationSubjects: (projectId) =>
    fixtureMutation((dto: TChangeAgentVaultDelegationSubjectsDTO) => {
      const key = delegationKey(projectId, dto.machineIdentityId);
      const members = memberStore.get().filter((member) => member.projectId === projectId);
      const picked = delegationSubjects(members, dto);
      const existing = delegations.get()[key];
      const detail: TAgentVaultDelegationDetail = {
        machineIdentity: { id: dto.machineIdentityId, name: "" },
        scope: AgentVaultDelegationScope.Selected,
        users: [
          ...(existing?.users ?? []),
          ...picked.users.map((user) => ({
            ...user,
            addedAt: now(),
            missingAccessBundles: excluded
          }))
        ],
        groups: [
          ...(existing?.groups ?? []),
          ...picked.groups.map((group) => ({ ...group, addedAt: now(), missingAccessBundles: [] }))
        ],
        createdAt: existing?.createdAt ?? now(),
        updatedAt: now(),
        missingAccessBundles: []
      };
      delegations.update((all) => ({ ...all, [key]: detail }));
      return detail;
    })(),
  useRemoveDelegationSubjects: (projectId) =>
    fixtureMutation((dto: TChangeAgentVaultDelegationSubjectsDTO) => {
      const key = delegationKey(projectId, dto.machineIdentityId);
      const existing = delegations.get()[key];
      if (!existing) return null;
      const users = existing.users.filter((user) => !(dto.userIds ?? []).includes(user.id));
      const groups = existing.groups.filter((group) => !(dto.groupIds ?? []).includes(group.id));
      const detail =
        users.length || groups.length ? { ...existing, users, groups, updatedAt: now() } : null;
      delegations.update((all) => ({ ...all, [key]: detail }));
      return detail;
    })(),
  useCompleteOauthAuthorization: fixtureMutation(
    ({ authorizationId, error, errorDescription }: TCompleteAgentVaultOauthAuthorizationDTO) => ({
      id: authorizationId,
      status: error
        ? AgentVaultOauthAuthorizationStatus.Failed
        : AgentVaultOauthAuthorizationStatus.Authorized,
      error: error ? (errorDescription ?? error) : null,
      scopes: []
    })
  )
};
