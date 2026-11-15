import {
  AgentVaultCredentialType,
  AgentVaultHttpMethod,
  AgentVaultMcpTransport,
  AgentVaultMemberType,
  AgentVaultOauthAuthorizationStatus,
  AgentVaultOauthStatus,
  AgentVaultServiceType,
  AgentVaultSubstitutionSurface,
  AgentVaultTrafficPolicy,
  AgentVaultVariableReferenceField,
  AgentVaultVariableScope,
  isNativeServiceType
} from "@app/hooks/api/agentVault/enums";
import type {
  TAgentVaultAccessBundleListItem,
  TAgentVaultActorIdsDTO,
  TAgentVaultBundleSkill,
  TAgentVaultMember,
  TAgentVaultMemberProvidedField,
  TAgentVaultOauthAuthorization,
  TAgentVaultProductMember,
  TAgentVaultProjectService,
  TAgentVaultProxy,
  TAgentVaultService,
  TAgentVaultSkill,
  TAgentVaultSkillFile,
  TAgentVaultSkillVersion,
  TAgentVaultVariable,
  TAgentVaultVariableReference,
  TCreateAgentVaultServiceDTO,
  TUpdateAgentVaultServiceDTO
} from "@app/hooks/api/agentVault/types";

import { createFixtureStore } from "../fixture-store";
import type { AgentVaultResourcesAdapter } from "./contract";

const uuid = (prefix: string, index: number) =>
  `${prefix}000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
const loadedAt = Date.now();
const at = (minutes: number) => new Date(loadedAt + minutes * 60_000).toISOString();
const DAY = 24 * 60;

type User = Extract<TAgentVaultProductMember, { type: AgentVaultMemberType.User }>;
type Machine = Extract<TAgentVaultProductMember, { type: AgentVaultMemberType.MachineIdentity }>;
type Group = Extract<TAgentVaultProductMember, { type: AgentVaultMemberType.Group }>;

const user = (index: number, firstName: string, lastName: string, pending = false): User => ({
  type: AgentVaultMemberType.User,
  id: uuid("a1", index),
  username: `${firstName.toLowerCase()}@acme.dev`,
  email: `${firstName.toLowerCase()}@acme.dev`,
  firstName,
  lastName,
  isOrgMembershipPending: pending,
  role: index === 1 ? "admin" : "member",
  isActive: true,
  addedAt: at(-90 * DAY)
});

const machine = (index: number, name: string): Machine => ({
  type: AgentVaultMemberType.MachineIdentity,
  id: uuid("a2", index),
  name,
  isManagedByAgentVault: false,
  orgId: null,
  role: "member",
  isActive: true,
  addedAt: at(-60 * DAY)
});

const group = (index: number, name: string): Group => ({
  type: AgentVaultMemberType.Group,
  id: uuid("a3", index),
  name,
  role: "member",
  isActive: true,
  addedAt: at(-70 * DAY)
});

const actors: TAgentVaultProductMember[] = [
  user(1, "Sarah", "Lin"),
  user(2, "Marcus", "Webb"),
  user(3, "Priya", "Raman"),
  user(4, "Diego", "Alvarez"),
  user(5, "Hana", "Okafor", true),
  group(1, "platform-team"),
  group(2, "support-engineers"),
  machine(1, "ci-release-agent"),
  machine(2, "support-triage-bot"),
  machine(3, "nightly-eval-runner")
];

const CURRENT_USER_ID = uuid("a1", 1);

const bearer = (memberProvided = false) => ({
  type: AgentVaultCredentialType.Bearer as const,
  headerName: "Authorization",
  headerPrefix: "Bearer",
  memberProvidedFields: memberProvided
    ? [AgentVaultVariableReferenceField.CredentialValue as const]
    : []
});

const ref = (
  variableIndex: number,
  key: string,
  field:
    | AgentVaultVariableReferenceField.CredentialValue
    | AgentVaultVariableReferenceField.CredentialUsername
): TAgentVaultVariableReference => ({
  variableId: uuid("e1", variableIndex),
  key,
  field
});

const base = (index: number, name: string, description: string | null, createdDaysAgo: number) => ({
  id: uuid("c2", index),
  name,
  description,
  createdAt: at(-createdDaysAgo * DAY),
  updatedAt: at(-Math.floor(createdDaysAgo / 2) * DAY)
});

const seedServices: TAgentVaultService[] = [
  {
    ...base(1, "github-api", "Read repositories and open pull requests", 58),
    type: AgentVaultServiceType.Http,
    hostPattern: "api.github.com:443",
    allowedMethods: [AgentVaultHttpMethod.Get, AgentVaultHttpMethod.Post],
    allowedPathPrefixes: ["/repos", "/search"],
    credential: bearer(),
    customHeaders: [{ id: uuid("c3", 1), name: "X-GitHub-Api-Version", prefix: "" }],
    substitutions: [],
    variableReferences: [ref(1, "GITHUB_TOKEN", AgentVaultVariableReferenceField.CredentialValue)],
    hook: null
  },
  {
    ...base(2, "stripe-test", "Stripe in test mode for billing agents", 41),
    type: AgentVaultServiceType.Http,
    hostPattern: "api.stripe.com:443",
    allowedMethods: null,
    allowedPathPrefixes: null,
    credential: bearer(true),
    customHeaders: [],
    substitutions: [],
    variableReferences: [],
    personalValues: {
      isConfigured: false,
      fields: [
        {
          field: AgentVaultVariableReferenceField.CredentialValue,
          isSet: false,
          updatedAt: null,
          variableReferences: [],
          oauth: null
        }
      ]
    },
    hook: null
  },
  {
    ...base(3, "internal-billing", null, 33),
    type: AgentVaultServiceType.Http,
    hostPattern: "billing.internal.acme.dev:443, billing-admin.internal.acme.dev:443",
    allowedMethods: [AgentVaultHttpMethod.Get],
    allowedPathPrefixes: null,
    credential: { type: AgentVaultCredentialType.Passthrough },
    customHeaders: [],
    substitutions: [],
    variableReferences: [],
    hook: null
  },
  {
    ...base(4, "zendesk", "Read and update support tickets", 30),
    type: AgentVaultServiceType.Http,
    hostPattern: "acme.zendesk.com:443",
    allowedMethods: null,
    allowedPathPrefixes: ["/api/v2/tickets"],
    credential: {
      type: AgentVaultCredentialType.Basic,
      memberProvidedFields: []
    },
    customHeaders: [],
    substitutions: [
      {
        id: uuid("c4", 1),
        placeholder: "__ZENDESK_SUBDOMAIN__",
        surfaces: [AgentVaultSubstitutionSurface.Path]
      }
    ],
    variableReferences: [
      ref(4, "ZENDESK_EMAIL", AgentVaultVariableReferenceField.CredentialUsername),
      ref(5, "ZENDESK_API_TOKEN", AgentVaultVariableReferenceField.CredentialValue)
    ],
    hook: null
  },
  {
    ...base(5, "linear-mcp", "Create and triage issues for the platform team", 21),
    type: AgentVaultServiceType.Mcp,
    serverUrl: "https://mcp.linear.app/mcp",
    transport: AgentVaultMcpTransport.StreamableHttp,
    hostPattern: "mcp.linear.app:443",
    allowedTools: ["list_issues", "create_issue", "update_issue", "list_projects"],
    credential: {
      type: AgentVaultCredentialType.OAuth,
      memberProvidedFields: [],
      status: AgentVaultOauthStatus.Connected,
      issuer: "https://mcp.linear.app",
      grantedScopes: ["read", "write"],
      requiredScopes: ["read", "write"],
      expiresAt: at(30 * DAY),
      authorizedAt: at(-21 * DAY),
      lastError: null
    },
    customHeaders: [],
    variableReferences: [],
    hook: { url: "https://hooks.acme.dev/agent-vault/linear" }
  },
  {
    ...base(6, "datadog-us5", "Query metrics and logs for the US5 site", 18),
    type: AgentVaultServiceType.Http,
    hostPattern: "api.us5.datadoghq.com:443",
    allowedMethods: [AgentVaultHttpMethod.Get],
    allowedPathPrefixes: ["/api/v1/query", "/api/v2/logs"],
    credential: { ...bearer(), headerName: "DD-API-KEY", headerPrefix: "" },
    customHeaders: [{ id: uuid("c3", 2), name: "DD-APPLICATION-KEY", prefix: "" }],
    substitutions: [],
    variableReferences: [
      ref(2, "DATADOG_API_KEY", AgentVaultVariableReferenceField.CredentialValue)
    ],
    hook: { url: "https://hooks.acme.dev/agent-vault/datadog" }
  },
  {
    ...base(7, "sentry", null, 12),
    type: AgentVaultServiceType.Http,
    hostPattern: "sentry.io:443, *.sentry.io:443",
    allowedMethods: [AgentVaultHttpMethod.Get],
    allowedPathPrefixes: null,
    credential: bearer(),
    customHeaders: [],
    substitutions: [],
    variableReferences: [],
    hook: null
  },
  {
    ...base(8, "orders-db", "Read orders and refunds for support questions", 9),
    type: AgentVaultServiceType.Postgres,
    host: "orders.db.internal.acme.dev",
    port: 5432,
    database: "orders",
    tls: { enabled: true, verify: true, ca: null },
    credential: {
      type: AgentVaultCredentialType.Basic,
      memberProvidedFields: []
    },
    variableReferences: [
      ref(6, "ORDERS_DB_PASSWORD", AgentVaultVariableReferenceField.CredentialValue)
    ],
    hook: null
  },
  {
    ...base(9, "build-server", "Run builds and read their logs", 4),
    type: AgentVaultServiceType.Ssh,
    host: "build-01.internal.acme.dev",
    port: 22,
    credential: { type: AgentVaultCredentialType.SshKey, hasCertificate: true },
    variableReferences: [],
    hook: null
  },
  {
    ...base(10, "notion-mcp", "Search and edit the team wiki", 2),
    type: AgentVaultServiceType.Mcp,
    serverUrl: "https://mcp.notion.com/mcp",
    transport: AgentVaultMcpTransport.StreamableHttp,
    hostPattern: "mcp.notion.com:443",
    allowedTools: null,
    credential: {
      type: AgentVaultCredentialType.OAuth,
      memberProvidedFields: [AgentVaultVariableReferenceField.CredentialValue],
      status: AgentVaultOauthStatus.Connected,
      issuer: "https://mcp.notion.com",
      grantedScopes: [],
      requiredScopes: []
    },
    customHeaders: [],
    variableReferences: [],
    personalValues: {
      isConfigured: false,
      fields: [
        {
          field: AgentVaultVariableReferenceField.CredentialValue,
          isSet: false,
          updatedAt: null,
          variableReferences: [],
          oauth: null
        }
      ]
    },
    hook: null
  }
];

type BundleSeed = {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  serviceIds: string[];
  skillIds: string[];
  members: TAgentVaultMember[];
};

const member = (actor: TAgentVaultProductMember, grantedDaysAgo: number): TAgentVaultMember => {
  const grantedAt = at(-grantedDaysAgo * DAY);
  if (actor.type === AgentVaultMemberType.User) {
    const { role, isActive, addedAt, ...rest } = actor;
    return { ...rest, grantedAt };
  }
  return { type: actor.type, id: actor.id, name: actor.name, grantedAt };
};

const serviceId = (index: number) => uuid("c2", index);
const skillId = (index: number) => uuid("f1", index);

const seedBundles: BundleSeed[] = [
  {
    id: uuid("b1", 1),
    name: "github-read-only",
    description: "Repository metadata and pull requests",
    createdAt: at(-60 * DAY),
    updatedAt: at(-7 * DAY),
    serviceIds: [serviceId(1), serviceId(10)],
    skillIds: [skillId(2)],
    members: [member(actors[0], 50), member(actors[5], 45), member(actors[7], 40)]
  },
  {
    id: uuid("b1", 2),
    name: "billing-apis",
    description: "Stripe test mode, the internal billing service and the orders database",
    createdAt: at(-45 * DAY),
    updatedAt: at(-3 * DAY),
    serviceIds: [serviceId(2), serviceId(3), serviceId(8)],
    skillIds: [skillId(3)],
    members: [
      member(actors[0], 30),
      member(actors[1], 28),
      member(actors[2], 20),
      member(actors[8], 10)
    ]
  },
  {
    id: uuid("b1", 3),
    name: "support-tooling",
    description: "Zendesk and Linear for the support agents",
    createdAt: at(-32 * DAY),
    updatedAt: at(-2 * DAY),
    serviceIds: [serviceId(4), serviceId(5)],
    skillIds: [skillId(1)],
    members: [member(actors[6], 25), member(actors[8], 25)]
  },
  {
    id: uuid("b1", 4),
    name: "observability",
    description: "Datadog and Sentry read access",
    createdAt: at(-20 * DAY),
    updatedAt: at(-1 * DAY),
    serviceIds: [serviceId(6), serviceId(7)],
    skillIds: [skillId(1)],
    members: [member(actors[0], 15), member(actors[3], 14), member(actors[9], 2)]
  },
  {
    id: uuid("b1", 5),
    name: "build-pipeline",
    description: null,
    createdAt: at(-3 * DAY),
    updatedAt: at(-3 * DAY),
    serviceIds: [serviceId(9)],
    skillIds: [],
    members: []
  }
];

const seedVariables: TAgentVaultVariable[] = [
  ["GITHUB_TOKEN", AgentVaultVariableScope.Global, 1],
  ["DATADOG_API_KEY", AgentVaultVariableScope.Global, 2],
  ["DATADOG_APP_KEY", AgentVaultVariableScope.Global, 3],
  ["ZENDESK_EMAIL", AgentVaultVariableScope.Global, 4],
  ["ZENDESK_API_TOKEN", AgentVaultVariableScope.Global, 5],
  ["ORDERS_DB_PASSWORD", AgentVaultVariableScope.Global, 6],
  ["SLACK_ALERTS_WEBHOOK_PATH", AgentVaultVariableScope.Global, 7],
  ["MY_STRIPE_TEST_KEY", AgentVaultVariableScope.Personal, 8]
].map(([key, scope, index]) => ({
  id: uuid("e1", index as number),
  key: key as string,
  scope: scope as AgentVaultVariableScope,
  usedByServices: [],
  createdAt: at(-(40 - (index as number) * 3) * DAY),
  updatedAt: at(-(index as number) * DAY)
}));

const text = (value: string) => btoa(unescape(encodeURIComponent(value)));

const skillFiles = (name: string, description: string, extra: TAgentVaultSkillFile[] = []) => [
  {
    path: "SKILL.md",
    mode: "0644" as const,
    contentBase64: text(
      `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n\nFollow these steps when the agent is asked to ${description.toLowerCase()}.\n`
    )
  },
  ...extra
];

type SkillSeed = {
  skill: Omit<TAgentVaultSkill, "accessBundles">;
  versions: (TAgentVaultSkillVersion & { files: TAgentVaultSkillFile[] })[];
};

const skillSeed = (
  index: number,
  name: string,
  description: string,
  versionCount: number,
  extra: TAgentVaultSkillFile[] = []
): SkillSeed => {
  const versions = Array.from({ length: versionCount }, (_, versionIndex) => {
    const files = skillFiles(name, description, versionIndex === 0 ? [] : extra);
    return {
      id: uuid(`f${index + 1}`, versionIndex + 1),
      version: versionIndex + 1,
      sha256: `${String(index).repeat(8)}${String(versionIndex).repeat(56)}`.slice(0, 64),
      sizeBytes: files.reduce(
        (sum, file) => sum + Math.floor((file.contentBase64.length * 3) / 4),
        0
      ),
      fileCount: files.length,
      createdAt: at(-(30 - versionIndex * 6 - index) * DAY),
      files
    };
  });
  const latest = versions[versions.length - 1];
  return {
    skill: {
      id: skillId(index),
      name,
      description,
      latestVersion: latest.version,
      createdAt: versions[0].createdAt,
      updatedAt: latest.createdAt
    },
    versions
  };
};

const seedSkills: SkillSeed[] = [
  skillSeed(
    1,
    "incident-triage",
    "Triage a production incident from alerts and recent deploys",
    3,
    [
      {
        path: "scripts/collect-context.sh",
        mode: "0755",
        contentBase64: text('#!/bin/sh\necho "Collecting recent deploys and alerts"\n')
      }
    ]
  ),
  skillSeed(2, "release-notes", "Draft release notes from merged pull requests", 2, [
    {
      path: "templates/notes.md",
      mode: "0644",
      contentBase64: text("## Highlights\n\n## Fixes\n")
    }
  ]),
  skillSeed(3, "refund-lookup", "Look up an order and its refunds for a support question", 1)
];

const seedProxies: TAgentVaultProxy[] = [
  {
    id: uuid("d1", 1),
    name: "prod-us-east",
    description: "Kubernetes cluster for production agents",
    heartbeat: at(-1),
    isHealthy: true,
    rootCaFingerprint: "3F:1C:9A:22:7B:E0:41:5D:AA:08:6C:93:F2:17:B4:0E",
    rootCaExpiresAt: at(300 * DAY),
    trafficPolicy: AgentVaultTrafficPolicy.ServiceHosts,
    allowedHosts: null,
    pollInterval: 60,
    createdAt: at(-80 * DAY)
  },
  {
    id: uuid("d1", 2),
    name: "staging",
    description: null,
    heartbeat: at(-3 * DAY),
    isHealthy: false,
    rootCaFingerprint: "A0:5E:77:C1:09:3B:D4:62:18:F9:2A:6E:B3:40:7D:91",
    rootCaExpiresAt: at(120 * DAY),
    trafficPolicy: AgentVaultTrafficPolicy.AnyHost,
    allowedHosts: "*.acme.dev, registry.npmjs.org",
    pollInterval: 30,
    createdAt: at(-50 * DAY)
  },
  {
    id: uuid("d1", 3),
    name: "dev-laptop-sarah",
    description: "Local Docker proxy for testing sessions",
    heartbeat: null,
    isHealthy: false,
    rootCaFingerprint: null,
    rootCaExpiresAt: null,
    trafficPolicy: AgentVaultTrafficPolicy.ServiceHosts,
    allowedHosts: null,
    pollInterval: 60,
    createdAt: at(-2 * DAY)
  }
];

type State = {
  bundles: BundleSeed[];
  services: TAgentVaultService[];
  variables: TAgentVaultVariable[];
  skills: SkillSeed[];
  proxies: TAgentVaultProxy[];
  counter: number;
};

const store = createFixtureStore<State>({
  bundles: seedBundles,
  services: seedServices,
  variables: seedVariables,
  skills: seedSkills,
  proxies: seedProxies,
  counter: 100
});

const caches = new WeakMap<State, Map<string, unknown>>();
const cached = <T>(state: State, key: string, compute: () => T): T => {
  let map = caches.get(state);
  if (!map) {
    map = new Map();
    caches.set(state, map);
  }
  if (!map.has(key)) map.set(key, compute());
  return map.get(key) as T;
};

const query =
  <TArgs extends unknown[], TData>(
    name: string,
    compute: (state: State, ...args: TArgs) => TData
  ) =>
  (...args: TArgs) => {
    const state = store.use();
    const data = cached(state, `${name}:${JSON.stringify(args)}`, () => compute(state, ...args));
    return { data, isPending: false, error: null, isFetching: false };
  };

const mutation =
  <TVariables, TData>(
    run: (variables: TVariables, state: State) => { state: State; result: TData }
  ) =>
  () => ({
    isPending: false,
    mutateAsync: async (variables: TVariables) => {
      const { state, result } = run(variables, store.get());
      store.update(() => state);
      return result;
    }
  });

const nextId = (state: State, prefix: string) => uuid(prefix, state.counter + 1);
const bump = (state: State): State => ({
  ...state,
  counter: state.counter + 1
});

const notFound = (what: string) => {
  throw new Error(`${what} not found`);
};

const matches = (search: string | undefined, ...texts: (string | null | undefined)[]) => {
  const term = search?.trim().toLowerCase();
  if (!term) return true;
  return texts.some((value) => value?.toLowerCase().includes(term));
};

const page = <T>(rows: T[], limit = 20, offset = 0) => rows.slice(offset, offset + limit);

const hostPatternsOf = (service: TAgentVaultService) =>
  service.type === AgentVaultServiceType.Http || service.type === AgentVaultServiceType.Mcp
    ? service.hostPattern.split(",").map((host) => host.trim())
    : [];

const bundlesOf = (state: State, id: string) =>
  state.bundles
    .filter((bundle) => bundle.serviceIds.includes(id))
    .map(({ id: bundleId, name }) => ({ id: bundleId, name }));

const projectService = (state: State, service: TAgentVaultService): TAgentVaultProjectService => ({
  ...service,
  accessBundles: bundlesOf(state, service.id)
});

const servicesOf = (state: State, bundle: BundleSeed) =>
  bundle.serviceIds
    .map((id) => state.services.find((service) => service.id === id))
    .filter((service): service is TAgentVaultService => Boolean(service));

const needsSetup = (service: TAgentVaultService) =>
  Boolean(service.personalValues && !service.personalValues.isConfigured);

const listItem = (state: State, bundle: BundleSeed): TAgentVaultAccessBundleListItem => {
  const services = servicesOf(state, bundle);
  return {
    id: bundle.id,
    name: bundle.name,
    description: bundle.description,
    createdAt: bundle.createdAt,
    updatedAt: bundle.updatedAt,
    serviceCount: services.length,
    memberCount: bundle.members.length,
    hostPatterns: [...new Set(services.flatMap(hostPatternsOf))],
    nativeServices: services
      .filter((service) => isNativeServiceType(service.type))
      .map((service) => ({ name: service.name, type: service.type })),
    servicesRequiringSetup: services
      .filter(needsSetup)
      .map((service) => ({ id: service.id, name: service.name }))
  };
};

const bundleSkill = ({ skill }: SkillSeed): TAgentVaultBundleSkill => ({
  id: skill.id,
  name: skill.name,
  description: skill.description,
  latestVersion: skill.latestVersion
});

const skillWithBundles = (state: State, seed: SkillSeed): TAgentVaultSkill => ({
  ...seed.skill,
  accessBundles: state.bundles
    .filter((bundle) => bundle.skillIds.includes(seed.skill.id))
    .map(({ id, name }) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name))
});

const withUsedBy = (state: State, variable: TAgentVaultVariable): TAgentVaultVariable => ({
  ...variable,
  usedByServices: state.services
    .filter((service) =>
      service.variableReferences?.some((reference) => reference.variableId === variable.id)
    )
    .map((service) => ({
      id: service.id,
      name: service.name,
      type: service.type,
      hostPattern:
        service.type === AgentVaultServiceType.Http || service.type === AgentVaultServiceType.Mcp
          ? service.hostPattern
          : null,
      accessBundles: bundlesOf(state, service.id)
    }))
});

const actorIdsOf = ({
  userIds = [],
  groupIds = [],
  machineIdentityIds = []
}: TAgentVaultActorIdsDTO) => new Set([...userIds, ...groupIds, ...machineIdentityIds]);

const memberName = (actor: TAgentVaultMember | TAgentVaultProductMember) =>
  actor.type === AgentVaultMemberType.User
    ? [actor.firstName, actor.lastName, actor.email].filter(Boolean).join(" ")
    : actor.name;

const updateBundle = (state: State, id: string, change: (bundle: BundleSeed) => BundleSeed) => ({
  ...state,
  bundles: state.bundles.map((bundle) =>
    bundle.id === id ? { ...change(bundle), updatedAt: new Date().toISOString() } : bundle
  )
});

const httpCredentialOf = (
  credential: Extract<
    TCreateAgentVaultServiceDTO,
    { type: AgentVaultServiceType.Http }
  >["credential"]
) => {
  if (credential.type === AgentVaultCredentialType.Bearer)
    return {
      type: credential.type,
      headerName: credential.headerName ?? "Authorization",
      headerPrefix: credential.headerPrefix ?? "Bearer",
      memberProvidedFields: credential.memberProvidedFields ?? []
    };
  if (credential.type === AgentVaultCredentialType.Basic)
    return { type: credential.type, memberProvidedFields: credential.memberProvidedFields ?? [] };
  return { type: AgentVaultCredentialType.Passthrough as const };
};

const createdService = (
  state: State,
  { accessBundleIds, hook, ...dto }: TCreateAgentVaultServiceDTO
): TAgentVaultService => {
  const now = new Date().toISOString();
  const common = {
    id: nextId(state, "c2"),
    name: dto.name,
    description: dto.description ?? null,
    createdAt: now,
    updatedAt: now,
    variableReferences: [],
    hook: hook ? { url: hook.url } : null
  };
  if (dto.type === AgentVaultServiceType.Http) {
    const { credential } = dto;
    return {
      ...common,
      type: dto.type,
      hostPattern: dto.hostPattern,
      allowedMethods: dto.allowedMethods ?? null,
      allowedPathPrefixes: dto.allowedPathPrefixes ?? null,
      credential: httpCredentialOf(credential),
      customHeaders: (dto.customHeaders ?? []).map((header, index) => ({
        id: uuid("c3", state.counter * 10 + index),
        name: header.name,
        prefix: header.prefix ?? ""
      })),
      substitutions: (dto.substitutions ?? []).map((substitution, index) => ({
        id: uuid("c4", state.counter * 10 + index),
        placeholder: substitution.placeholder,
        surfaces: substitution.surfaces
      }))
    };
  }
  if (dto.type === AgentVaultServiceType.Mcp) {
    const url = new URL(dto.serverUrl);
    return {
      ...common,
      type: dto.type,
      serverUrl: dto.serverUrl,
      transport: dto.transport,
      hostPattern: `${url.hostname}:${url.port || 443}`,
      allowedTools: dto.allowedTools ?? null,
      credential:
        dto.credential.type === AgentVaultCredentialType.Bearer
          ? {
              type: AgentVaultCredentialType.Bearer,
              headerName: dto.credential.headerName ?? "Authorization",
              headerPrefix: dto.credential.headerPrefix ?? "Bearer",
              memberProvidedFields: dto.credential.memberProvidedFields ?? []
            }
          : {
              type: AgentVaultCredentialType.OAuth,
              memberProvidedFields: dto.credential.memberProvidedFields ?? [],
              status: AgentVaultOauthStatus.Connected,
              issuer: url.origin,
              grantedScopes: [],
              requiredScopes: []
            },
      customHeaders: (dto.customHeaders ?? []).map((header, index) => ({
        id: uuid("c3", state.counter * 10 + index),
        name: header.name,
        prefix: header.prefix ?? ""
      }))
    };
  }
  if (dto.type === AgentVaultServiceType.Ssh) {
    return {
      ...common,
      type: dto.type,
      host: dto.host,
      port: dto.port ?? 22,
      credential:
        dto.credential.type === AgentVaultCredentialType.SshKey
          ? {
              type: AgentVaultCredentialType.SshKey,
              hasCertificate: Boolean(dto.credential.certificate)
            }
          : {
              type: AgentVaultCredentialType.Basic,
              memberProvidedFields: dto.credential.memberProvidedFields ?? []
            }
    };
  }
  return {
    ...common,
    type: dto.type,
    host: dto.host,
    port: dto.port ?? (dto.type === AgentVaultServiceType.Postgres ? 5432 : 3306),
    database: dto.database,
    tls: {
      enabled: dto.tls?.enabled ?? true,
      verify: dto.tls?.verify ?? true,
      ca: dto.tls?.ca ?? null
    },
    credential: {
      type: AgentVaultCredentialType.Basic,
      memberProvidedFields: dto.credential.memberProvidedFields ?? []
    }
  };
};

const skillLabels = (
  files: TAgentVaultSkillFile[],
  fallback: { name: string; description: string }
) => {
  const manifest = files.find((file) => file.path === "SKILL.md");
  const body = manifest ? decodeURIComponent(escape(atob(manifest.contentBase64))) : "";
  return {
    name: /^name:\s*(.+)$/m.exec(body)?.[1]?.trim() ?? fallback.name,
    description: /^description:\s*(.+)$/m.exec(body)?.[1]?.trim() ?? fallback.description
  };
};

const updatedCredential = (
  current: TAgentVaultService["credential"],
  credential: NonNullable<TUpdateAgentVaultServiceDTO["credential"]>
): TAgentVaultService["credential"] => {
  const dto = credential as {
    type: AgentVaultCredentialType;
    headerName?: string;
    headerPrefix?: string;
    memberProvidedFields?: TAgentVaultMemberProvidedField[];
    certificate?: string | null;
  };
  const stored: Record<string, unknown> = current.type === dto.type ? { ...current } : {};
  const memberProvidedFields =
    dto.memberProvidedFields ??
    (stored.memberProvidedFields as TAgentVaultMemberProvidedField[] | undefined) ??
    [];
  if (dto.type === AgentVaultCredentialType.Passthrough) return { type: dto.type };
  if (dto.type === AgentVaultCredentialType.SshKey)
    return {
      type: dto.type,
      hasCertificate:
        dto.certificate === undefined ? Boolean(stored.hasCertificate) : Boolean(dto.certificate)
    };
  if (dto.type === AgentVaultCredentialType.Bearer)
    return {
      ...stored,
      type: dto.type,
      headerName: dto.headerName ?? stored.headerName ?? "Authorization",
      headerPrefix: dto.headerPrefix ?? stored.headerPrefix ?? "Bearer",
      memberProvidedFields
    } as TAgentVaultService["credential"];
  if (dto.type === AgentVaultCredentialType.OAuth)
    return {
      status: AgentVaultOauthStatus.Connected,
      issuer: "",
      grantedScopes: [],
      requiredScopes: [],
      ...stored,
      type: dto.type,
      memberProvidedFields
    } as TAgentVaultService["credential"];
  return { type: dto.type, memberProvidedFields } as TAgentVaultService["credential"];
};

const updatedService = (
  service: TAgentVaultService,
  { serviceId: _id, type: _type, hook, credential, ...dto }: TUpdateAgentVaultServiceDTO
): TAgentVaultService => {
  const next = { ...service } as Record<string, unknown>;
  Object.entries(dto).forEach(([key, value]) => {
    if (value === undefined) return;
    if (key === "customHeaders" || key === "substitutions") return;
    if (key === "hostPattern" && service.type === AgentVaultServiceType.Mcp) return;
    next[key] = value;
  });
  if (dto.customHeaders && "customHeaders" in service) {
    next.customHeaders = dto.customHeaders.map((header, index) => ({
      id: header.id ?? uuid("c3", 900 + index),
      name: header.name,
      prefix: header.prefix ?? ""
    }));
  }
  if (dto.substitutions && "substitutions" in service) {
    next.substitutions = dto.substitutions.map((substitution, index) => ({
      id: substitution.id ?? uuid("c4", 900 + index),
      placeholder: substitution.placeholder,
      surfaces: substitution.surfaces
    }));
  }
  if (hook !== undefined) next.hook = hook ? { url: hook.url } : null;
  if (credential) next.credential = updatedCredential(service.credential, credential);
  next.updatedAt = new Date().toISOString();
  return next as TAgentVaultService;
};

const sortBy = <T>(rows: T[], compare: (a: T, b: T) => number, direction?: "asc" | "desc") => {
  const sorted = [...rows].sort(compare);
  return direction === "desc" ? sorted.reverse() : sorted;
};

const DEMO_OAUTH_SCOPES = ["read", "write"];

const serverUrlOfDemo = (service: TAgentVaultService) =>
  service.type === AgentVaultServiceType.Mcp ? new URL(service.serverUrl).origin : "";

const demoAuthorizations = new Map<string, TAgentVaultOauthAuthorization>();
const demoAuthorization = (id: string) => {
  const existing = demoAuthorizations.get(id);
  if (existing) return existing;
  const created = {
    id,
    status: AgentVaultOauthAuthorizationStatus.Authorized,
    error: null,
    scopes: DEMO_OAUTH_SCOPES
  };
  demoAuthorizations.set(id, created);
  return created;
};

export const agentVaultResourcesDemo: AgentVaultResourcesAdapter = {
  useAccessBundles: query("accessBundles", (state, _projectId: string, params = {}) => {
    const rows = state.bundles
      .map((bundle) => listItem(state, bundle))
      .filter((bundle) => matches(params.search, bundle.name, bundle.description))
      .filter((bundle) => !params.requiresSetup || bundle.servicesRequiringSetup.length > 0)
      .filter(
        (bundle) =>
          params.granted === undefined ||
          state.bundles
            .find((seed) => seed.id === bundle.id)
            ?.members.some((granted) => granted.id === CURRENT_USER_ID) === params.granted
      );
    const sorted = sortBy(
      rows,
      (a, b) => {
        if (params.orderBy === "name") return a.name.localeCompare(b.name);
        if (params.orderBy === "serviceCount") return a.serviceCount - b.serviceCount;
        return a.createdAt.localeCompare(b.createdAt);
      },
      params.orderDirection ?? "desc"
    );
    return {
      accessBundles: page(sorted, params.limit, params.offset),
      totalCount: rows.length
    };
  }),
  useAccessBundle: query("accessBundle", (state, _projectId: string, accessBundleId: string) => {
    const bundle = state.bundles.find((seed) => seed.id === accessBundleId);
    if (!bundle) return undefined as never;
    return {
      id: bundle.id,
      name: bundle.name,
      description: bundle.description,
      createdAt: bundle.createdAt,
      updatedAt: bundle.updatedAt,
      services: servicesOf(state, bundle)
    };
  }),
  useCreateAccessBundle: mutation((dto: { name: string; description?: string }, state) => {
    if (state.bundles.some((bundle) => bundle.name === dto.name))
      throw new Error(`An access bundle named ${dto.name} already exists in this project.`);
    const now = new Date().toISOString();
    const created: BundleSeed = {
      id: nextId(state, "b1"),
      name: dto.name,
      description: dto.description ?? null,
      createdAt: now,
      updatedAt: now,
      serviceIds: [],
      skillIds: [],
      members: []
    };
    const { serviceIds, skillIds, members, ...result } = created;
    return {
      state: bump({ ...state, bundles: [...state.bundles, created] }),
      result
    };
  }),
  useUpdateAccessBundle: mutation(
    (
      dto: {
        accessBundleId: string;
        name?: string;
        description?: string | null;
      },
      state
    ) => {
      const next = updateBundle(state, dto.accessBundleId, (bundle) => ({
        ...bundle,
        name: dto.name ?? bundle.name,
        description: dto.description === undefined ? bundle.description : dto.description
      }));
      const bundle =
        next.bundles.find((seed) => seed.id === dto.accessBundleId) ?? notFound("Access bundle");
      const { serviceIds, skillIds, members, ...result } = bundle;
      return { state: next, result };
    }
  ),
  useDeleteAccessBundle: mutation((accessBundleId: string, state) => {
    const bundle =
      state.bundles.find((seed) => seed.id === accessBundleId) ?? notFound("Access bundle");
    const { serviceIds, skillIds, members, ...result } = bundle;
    return {
      state: {
        ...state,
        bundles: state.bundles.filter((seed) => seed.id !== accessBundleId)
      },
      result
    };
  }),
  useAccessBundleMembers: query(
    "accessBundleMembers",
    (state, _projectId: string, accessBundleId: string, params = {}) => {
      const rows = (state.bundles.find((bundle) => bundle.id === accessBundleId)?.members ?? [])
        .filter((granted) => !params.actorType || granted.type === params.actorType)
        .filter((granted) => matches(params.search, memberName(granted)));
      return {
        members: page(rows, params.limit, params.offset),
        totalCount: rows.length
      };
    }
  ),
  useAvailableAccessBundleMembers: query(
    "availableAccessBundleMembers",
    (state, _projectId: string, accessBundleId: string, params = {}) => {
      const granted = new Set(
        state.bundles.find((bundle) => bundle.id === accessBundleId)?.members.map(({ id }) => id)
      );
      const rows = actors
        .filter((actor) => !granted.has(actor.id))
        .filter((actor) => !params.actorType || actor.type === params.actorType)
        .filter((actor) => matches(params.search, memberName(actor)));
      return {
        members: page(rows, params.limit ?? 50, params.offset),
        totalCount: rows.length
      };
    }
  ),
  useAddAccessBundleMembers: mutation(
    ({ accessBundleId, ...ids }: { accessBundleId: string } & TAgentVaultActorIdsDTO, state) => {
      const wanted = actorIdsOf(ids);
      const added = actors.filter((actor) => wanted.has(actor.id));
      const grantedAt = new Date().toISOString();
      return {
        state: updateBundle(state, accessBundleId, (bundle) => ({
          ...bundle,
          members: [
            ...bundle.members,
            ...added
              .filter((actor) => !bundle.members.some((existing) => existing.id === actor.id))
              .map((actor) => ({ ...member(actor, 0), grantedAt }))
          ]
        })),
        result: {
          members: added.map((actor) => ({
            type: actor.type,
            id: actor.id,
            grantedAt
          })),
          skipped: []
        }
      };
    }
  ),
  useRevokeAccessBundleMembers: mutation(
    ({ accessBundleId, ...ids }: { accessBundleId: string } & TAgentVaultActorIdsDTO, state) => {
      const revoked = actorIdsOf(ids);
      const bundle =
        state.bundles.find((seed) => seed.id === accessBundleId) ?? notFound("Access bundle");
      return {
        state: updateBundle(state, accessBundleId, (seed) => ({
          ...seed,
          members: seed.members.filter((granted) => !revoked.has(granted.id))
        })),
        result: {
          members: bundle.members
            .filter((granted) => revoked.has(granted.id))
            .map(({ type, id }) => ({ type, id })),
          skipped: []
        }
      };
    }
  ),

  useServices: query("services", (state, _projectId: string, params = {}) => {
    const rows = state.services
      .filter((service) =>
        matches(params.search, service.name, service.description, hostPatternsOf(service).join(" "))
      )
      .filter(
        (service) =>
          params.requiresSetup === undefined || needsSetup(service) === params.requiresSetup
      )
      .filter(
        (service) =>
          !params.granted ||
          state.bundles.some(
            (bundle) =>
              bundle.serviceIds.includes(service.id) &&
              bundle.members.some((granted) => granted.id === CURRENT_USER_ID)
          )
      );
    const sorted = sortBy(
      rows,
      (a, b) => {
        if (params.orderBy === "type") return a.type.localeCompare(b.type);
        if (params.orderBy === "createdAt") return a.createdAt.localeCompare(b.createdAt);
        return a.name.localeCompare(b.name);
      },
      params.orderDirection
    );
    return {
      services: page(sorted, params.limit, params.offset).map((service) =>
        projectService(state, service)
      ),
      totalCount: rows.length
    };
  }),
  useCreateService: mutation((dto: TCreateAgentVaultServiceDTO, state) => {
    if (state.services.some((service) => service.name === dto.name))
      throw new Error(`A service named ${dto.name} already exists in this project.`);
    const created = createdService(state, dto);
    let next: State = bump({
      ...state,
      services: [...state.services, created]
    });
    (dto.accessBundleIds ?? []).forEach((accessBundleId) => {
      next = updateBundle(next, accessBundleId, (bundle) => ({
        ...bundle,
        serviceIds: [...bundle.serviceIds, created.id]
      }));
    });
    return { state: next, result: { service: projectService(next, created) } };
  }),
  useUpdateService: mutation((dto: TUpdateAgentVaultServiceDTO, state) => {
    const service = state.services.find((seed) => seed.id === dto.serviceId) ?? notFound("Service");
    const updated = updatedService(service, dto);
    const next = {
      ...state,
      services: state.services.map((seed) => (seed.id === dto.serviceId ? updated : seed))
    };
    return { state: next, result: { service: projectService(next, updated) } };
  }),
  useDeleteService: mutation(({ serviceId: id }: { serviceId: string }, state) => {
    const service = state.services.find((seed) => seed.id === id) ?? notFound("Service");
    return {
      state: {
        ...state,
        services: state.services.filter((seed) => seed.id !== id),
        bundles: state.bundles.map((bundle) => ({
          ...bundle,
          serviceIds: bundle.serviceIds.filter((existing) => existing !== id)
        }))
      },
      result: projectService(state, service)
    };
  }),
  useAddAccessBundleServices: mutation(
    ({ accessBundleId, serviceIds }: { accessBundleId: string; serviceIds: string[] }, state) => {
      const next = updateBundle(state, accessBundleId, (bundle) => ({
        ...bundle,
        serviceIds: [...new Set([...bundle.serviceIds, ...serviceIds])]
      }));
      const added = new Set(serviceIds);
      return {
        state: next,
        result: {
          services: next.services
            .filter((service) => added.has(service.id))
            .map((service) => projectService(next, service)),
          skipped: []
        }
      };
    }
  ),
  useRemoveAccessBundleService: mutation(
    ({ accessBundleId, serviceId: id }: { accessBundleId: string; serviceId: string }, state) => {
      const service = state.services.find((seed) => seed.id === id) ?? notFound("Service");
      const next = updateBundle(state, accessBundleId, (bundle) => ({
        ...bundle,
        serviceIds: bundle.serviceIds.filter((existing) => existing !== id)
      }));
      return { state: next, result: projectService(next, service) };
    }
  ),
  useListMcpTools: mutation((_dto: { serverUrl: string }, state) => ({
    state,
    result: [
      { name: "list_issues", description: "List issues that match a filter" },
      { name: "create_issue", description: "Create an issue in a team" },
      { name: "update_issue", description: "Change an issue's state, assignee or labels" },
      { name: "list_projects", description: "List the projects in the workspace" },
      { name: "delete_issue", description: "Delete an issue" }
    ]
  })),
  useSetPersonalValues: mutation(
    (
      { serviceId: id, values }: { serviceId: string; values: { field: string; value: string }[] },
      state
    ) => {
      const service = state.services.find((seed) => seed.id === id) ?? notFound("Service");
      const now = new Date().toISOString();
      const personalValues = {
        isConfigured: true,
        fields: (service.personalValues?.fields ?? []).map((field) => ({
          ...field,
          isSet: field.isSet || values.some((value) => value.field === field.field && value.value),
          updatedAt: now
        }))
      };
      return {
        state: {
          ...state,
          services: state.services.map((seed) =>
            seed.id === id ? { ...seed, personalValues } : seed
          )
        },
        result: personalValues
      };
    }
  ),
  useDeletePersonalValues: mutation(({ serviceId: id }: { serviceId: string }, state) => {
    const service = state.services.find((seed) => seed.id === id) ?? notFound("Service");
    const personalValues = {
      isConfigured: false,
      fields: (service.personalValues?.fields ?? []).map((field) => ({
        ...field,
        isSet: false,
        updatedAt: null,
        variableReferences: [],
        oauth: null
      }))
    };
    return {
      state: {
        ...state,
        services: state.services.map((seed) =>
          seed.id === id ? { ...seed, personalValues } : seed
        )
      },
      result: personalValues
    };
  }),

  useConnectPersonalOauth: mutation(
    ({ serviceId: id }: { serviceId: string; authorizationId: string }, state) => {
      const service = state.services.find((seed) => seed.id === id) ?? notFound("Service");
      const now = new Date().toISOString();
      const personalValues = {
        isConfigured: true,
        fields: (service.personalValues?.fields ?? []).map((field) => ({
          ...field,
          isSet: true,
          updatedAt: now,
          oauth: {
            status: AgentVaultOauthStatus.Connected,
            issuer: serverUrlOfDemo(service),
            grantedScopes: DEMO_OAUTH_SCOPES,
            requiredScopes: DEMO_OAUTH_SCOPES,
            expiresAt: null,
            authorizedAt: now,
            lastError: null
          }
        }))
      };
      return {
        state: {
          ...state,
          services: state.services.map((seed) =>
            seed.id === id ? { ...seed, personalValues } : seed
          )
        },
        result: personalValues
      };
    }
  ),
  useCreateOauthAuthorization: mutation((_dto: { serverUrl: string }, state) => ({
    state: bump(state),
    result: {
      registrationRequired: false,
      oauthAdvertised: true,
      redirectUri: `${window.location.origin}/agent-vault/oauth/callback`,
      authorization: { id: nextId(state, "d9"), authorizeUrl: "about:blank" }
    }
  })),
  useOauthAuthorization: (authorizationId: string) => ({
    data: authorizationId ? demoAuthorization(authorizationId) : undefined,
    isPending: false,
    error: null
  }),

  useVariables: query("variables", (state, _projectId: string, params = {}) => {
    const keys = params.keys && new Set(params.keys);
    const rows = state.variables
      .filter((variable) => (params.scope ?? AgentVaultVariableScope.Global) === variable.scope)
      .filter((variable) => matches(params.search, variable.key))
      .filter((variable) => !keys || keys.has(variable.key))
      .map((variable) => withUsedBy(state, variable));
    const sorted = sortBy(
      rows,
      (a, b) =>
        params.orderBy === "serviceCount"
          ? a.usedByServices.length - b.usedByServices.length
          : a.key.localeCompare(b.key),
      params.orderDirection
    );
    return { variables: page(sorted, params.limit, params.offset), totalCount: rows.length };
  }),
  useVariableKeyStatus: (_projectId, keys, { scope = AgentVaultVariableScope.Global } = {}) => {
    const state = store.use();
    return cached(state, `keyStatus:${scope}:${keys.join(",")}`, () => {
      const known = new Set(
        state.variables.filter((variable) => variable.scope === scope).map(({ key }) => key)
      );
      return {
        existing: new Set(keys.filter((key) => known.has(key))) as ReadonlySet<string>,
        missing: new Set(keys.filter((key) => !known.has(key))) as ReadonlySet<string>
      };
    });
  },
  useCreateVariable: mutation(
    (dto: { scope: AgentVaultVariableScope; key: string; value: string }, state) => {
      if (
        state.variables.some((variable) => variable.key === dto.key && variable.scope === dto.scope)
      )
        throw new Error(`A variable with the key ${dto.key} already exists.`);
      const now = new Date().toISOString();
      const created: TAgentVaultVariable = {
        id: nextId(state, "e1"),
        key: dto.key,
        scope: dto.scope,
        usedByServices: [],
        createdAt: now,
        updatedAt: now
      };
      return {
        state: bump({ ...state, variables: [...state.variables, created] }),
        result: created
      };
    }
  ),
  useUpdateVariable: mutation((dto: { variableId: string; key?: string }, state) => {
    const variable =
      state.variables.find((seed) => seed.id === dto.variableId) ?? notFound("Variable");
    const updated = {
      ...variable,
      key: dto.key ?? variable.key,
      updatedAt: new Date().toISOString()
    };
    return {
      state: {
        ...state,
        variables: state.variables.map((seed) => (seed.id === dto.variableId ? updated : seed))
      },
      result: withUsedBy(state, updated)
    };
  }),
  useDeleteVariable: mutation((variableId: string, state) => {
    const variable = state.variables.find((seed) => seed.id === variableId) ?? notFound("Variable");
    return {
      state: { ...state, variables: state.variables.filter((seed) => seed.id !== variableId) },
      result: variable
    };
  }),
  useRevealVariableValue: mutation((variableId: string, state) => {
    const variable = state.variables.find((seed) => seed.id === variableId) ?? notFound("Variable");
    return { state, result: `demo-value-for-${variable.key.toLowerCase().replace(/_/g, "-")}` };
  }),

  useSkills: query("skills", (state, _projectId: string, params = {}) => {
    const rows = state.skills
      .filter((seed) => matches(params.search, seed.skill.name, seed.skill.description))
      .filter((seed) => !params.name || seed.skill.name === params.name)
      .map((seed) => skillWithBundles(state, seed))
      .sort((a, b) => a.name.localeCompare(b.name));
    return { skills: page(rows, params.limit, params.offset), totalCount: rows.length };
  }),
  useSkill: query("skill", (state, _projectId: string, id: string) => {
    const seed = state.skills.find((entry) => entry.skill.id === id);
    if (!seed) return undefined as never;
    return {
      ...skillWithBundles(state, seed),
      files: seed.versions[seed.versions.length - 1].files
    };
  }),
  useSkillVersions: query("skillVersions", (state, _projectId: string, id: string) =>
    [...(state.skills.find((entry) => entry.skill.id === id)?.versions ?? [])]
      .reverse()
      .map(({ files, ...version }) => version)
  ),
  useSkillVersion: query(
    "skillVersion",
    (state, _projectId: string, id: string, version?: number) => {
      const found = state.skills
        .find((entry) => entry.skill.id === id)
        ?.versions.find((entry) => entry.version === version);
      return found as NonNullable<typeof found>;
    }
  ),
  useAccessBundleSkills: query(
    "accessBundleSkills",
    (state, _projectId: string, accessBundleId: string) =>
      (state.bundles.find((bundle) => bundle.id === accessBundleId)?.skillIds ?? [])
        .map((id) => state.skills.find((entry) => entry.skill.id === id))
        .filter((seed): seed is SkillSeed => Boolean(seed))
        .map(bundleSkill)
  ),
  useCreateSkill: mutation(({ files }: { files: TAgentVaultSkillFile[] }, state) => {
    const { name, description } = skillLabels(files, {
      name: `skill-${state.counter}`,
      description: ""
    });
    if (state.skills.some((seed) => seed.skill.name === name))
      throw new Error(`A skill named ${name} already exists in this project.`);
    const now = new Date().toISOString();
    const version = {
      id: nextId(state, "f9"),
      version: 1,
      sha256: "0".repeat(64),
      sizeBytes: files.reduce(
        (sum, file) => sum + Math.floor((file.contentBase64.length * 3) / 4),
        0
      ),
      fileCount: files.length,
      createdAt: now,
      files
    };
    const skill = {
      id: nextId(state, "f1"),
      name,
      description,
      latestVersion: 1,
      createdAt: now,
      updatedAt: now
    };
    const { files: _files, ...versionSummary } = version;
    return {
      state: bump({ ...state, skills: [...state.skills, { skill, versions: [version] }] }),
      result: { skill, version: versionSummary }
    };
  }),
  useUpdateSkill: mutation(
    ({ skillId: id, files }: { skillId: string; files: TAgentVaultSkillFile[] }, state) => {
      const seed = state.skills.find((entry) => entry.skill.id === id) ?? notFound("Skill");
      const now = new Date().toISOString();
      const version = {
        id: nextId(state, "f9"),
        version: seed.skill.latestVersion + 1,
        sha256: String(seed.skill.latestVersion + 1)
          .repeat(64)
          .slice(0, 64),
        sizeBytes: files.reduce(
          (sum, file) => sum + Math.floor((file.contentBase64.length * 3) / 4),
          0
        ),
        fileCount: files.length,
        createdAt: now,
        files
      };
      const skill = {
        ...seed.skill,
        ...skillLabels(files, seed.skill),
        latestVersion: version.version,
        updatedAt: now
      };
      const { files: _files, ...versionSummary } = version;
      return {
        state: bump({
          ...state,
          skills: state.skills.map((entry) =>
            entry.skill.id === id ? { skill, versions: [...entry.versions, version] } : entry
          )
        }),
        result: { skill, version: versionSummary, unchanged: false }
      };
    }
  ),
  useRestoreSkillVersion: mutation(
    ({ skillId: id, version }: { skillId: string; version: number }, state) => {
      const seed = state.skills.find((entry) => entry.skill.id === id) ?? notFound("Skill");
      const source =
        seed.versions.find((entry) => entry.version === version) ?? notFound("Version");
      const now = new Date().toISOString();
      const restored = {
        ...source,
        id: nextId(state, "f9"),
        version: seed.skill.latestVersion + 1,
        createdAt: now
      };
      const { files: _files, ...versionSummary } = restored;
      return {
        state: bump({
          ...state,
          skills: state.skills.map((entry) =>
            entry.skill.id === id
              ? {
                  skill: {
                    ...entry.skill,
                    ...skillLabels(restored.files, entry.skill),
                    latestVersion: restored.version,
                    updatedAt: now
                  },
                  versions: [...entry.versions, restored]
                }
              : entry
          )
        }),
        result: { version: versionSummary, unchanged: false }
      };
    }
  ),
  useDeleteSkill: mutation((id: string, state) => {
    const seed = state.skills.find((entry) => entry.skill.id === id) ?? notFound("Skill");
    return {
      state: {
        ...state,
        skills: state.skills.filter((entry) => entry.skill.id !== id),
        bundles: state.bundles.map((bundle) => ({
          ...bundle,
          skillIds: bundle.skillIds.filter((existing) => existing !== id)
        }))
      },
      result: seed.skill
    };
  }),
  useAddAccessBundleSkills: mutation(
    ({ accessBundleId, skillIds }: { accessBundleId: string; skillIds: string[] }, state) => {
      const next = updateBundle(state, accessBundleId, (bundle) => ({
        ...bundle,
        skillIds: [...new Set([...bundle.skillIds, ...skillIds])]
      }));
      const added = new Set(skillIds);
      return {
        state: next,
        result: {
          skills: next.skills.filter((seed) => added.has(seed.skill.id)).map(bundleSkill),
          skipped: []
        }
      };
    }
  ),
  useRemoveAccessBundleSkill: mutation(
    ({ accessBundleId, skillId: id }: { accessBundleId: string; skillId: string }, state) => {
      const seed = state.skills.find((entry) => entry.skill.id === id) ?? notFound("Skill");
      return {
        state: updateBundle(state, accessBundleId, (bundle) => ({
          ...bundle,
          skillIds: bundle.skillIds.filter((existing) => existing !== id)
        })),
        result: bundleSkill(seed)
      };
    }
  ),

  useProxies: query("proxies", (state, _projectId: string, params = {}) => {
    const rows = state.proxies.filter((proxy) =>
      matches(params.search, proxy.name, proxy.description)
    );
    const sorted = sortBy(
      rows,
      (a, b) =>
        params.orderBy === "createdAt"
          ? (a.createdAt ?? "").localeCompare(b.createdAt ?? "")
          : a.name.localeCompare(b.name),
      params.orderDirection
    );
    return { proxies: page(sorted, params.limit, params.offset), totalCount: rows.length };
  }),
  useCreateProxy: mutation(
    (
      dto: {
        name: string;
        description?: string;
        trafficPolicy?: AgentVaultTrafficPolicy;
        allowedHosts?: string | null;
        pollInterval?: number;
      },
      state
    ) => {
      if (state.proxies.some((proxy) => proxy.name === dto.name))
        throw new Error(`A proxy named ${dto.name} already exists in this project.`);
      const proxy: TAgentVaultProxy = {
        id: nextId(state, "d1"),
        name: dto.name,
        description: dto.description ?? null,
        heartbeat: null,
        isHealthy: false,
        rootCaFingerprint: null,
        rootCaExpiresAt: null,
        trafficPolicy: dto.trafficPolicy ?? AgentVaultTrafficPolicy.ServiceHosts,
        allowedHosts: dto.allowedHosts ?? null,
        pollInterval: dto.pollInterval ?? 60,
        createdAt: new Date().toISOString()
      };
      return {
        state: bump({ ...state, proxies: [...state.proxies, proxy] }),
        result: { proxy, proxyToken: `demo-proxy-token-${state.counter}-not-a-real-credential` }
      };
    }
  ),
  useUpdateProxy: mutation(
    ({ proxyId, ...dto }: { proxyId: string } & Partial<TAgentVaultProxy>, state) => {
      const proxy = state.proxies.find((seed) => seed.id === proxyId) ?? notFound("Proxy");
      const updated = {
        ...proxy,
        ...Object.fromEntries(Object.entries(dto).filter(([, value]) => value !== undefined))
      };
      return {
        state: {
          ...state,
          proxies: state.proxies.map((seed) => (seed.id === proxyId ? updated : seed))
        },
        result: updated
      };
    }
  ),
  useDeleteProxy: mutation((proxyId: string, state) => {
    const proxy = state.proxies.find((seed) => seed.id === proxyId) ?? notFound("Proxy");
    return {
      state: { ...state, proxies: state.proxies.filter((seed) => seed.id !== proxyId) },
      result: { id: proxy.id, name: proxy.name }
    };
  }),
  useRotateProxyToken: mutation((proxyId: string, state) => {
    const proxy = state.proxies.find((seed) => seed.id === proxyId) ?? notFound("Proxy");
    return {
      state: bump(state),
      result: { proxy, proxyToken: `demo-proxy-token-${state.counter}-not-a-real-credential` }
    };
  }),
  useRevokeProxyAccess: mutation((proxyId: string, state) => {
    const proxy = state.proxies.find((seed) => seed.id === proxyId) ?? notFound("Proxy");
    const revoked = { ...proxy, heartbeat: null, isHealthy: false };
    return {
      state: {
        ...state,
        proxies: state.proxies.map((seed) => (seed.id === proxyId ? revoked : seed))
      },
      result: revoked
    };
  }),
  useProxyCa: mutation((proxyId: string, state) => {
    const proxy = state.proxies.find((seed) => seed.id === proxyId) ?? notFound("Proxy");
    return {
      state,
      result: {
        certificate: `demo-root-ca-for-${proxy.name}-not-a-real-certificate`,
        fingerprint: proxy.rootCaFingerprint ?? "",
        expiresAt: proxy.rootCaExpiresAt ?? new Date().toISOString()
      }
    };
  })
};
