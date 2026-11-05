import {
  AgentVaultCredentialType,
  AgentVaultHttpMethod,
  AgentVaultMemberType,
  AgentVaultServiceType,
  AgentVaultSessionScope,
  AgentVaultSessionStatus
} from "@app/hooks/api/agentVault/enums";
import type {
  TAgentVaultAccessBundleListItem,
  TAgentVaultSession,
  TAgentVaultSessionActor,
  TAgentVaultSessionInlineService
} from "@app/hooks/api/agentVault/types";

import { createFixtureStore } from "../fixture-store";
import type { AgentVaultAdapter } from "./contract";

const uuid = (prefix: string, index: number) =>
  `${prefix}000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
const loadedAt = Date.now();
const at = (minutes: number) => new Date(loadedAt + minutes * 60_000).toISOString();

const user = (
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

const sarah = user(uuid("a1", 1), "Sarah", "Lin");
const people = [
  sarah,
  user(uuid("a1", 2), "Marcus", "Webb"),
  user(uuid("a1", 3), "Priya", "Raman"),
  user(uuid("a1", 4), "Diego", "Alvarez"),
  user(null, "Tom", "Becker")
];
const machines = [
  machine(uuid("a2", 1), "ci-release-agent"),
  machine(uuid("a2", 2), "support-triage-bot"),
  machine(uuid("a2", 3), "nightly-eval-runner")
];

const bundleSeeds: [name: string, description: string, hosts: string[]][] = [
  ["GitHub read-only", "Repository metadata and pull requests", ["api.github.com"]],
  ["Billing APIs", "Stripe test mode and the internal billing service", ["api.stripe.com"]],
  ["Support tooling", "Zendesk and Linear for the support agents", ["acme.zendesk.com"]],
  ["Observability", "Datadog and Sentry read access", ["api.datadoghq.com", "sentry.io"]]
];

const bundles: TAgentVaultAccessBundleListItem[] = bundleSeeds.map(
  ([name, description, hostPatterns], index) => ({
    id: uuid("b1", index + 1),
    name,
    description,
    createdAt: at(-60 * 24 * 60),
    updatedAt: at(-60 * 24 * 7),
    serviceCount: hostPatterns.length + 1,
    memberCount: 3 + index,
    hostPatterns,
    servicesRequiringSetup: []
  })
);

const inline = (
  index: number,
  name: string,
  hostPattern: string
): TAgentVaultSessionInlineService => ({
  id: uuid("c1", index),
  name,
  type: AgentVaultServiceType.Http,
  serverUrl: null,
  transport: null,
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
  if (bundle !== null) return { id: bundles[bundle].id, name: bundles[bundle].name };
  return index === seeds.length - 1 ? { id: null, name: "Legacy billing" } : null;
};

const store = createFixtureStore<TAgentVaultSession[]>(
  seeds.map(([label, actor, onBehalfOf, bundle, services, status, created, expires], index) => ({
    id: uuid("d1", index + 1),
    label,
    actor,
    onBehalfOf,
    status,
    createdAt: at(-created),
    expiresAt: expires === null ? null : at(expires),
    revokedAt: status === Revoked ? at(-created + 30) : null,
    accessBundle: bundleRef(bundle, index),
    services
  }))
);

const displayName = (actor: TAgentVaultSessionActor) =>
  actor.type === AgentVaultMemberType.User
    ? [actor.firstName, actor.lastName].filter(Boolean).join(" ")
    : actor.name;

const isMine = (session: TAgentVaultSession) =>
  session.actor.id === sarah.id || session.onBehalfOf?.id === sarah.id;

export const agentVaultDemo: AgentVaultAdapter = {
  useProjectId: () => ({ data: "agent-vault", isPending: false, error: null }),
  useProjectPermission: () => ({
    data: { memberships: [{ roles: [{ role: "admin" }] }] },
    isPending: false,
    error: null
  }),
  useSessions: (_, { scope, statuses, search, limit = 20, offset = 0 }) => {
    const term = search?.toLowerCase();
    const matched = store
      .use()
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
  useAccessBundles: (_, { limit = 20, offset = 0 }) => ({
    data: { accessBundles: bundles.slice(offset, offset + limit), totalCount: bundles.length },
    isPending: false,
    error: null
  })
};
