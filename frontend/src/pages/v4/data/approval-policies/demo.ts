import { useRouterState } from "@tanstack/react-router";

import {
  ApproverType,
  BypasserType,
  type TAccessApprovalPolicy,
  type TApprovalPolicyApproverInput
} from "@app/hooks/api/accessApproval/types";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { DelegatedApprovalPolicyType } from "@app/hooks/api/delegatedApprovals/enums";
import { EnforcementLevel, PolicyType } from "@app/hooks/api/policies/enums";
import type { ProjectEnv } from "@app/hooks/api/projects/types";
import type {
  TSecretApprovalPolicy,
  TSecretApprovalPolicyApproverInput
} from "@app/hooks/api/secretApproval/types";

import { accessDemo } from "../access/demo";
import { createFixtureStore } from "../fixture-store";
import type { ApprovalPoliciesAdapter } from "./contract";

const SCENARIOS = ["default", "empty", "loading", "error", "upgrade"] as const;
type Scenario = (typeof SCENARIOS)[number];

const useScenario = () =>
  useRouterState({
    select: (state): Scenario => {
      const value = (state.location.search as { scenario?: unknown }).scenario;
      return SCENARIOS.find((scenario) => scenario === value) ?? "default";
    }
  });

const DEMO_PROJECT = "payments-api";

const ENVIRONMENTS: Record<string, ProjectEnv> = {
  dev: { id: "env-dev", name: "Development", slug: "dev" },
  staging: { id: "env-staging", name: "Staging", slug: "staging" },
  prod: { id: "env-prod", name: "Production", slug: "prod" }
};

const environmentsOf = (slugs: string[]) =>
  slugs.map((slug) => ENVIRONMENTS[slug] ?? { id: `env-${slug}`, name: slug, slug });

type PoliciesState = {
  change: TSecretApprovalPolicy[];
  access: TAccessApprovalPolicy[];
};

const user = (id: string, sequence?: number, approvalsRequired?: number) => ({
  id,
  type: ApproverType.User,
  isOrgMembershipActive: true,
  sequence,
  approvalsRequired
});

const group = (id: string, sequence?: number, approvalsRequired?: number) => ({
  id,
  type: ApproverType.Group,
  isOrgMembershipActive: true,
  sequence,
  approvalsRequired
});

const seed = (): PoliciesState => ({
  change: [
    {
      id: "policy-prod-changes",
      project: DEMO_PROJECT,
      name: "production-changes",
      environments: environmentsOf(["prod"]),
      secretPath: "/**",
      approvals: 2,
      approvers: [user("u-sarah"), user("u-marcus"), group("g-security")],
      updatedAt: new Date("2026-10-28T15:20:00.000Z"),
      enforcementLevel: EnforcementLevel.Soft,
      allowedSelfApprovals: false,
      bypassForMachineIdentities: true
    },
    {
      id: "policy-stripe-keys",
      project: DEMO_PROJECT,
      name: "stripe-keys",
      environments: environmentsOf(["staging", "prod"]),
      secretPath: "/api/stripe",
      approvals: 1,
      approvers: [user("u-priya"), user("u-former")],
      updatedAt: new Date("2026-10-12T09:00:00.000Z"),
      enforcementLevel: EnforcementLevel.Hard,
      allowedSelfApprovals: true,
      bypassForMachineIdentities: false
    }
  ],
  access: [
    {
      id: "policy-prod-access",
      name: "production-access",
      approvals: 1,
      secretPath: "/**",
      workspace: DEMO_PROJECT,
      projectId: DEMO_PROJECT,
      environments: environmentsOf(["prod"]),
      policyType: PolicyType.AccessPolicy,
      approversRequired: true,
      enforcementLevel: EnforcementLevel.Hard,
      createdAt: new Date("2026-11-02T11:45:00.000Z"),
      updatedAt: new Date("2026-11-02T11:45:00.000Z"),
      approvers: [user("u-marcus", 1, 1), group("g-platform", 1, 1), user("u-sarah", 2, 1)],
      bypassers: [],
      allowedSelfApprovals: false,
      maxTimePeriod: "7d",
      requestExpirationTime: "72h",
      delegatedApproval: null
    },
    {
      id: "policy-workers-access",
      name: "workers-servicenow",
      approvals: 1,
      secretPath: "/workers/*",
      workspace: DEMO_PROJECT,
      projectId: DEMO_PROJECT,
      environments: environmentsOf(["dev", "staging"]),
      policyType: PolicyType.AccessPolicy,
      approversRequired: true,
      enforcementLevel: EnforcementLevel.Hard,
      createdAt: new Date("2026-09-30T08:10:00.000Z"),
      updatedAt: new Date("2026-09-30T08:10:00.000Z"),
      approvers: [],
      bypassers: [],
      allowedSelfApprovals: false,
      maxTimePeriod: "1d",
      requestExpirationTime: null,
      delegatedApproval: {
        type: DelegatedApprovalPolicyType.ServiceNow,
        connectionId: "conn-servicenow-prod"
      }
    },
    {
      id: "policy-dev-access",
      name: "dev-break-glass",
      approvals: 1,
      secretPath: "/",
      workspace: DEMO_PROJECT,
      projectId: DEMO_PROJECT,
      environments: environmentsOf(["dev"]),
      policyType: PolicyType.AccessPolicy,
      approversRequired: true,
      enforcementLevel: EnforcementLevel.Soft,
      createdAt: new Date("2026-08-19T17:30:00.000Z"),
      updatedAt: new Date("2026-08-19T17:30:00.000Z"),
      approvers: [user("u-priya", 1, 1)],
      bypassers: [{ id: "g-platform", type: BypasserType.Group }],
      allowedSelfApprovals: true,
      maxTimePeriod: null,
      requestExpirationTime: null
    }
  ]
});

const stores = {
  default: createFixtureStore<PoliciesState>(seed()),
  empty: createFixtureStore<PoliciesState>({ change: [], access: [] })
};
const useStore = () => (useScenario() === "empty" ? stores.empty : stores.default);

const OPEN_REQUESTS: Record<string, number> = {
  "policy-prod-changes": 2,
  "policy-prod-access": 1
};

const CONNECTIONS = [
  { id: "conn-servicenow-prod", name: "servicenow-prod", projectId: DEMO_PROJECT },
  { id: "conn-servicenow-sandbox", name: "servicenow-sandbox", projectId: DEMO_PROJECT }
];

let nextId = 0;
const newId = () => {
  nextId += 1;
  return `policy-${Date.now()}-${nextId}`;
};

const DUPLICATE_PATH = (secretPath: string, environment: string) =>
  Object.assign(
    new Error(
      `A policy for secret path ${secretPath} already exists in environment ${environment}`
    ),
    {
      isAxiosError: true,
      response: {
        data: {
          message: `A policy for secret path ${secretPath} already exists in environment ${environment}`
        }
      }
    }
  );

const assertUniquePath = (
  policies: { id: string; secretPath?: string; environments: ProjectEnv[] }[],
  secretPath: string,
  environments: string[],
  ignoreId?: string
) => {
  const clash = policies.find(
    (policy) =>
      policy.id !== ignoreId &&
      (policy.secretPath ?? "/") === secretPath &&
      policy.environments.some((env) => environments.includes(env.slug))
  );
  if (clash) {
    const env = clash.environments.find((entry) => environments.includes(entry.slug))!;
    throw DUPLICATE_PATH(secretPath, env.slug);
  }
};

const resolveUser = (approver: { id?: string; username?: string }, emails: Map<string, string>) =>
  approver.id ?? emails.get(approver.username?.toLowerCase() ?? "") ?? approver.username ?? "";

const toApprovers = (
  inputs: (TApprovalPolicyApproverInput | TSecretApprovalPolicyApproverInput)[] | undefined,
  emails: Map<string, string>,
  steps?: { numberOfApprovals: number; stepNumber: number }[]
) =>
  (inputs ?? []).map((input) => {
    const sequence = "sequence" in input ? input.sequence : undefined;
    return {
      id: input.type === "group" ? input.id : resolveUser(input, emails),
      type: input.type === "group" ? ApproverType.Group : ApproverType.User,
      isOrgMembershipActive: true,
      sequence,
      approvalsRequired: steps?.find((step) => step.stepNumber === sequence)?.numberOfApprovals
    };
  });

const toBypassers = (
  inputs: { type: "user" | "group"; id?: string; username?: string }[] | undefined,
  emails: Map<string, string>
) =>
  (inputs ?? []).map((input) => ({
    id: input.type === "group" ? (input.id ?? "") : resolveUser(input, emails),
    type: input.type === "group" ? BypasserType.Group : BypasserType.User
  }));

const useMemberEmails = () => {
  const { data: members = [] } = accessDemo.useProjectUsers(DEMO_PROJECT, true);
  return new Map(members.map((member) => [member.user.username.toLowerCase(), member.user.id]));
};

const pending = { data: undefined, isPending: true, error: null };
const ok = <T>(data: T) => ({ data, isPending: false, error: null });
const failed = {
  data: undefined,
  isPending: false,
  error: new Error("Approval policies are unavailable.")
};

const useListQuery = <T>(select: (state: PoliciesState) => T, enabled: boolean) => {
  const scenario = useScenario();
  const state = useStore().use();
  const base = { isFetching: false, refetch: () => undefined };
  if (!enabled) return { ...base, data: undefined, isPending: false, error: null };
  if (scenario === "loading") return { ...base, ...pending };
  if (scenario === "error") return { ...base, ...failed };
  return { ...base, ...ok(select(state)) };
};

export const approvalPoliciesDemo: ApprovalPoliciesAdapter = {
  useGates: () => {
    const scenario = useScenario();
    const allowed = scenario !== "upgrade";
    return ok({ secretApproval: allowed, enterpriseAppConnections: allowed });
  },
  useChangePolicies: (_projectId, { enabled }) => useListQuery((state) => state.change, enabled),
  useAccessPolicies: (_projectSlug, { enabled }) => useListQuery((state) => state.access, enabled),
  useApproverOptions: (projectId, { members: readMembers, groups: readGroups }) => {
    const members = accessDemo.useProjectUsers(projectId, true);
    const groups = accessDemo.useProjectGroups(projectId);
    return {
      members: readMembers ? (members.data ?? []) : [],
      groups: readGroups ? (groups.data ?? []) : [],
      isError: false,
      isFetching: false,
      refetch: () => undefined
    };
  },
  useCreateChangePolicy: () => {
    const store = useStore();
    const emails = useMemberEmails();
    return {
      isPending: false,
      mutateAsync: async (dto) => {
        assertUniquePath(store.get().change, dto.secretPath, dto.environments);
        const policy: TSecretApprovalPolicy = {
          id: newId(),
          project: dto.projectId,
          name: dto.name || `change-${dto.environments.join("-")}`,
          environments: environmentsOf(dto.environments),
          secretPath: dto.secretPath,
          approvals: dto.approvals ?? 1,
          approvers: toApprovers(dto.approvers, emails),
          updatedAt: new Date(),
          enforcementLevel: dto.enforcementLevel,
          allowedSelfApprovals: dto.allowedSelfApprovals,
          bypassForMachineIdentities: Boolean(dto.bypassForMachineIdentities)
        };
        store.update((state) => ({ ...state, change: [policy, ...state.change] }));
        return {};
      }
    };
  },
  useUpdateChangePolicy: () => {
    const store = useStore();
    const emails = useMemberEmails();
    return {
      isPending: false,
      mutateAsync: async ({ id, projectId: _projectId, environments, approvers, ...dto }) => {
        const current = store.get().change.find((policy) => policy.id === id);
        if (!current) throw new Error("Policy not found");
        const slugs = environments ?? current.environments.map((env) => env.slug);
        assertUniquePath(
          store.get().change,
          dto.secretPath ?? current.secretPath ?? "/",
          slugs,
          id
        );
        const next: TSecretApprovalPolicy = {
          ...current,
          ...dto,
          name: dto.name || current.name,
          environments: environmentsOf(slugs),
          approvers: approvers ? toApprovers(approvers, emails) : current.approvers,
          bypassForMachineIdentities:
            dto.bypassForMachineIdentities ?? current.bypassForMachineIdentities,
          updatedAt: new Date()
        };
        store.update((state) => ({
          ...state,
          change: state.change.map((policy) => (policy.id === id ? next : policy))
        }));
        return {};
      }
    };
  },
  useDeleteChangePolicy: () => {
    const store = useStore();
    return {
      isPending: false,
      mutateAsync: async ({ id }) => {
        store.update((state) => ({
          ...state,
          change: state.change.filter((policy) => policy.id !== id)
        }));
        return {};
      }
    };
  },
  useCreateAccessPolicy: () => {
    const store = useStore();
    const emails = useMemberEmails();
    return {
      isPending: false,
      mutateAsync: async (dto) => {
        assertUniquePath(store.get().access, dto.secretPath, dto.environments);
        const policy: TAccessApprovalPolicy = {
          id: newId(),
          name: dto.name || `access-${dto.environments.join("-")}`,
          approvals: dto.approvalsRequired?.[0]?.numberOfApprovals ?? dto.approvals ?? 1,
          secretPath: dto.secretPath,
          workspace: DEMO_PROJECT,
          projectId: DEMO_PROJECT,
          environments: environmentsOf(dto.environments),
          policyType: PolicyType.AccessPolicy,
          approversRequired: true,
          enforcementLevel: dto.enforcementLevel ?? EnforcementLevel.Hard,
          createdAt: new Date(),
          updatedAt: new Date(),
          approvers: toApprovers(dto.approvers, emails, dto.approvalsRequired),
          bypassers: toBypassers(dto.bypassers, emails),
          allowedSelfApprovals: dto.allowedSelfApprovals,
          maxTimePeriod: dto.maxTimePeriod ?? null,
          requestExpirationTime: dto.requestExpirationTime ?? null,
          delegatedApproval: dto.delegatedApproval ?? null
        };
        store.update((state) => ({ ...state, access: [policy, ...state.access] }));
        return {};
      }
    };
  },
  useUpdateAccessPolicy: () => {
    const store = useStore();
    const emails = useMemberEmails();
    return {
      isPending: false,
      mutateAsync: async ({
        id,
        projectSlug: _projectSlug,
        environments,
        approvers,
        bypassers,
        approvalsRequired,
        delegatedApproval,
        ...dto
      }) => {
        const current = store.get().access.find((policy) => policy.id === id);
        if (!current) throw new Error("Policy not found");
        const slugs = environments ?? current.environments.map((env) => env.slug);
        assertUniquePath(store.get().access, dto.secretPath ?? current.secretPath, slugs, id);
        const isDelegated = Boolean(delegatedApproval);
        const nextApprovers = approvers
          ? toApprovers(approvers, emails, approvalsRequired)
          : current.approvers;
        const next: TAccessApprovalPolicy = {
          ...current,
          ...dto,
          name: dto.name || current.name,
          environments: environmentsOf(slugs),
          approvers: isDelegated ? [] : nextApprovers,
          bypassers: isDelegated ? [] : toBypassers(bypassers, emails),
          delegatedApproval:
            delegatedApproval === undefined ? current.delegatedApproval : delegatedApproval,
          updatedAt: new Date()
        };
        store.update((state) => ({
          ...state,
          access: state.access.map((policy) => (policy.id === id ? next : policy))
        }));
        return {};
      }
    };
  },
  useDeleteAccessPolicy: () => {
    const store = useStore();
    return {
      isPending: false,
      mutateAsync: async ({ id }) => {
        store.update((state) => ({
          ...state,
          access: state.access.filter((policy) => policy.id !== id)
        }));
        return {};
      }
    };
  },
  useOpenChangeRequestCount: ({ policyId, enabled }) =>
    enabled ? ok(OPEN_REQUESTS[policyId] ?? 0) : { data: undefined, isPending: false, error: null },
  useOpenAccessRequestCount: ({ policyId, enabled }) =>
    enabled ? ok(OPEN_REQUESTS[policyId] ?? 0) : { data: undefined, isPending: false, error: null },
  useDelegatedApprovalOptions: () =>
    ok([
      {
        name: "ServiceNow",
        type: DelegatedApprovalPolicyType.ServiceNow,
        connection: AppConnection.ServiceNow
      }
    ]),
  useAppConnections: () => ok(CONNECTIONS)
};
