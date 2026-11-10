import {
  AgentVaultCredentialType,
  AgentVaultDelegationScope,
  AgentVaultHttpMethod,
  AgentVaultMemberType,
  AgentVaultServiceType,
  AgentVaultSessionScope,
  AgentVaultSessionStatus
} from "@app/hooks/api/agentVault/enums";
import type {
  TAddAgentVaultProductMembersDTO,
  TAgentVaultAccessBundleListItem,
  TAgentVaultActorIdsDTO,
  TAgentVaultDelegationDetail,
  TAgentVaultProductMember,
  TAgentVaultSession,
  TAgentVaultSessionActor,
  TAgentVaultSessionInlineService,
  TChangeAgentVaultDelegationSubjectsDTO,
  TSetAgentVaultDelegationDTO,
  TUpdateAgentVaultMemberRolesDTO
} from "@app/hooks/api/agentVault/types";

import { createFixtureStore, fixtureMutation } from "../fixture-store";
import type { AgentVaultAdapter } from "./contract";

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

const SUPPORT_BUNDLE = 2;
const projectOf = (bundle: number | null, actor: TAgentVaultSessionActor) =>
  bundle === SUPPORT_BUNDLE || actor === machines[1] ? "support-agents" : "agent-platform";

const store = createFixtureStore<(TAgentVaultSession & { projectId: string })[]>(
  seeds.map(([label, actor, onBehalfOf, bundle, services, status, created, expires], index) => ({
    projectId: projectOf(bundle, actor),
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
const excluded = [{ id: uuid("b1", 2), name: "Billing APIs" }];

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
    const matched = store
      .use()
      .filter(
        (session) =>
          session.projectId === projectId &&
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
  useAccessBundles: (_, projectId, { limit = 20, offset = 0 }) => {
    const reachable = bundles.filter(
      (_bundle, index) => (index === SUPPORT_BUNDLE) === (projectId === "support-agents")
    );
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
    fixtureMutation(({ userIds = [], groupIds = [], role }: TAddAgentVaultProductMembersDTO) => {
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
      memberStore.update((members) => [...members, ...additions]);
      return {
        members: additions.map(({ type, id }) => ({ type, id, role, addedAt })),
        skipped
      };
    })(),
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
    })()
};
