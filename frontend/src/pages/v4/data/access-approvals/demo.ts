import { useRouterState } from "@tanstack/react-router";

import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";
import {
  ApproverType,
  BypasserType,
  type TAccessApprovalPolicy,
  type TAccessApprovalRequest
} from "@app/hooks/api/accessApproval/types";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import {
  DelegatedApprovalPolicyType,
  DelegatedApprovalRequestStatus
} from "@app/hooks/api/delegatedApprovals/enums";
import { EnforcementLevel, PolicyType } from "@app/hooks/api/policies/enums";
import { ApprovalStatus } from "@app/hooks/api/secretApprovalRequest/types";
import { getAccessRequestState } from "@app/pages/secret-manager/SecretApprovalsPage/components/AccessApprovalRequest/AccessApprovalRequest.utils";

import { createFixtureStore } from "../fixture-store";
import type { AccessApprovalsAdapter, AccessRequestGroup, AccessRequestMember } from "./contract";

const SCENARIOS = ["default", "empty", "no-policies", "loading", "unlicensed"] as const;
type Scenario = (typeof SCENARIOS)[number];

const useScenario = () =>
  useRouterState({
    select: (state) => {
      const value = (state.location.search as { scenario?: unknown }).scenario;
      return SCENARIOS.find((scenario) => scenario === value) ?? "default";
    }
  });

const SELF = "u-sarah";
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const at = (offset: number) => new Date(Date.now() + offset);

const MEMBERS: AccessRequestMember[] = [
  {
    id: SELF,
    username: "sarah@acme.dev",
    email: "sarah@acme.dev",
    firstName: "Sarah",
    lastName: "Lin",
    isOrgMembershipActive: true
  },
  {
    id: "u-jordan",
    username: "jordan@acme.dev",
    email: "jordan@acme.dev",
    firstName: "Jordan",
    lastName: "Lee",
    isOrgMembershipActive: true
  },
  {
    id: "u-maya",
    username: "maya@acme.dev",
    email: "maya@acme.dev",
    firstName: "Maya",
    lastName: "Patel",
    isOrgMembershipActive: true
  },
  {
    id: "u-priya",
    username: "priya@acme.dev",
    email: "priya@acme.dev",
    firstName: "Priya",
    lastName: "Shah",
    isOrgMembershipActive: true
  },
  {
    id: "u-alex",
    username: "alex@acme.dev",
    email: "alex@acme.dev",
    firstName: "Alex",
    lastName: "Kim",
    isOrgMembershipActive: false
  }
];
const GROUPS: AccessRequestGroup[] = [{ id: "g-security", name: "Security" }];

const memberOf = (id: string) => MEMBERS.find((member) => member.id === id)!;
const requester = (id: string) => {
  const member = memberOf(id);
  return {
    userId: member.id,
    email: member.email,
    username: member.username,
    firstName: member.firstName,
    lastName: member.lastName
  };
};

const envOf = (slug: string) =>
  ({
    dev: { id: "env-dev", name: "Development", slug: "dev" },
    staging: { id: "env-staging", name: "Staging", slug: "staging" },
    prod: { id: "env-prod", name: "Production", slug: "prod" }
  })[slug]!;

type PolicyApprover = { userId: string; sequence: number; approvalsRequired: number };

type PolicySeed = {
  id: string;
  name: string;
  env: string;
  secretPath: string;
  approvers: { id: string; type: ApproverType; sequence: number; approvalsRequired: number }[];
  enforcementLevel?: EnforcementLevel;
  allowedSelfApprovals?: boolean;
  bypassers?: string[];
  maxTimePeriod?: string | null;
  requestExpirationTime?: string | null;
  delegated?: boolean;
};

const POLICY_SEEDS: PolicySeed[] = [
  {
    id: "pol-prod-api",
    name: "Production API",
    env: "prod",
    secretPath: "/api",
    approvers: [
      { id: SELF, type: ApproverType.User, sequence: 1, approvalsRequired: 1 },
      { id: "u-jordan", type: ApproverType.User, sequence: 1, approvalsRequired: 1 },
      { id: "g-security", type: ApproverType.Group, sequence: 2, approvalsRequired: 1 }
    ],
    maxTimePeriod: "8h",
    requestExpirationTime: "3d"
  },
  {
    id: "pol-staging",
    name: "Staging",
    env: "staging",
    secretPath: "/",
    approvers: [
      { id: SELF, type: ApproverType.User, sequence: 1, approvalsRequired: 1 },
      { id: "u-maya", type: ApproverType.User, sequence: 1, approvalsRequired: 1 }
    ],
    enforcementLevel: EnforcementLevel.Soft,
    bypassers: [SELF],
    requestExpirationTime: "7d"
  },
  {
    id: "pol-prod-payments",
    name: "Payments via ServiceNow",
    env: "prod",
    secretPath: "/payments",
    approvers: [],
    delegated: true
  },
  {
    id: "pol-dev",
    name: "Development",
    env: "dev",
    secretPath: "/",
    approvers: [
      { id: SELF, type: ApproverType.User, sequence: 1, approvalsRequired: 1 },
      { id: "u-alex", type: ApproverType.User, sequence: 1, approvalsRequired: 1 }
    ],
    allowedSelfApprovals: true
  }
];

const GROUP_MEMBERS: Record<string, string[]> = { "g-security": ["u-priya", "u-maya"] };

const policyApprovers = (seed: PolicySeed): PolicyApprover[] =>
  seed.approvers.flatMap((approver) =>
    (approver.type === ApproverType.Group ? (GROUP_MEMBERS[approver.id] ?? []) : [approver.id]).map(
      (userId) => ({
        userId,
        sequence: approver.sequence,
        approvalsRequired: approver.approvalsRequired
      })
    )
  );

const POLICIES: TAccessApprovalPolicy[] = POLICY_SEEDS.map((seed) => ({
  id: seed.id,
  name: seed.name,
  approvals: 1,
  secretPath: seed.secretPath,
  workspace: "payments-api",
  projectId: "payments-api",
  environments: [envOf(seed.env)],
  policyType: PolicyType.AccessPolicy,
  approversRequired: true,
  enforcementLevel: seed.enforcementLevel ?? EnforcementLevel.Hard,
  createdAt: new Date("2026-10-12T10:00:00Z"),
  updatedAt: new Date("2026-10-12T10:00:00Z"),
  approvers: seed.approvers.map((approver) => ({
    ...approver,
    name: approver.type === ApproverType.Group ? GROUPS[0].name : memberOf(approver.id).username,
    isOrgMembershipActive:
      approver.type === ApproverType.Group || memberOf(approver.id).isOrgMembershipActive
  })),
  bypassers: (seed.bypassers ?? []).map((id) => ({ id, type: BypasserType.User })),
  allowedSelfApprovals: seed.allowedSelfApprovals ?? false,
  maxTimePeriod: seed.maxTimePeriod ?? null,
  requestExpirationTime: seed.requestExpirationTime ?? null,
  delegatedApproval: seed.delegated
    ? { type: DelegatedApprovalPolicyType.ServiceNow, connectionId: "conn-servicenow" }
    : null
}));

const SECRETS = ProjectPermissionSub.Secrets;

const permissionsFor = (
  env: string,
  secretPath: string,
  grants: { subject: string; actions: string[]; inverted?: boolean }[]
) =>
  grants.flatMap(({ subject, actions, inverted }) =>
    actions.map((action) => ({
      action,
      subject: [subject],
      inverted,
      conditions: { environment: env, secretPath: { $glob: secretPath } }
    }))
  );

type RequestSeed = {
  id: string;
  policy: string;
  by: string;
  createdAgo: number;
  range?: string;
  status?: ApprovalStatus;
  reviews?: Record<string, ApprovalStatus>;
  grants?: { subject: string; actions: string[]; inverted?: boolean }[];
  note?: string;
  expiresIn?: number | null;
  accessEndsIn?: number;
  bypassReason?: string;
  revokedBy?: string;
  policyDeleted?: boolean;
  delegated?: {
    status: DelegatedApprovalRequestStatus;
    statusReason?: string;
    recordNumber?: string;
  };
};

const READ = [ProjectPermissionActions.Read];

const SEEDS: RequestSeed[] = [
  {
    id: "ar-review",
    policy: "pol-prod-api",
    by: "u-jordan",
    createdAgo: 2 * HOUR,
    range: "4h",
    grants: [
      { subject: SECRETS, actions: [ProjectPermissionActions.Read, ProjectPermissionActions.Edit] },
      { subject: ProjectPermissionSub.SecretImports, actions: READ }
    ],
    note: "Rotating the Stripe webhook secret during the incident.",
    expiresIn: 2 * DAY
  },
  {
    id: "ar-additional",
    policy: "pol-prod-api",
    by: "u-maya",
    createdAgo: 20 * HOUR,
    range: "8h",
    reviews: { [SELF]: ApprovalStatus.APPROVED },
    grants: [{ subject: SECRETS, actions: READ }],
    expiresIn: 10 * HOUR
  },
  {
    id: "ar-self",
    policy: "pol-staging",
    by: SELF,
    createdAgo: 30 * 60 * 1000,
    grants: [
      {
        subject: SECRETS,
        actions: [ProjectPermissionActions.Read, ProjectPermissionActions.Create]
      },
      { subject: ProjectPermissionSub.SecretFolders, actions: [ProjectPermissionActions.Create] },
      { subject: SECRETS, actions: [ProjectPermissionActions.Delete], inverted: true }
    ],
    note: "Seeding fixtures for the load test.",
    expiresIn: 6 * DAY
  },
  {
    id: "ar-snow-waiting",
    policy: "pol-prod-payments",
    by: "u-priya",
    createdAgo: 5 * HOUR,
    range: "2h",
    grants: [{ subject: SECRETS, actions: READ }],
    delegated: {
      status: DelegatedApprovalRequestStatus.WaitingApproval,
      recordNumber: "RITM0010423"
    }
  },
  {
    id: "ar-snow-submitting",
    policy: "pol-prod-payments",
    by: "u-jordan",
    createdAgo: 2 * 60 * 1000,
    range: "1h",
    grants: [{ subject: SECRETS, actions: READ }],
    delegated: { status: DelegatedApprovalRequestStatus.PendingDispatch }
  },
  {
    id: "ar-snow-failed",
    policy: "pol-prod-payments",
    by: SELF,
    createdAgo: 3 * HOUR,
    range: "30m",
    grants: [{ subject: ProjectPermissionSub.DynamicSecrets, actions: ["lease"] }],
    delegated: {
      status: DelegatedApprovalRequestStatus.FailedDispatch,
      statusReason:
        "ServiceNow rejected the connection credentials. Check the app connection and retry."
    }
  },
  {
    id: "ar-snow-retrying",
    policy: "pol-prod-payments",
    by: "u-maya",
    createdAgo: 40 * 60 * 1000,
    range: "1h",
    grants: [{ subject: SECRETS, actions: READ }],
    delegated: {
      status: DelegatedApprovalRequestStatus.FailedDispatch,
      statusReason: "ServiceNow timed out."
    }
  },
  {
    id: "ar-granted",
    policy: "pol-dev",
    by: "u-jordan",
    createdAgo: DAY,
    range: "3d",
    status: ApprovalStatus.APPROVED,
    reviews: { [SELF]: ApprovalStatus.APPROVED },
    grants: [{ subject: SECRETS, actions: READ }],
    accessEndsIn: 2 * DAY
  },
  {
    id: "ar-access-expired",
    policy: "pol-dev",
    by: "u-maya",
    createdAgo: 4 * DAY,
    range: "1h",
    status: ApprovalStatus.APPROVED,
    reviews: { [SELF]: ApprovalStatus.APPROVED },
    grants: [{ subject: SECRETS, actions: READ }],
    accessEndsIn: -3 * DAY
  },
  {
    id: "ar-bypassed",
    policy: "pol-staging",
    by: "u-maya",
    createdAgo: 2 * DAY,
    status: ApprovalStatus.APPROVED,
    grants: [{ subject: SECRETS, actions: [ProjectPermissionActions.Edit] }],
    bypassReason: "Hotfix for checkout outage, reviewed in the incident channel."
  },
  {
    id: "ar-rejected",
    policy: "pol-prod-api",
    by: "u-priya",
    createdAgo: 3 * DAY,
    range: "2h",
    status: ApprovalStatus.REJECTED,
    reviews: { "u-jordan": ApprovalStatus.REJECTED },
    grants: [{ subject: SECRETS, actions: [ProjectPermissionActions.Delete] }]
  },
  {
    id: "ar-revoked",
    policy: "pol-dev",
    by: "u-priya",
    createdAgo: 5 * DAY,
    status: ApprovalStatus.REVOKED,
    reviews: { [SELF]: ApprovalStatus.APPROVED },
    grants: [{ subject: SECRETS, actions: READ }],
    revokedBy: SELF
  },
  {
    id: "ar-expired",
    policy: "pol-staging",
    by: "u-jordan",
    createdAgo: 9 * DAY,
    range: "1d",
    grants: [{ subject: SECRETS, actions: READ }],
    expiresIn: -2 * DAY
  },
  {
    id: "ar-policy-deleted",
    policy: "pol-staging",
    by: "u-priya",
    createdAgo: 12 * DAY,
    grants: [{ subject: SECRETS, actions: READ }],
    policyDeleted: true
  },
  {
    id: "ar-snow-rejected",
    policy: "pol-prod-payments",
    by: "u-jordan",
    createdAgo: 6 * DAY,
    range: "4h",
    status: ApprovalStatus.REJECTED,
    grants: [{ subject: SECRETS, actions: READ }],
    delegated: {
      status: DelegatedApprovalRequestStatus.Rejected,
      recordNumber: "RITM0010388"
    }
  }
];

const requestOf = (seed: RequestSeed): TAccessApprovalRequest => {
  const policySeed = POLICY_SEEDS.find((entry) => entry.id === seed.policy)!;
  const createdAt = at(-seed.createdAgo);
  const status = seed.status ?? ApprovalStatus.PENDING;
  const approved = status === ApprovalStatus.APPROVED;
  const approvedAt =
    approved || status === ApprovalStatus.REVOKED ? at(-seed.createdAgo + HOUR) : null;
  const permissions = permissionsFor(policySeed.env, policySeed.secretPath, seed.grants ?? []);
  return {
    id: seed.id,
    policyId: seed.policyDeleted ? null : policySeed.id,
    privilegeId: approved ? `priv-${seed.id}` : null,
    requestedByUserId: seed.by,
    requestedByUser: requester(seed.by),
    createdAt,
    updatedAt: approvedAt ?? at(-seed.createdAgo + 2 * HOUR),
    isTemporary: Boolean(seed.range),
    temporaryRange: seed.range ?? null,
    permissions,
    environmentName: policySeed.env,
    isApproved: approved,
    privilege: approved
      ? {
          membershipId: `membership-${seed.by}`,
          isTemporary: Boolean(seed.range),
          temporaryMode: seed.range ? "relative" : null,
          temporaryRange: seed.range ?? null,
          temporaryAccessStartTime: approvedAt,
          temporaryAccessEndTime: seed.accessEndsIn === undefined ? null : at(seed.accessEndsIn),
          permissions,
          isApproved: true
        }
      : null,
    status,
    bypassReason: seed.bypassReason ?? null,
    policy: {
      id: policySeed.id,
      name: policySeed.name,
      approvals: 1,
      approvers: policyApprovers(policySeed).map((approver) => ({
        ...approver,
        username: memberOf(approver.userId).username,
        email: memberOf(approver.userId).email,
        isOrgMembershipActive: memberOf(approver.userId).isOrgMembershipActive
      })),
      bypassers: policySeed.bypassers ?? [],
      secretPath: policySeed.secretPath,
      envId: envOf(policySeed.env).id,
      enforcementLevel: policySeed.enforcementLevel ?? EnforcementLevel.Hard,
      deletedAt: seed.policyDeleted ? at(-DAY) : null,
      allowedSelfApprovals: policySeed.allowedSelfApprovals ?? false,
      maxTimePeriod: policySeed.maxTimePeriod ?? null,
      requestExpirationTime: policySeed.requestExpirationTime ?? null,
      delegatedApproval: policySeed.delegated
        ? { type: DelegatedApprovalPolicyType.ServiceNow }
        : null
    },
    delegatedApproval: seed.delegated
      ? {
          status: seed.delegated.status,
          statusReason: seed.delegated.statusReason ?? null,
          provider: seed.delegated.recordNumber
            ? {
                type: DelegatedApprovalPolicyType.ServiceNow,
                recordNumber: seed.delegated.recordNumber
              }
            : null
        }
      : null,
    reviewers: Object.entries(seed.reviews ?? {}).map(([userId, reviewStatus]) => ({
      userId,
      status: reviewStatus,
      isOrgMembershipActive: memberOf(userId).isOrgMembershipActive
    })),
    note: seed.note,
    expiresAt: seed.expiresIn === undefined || seed.expiresIn === null ? null : at(seed.expiresIn),
    approvedAt,
    revokedAt: seed.revokedBy ? at(-DAY) : null,
    approvedByUserId: approvedAt ? SELF : null,
    revokedByUserId: seed.revokedBy ?? null,
    approvedByUser: approvedAt ? requester(SELF) : null,
    revokedByUser: seed.revokedBy ? requester(seed.revokedBy) : null
  };
};

type DemoState = { requests: TAccessApprovalRequest[]; retrying: string[] };

const store = createFixtureStore<DemoState>({
  requests: SEEDS.map(requestOf),
  retrying: ["ar-snow-retrying"]
});

const DELEGATED_OPTIONS = [
  {
    name: "ServiceNow",
    type: DelegatedApprovalPolicyType.ServiceNow,
    connection: AppConnection.ServiceNow
  }
];

const query = <T>(scenario: Scenario, data: T) =>
  scenario === "loading"
    ? { data: undefined, isPending: true, error: null }
    : { data, isPending: false, error: null };

const visibleRequests = (scenario: Scenario, requests: TAccessApprovalRequest[]) =>
  scenario === "empty" || scenario === "no-policies" ? [] : requests;

const setRequest = (
  requestId: string,
  change: (request: TAccessApprovalRequest) => TAccessApprovalRequest
) =>
  store.update((state) => ({
    ...state,
    requests: state.requests.map((request) =>
      request.id === requestId ? change(request) : request
    )
  }));

const mutation =
  <TVariables>(run: (variables: TVariables) => void) =>
  () => ({
    isPending: false,
    mutateAsync: async (variables: TVariables) => {
      run(variables);
      return {};
    }
  });

const stepsSatisfied = (request: TAccessApprovalRequest) => {
  const sequences = [
    ...new Set(request.policy.approvers.map((approver) => approver.sequence ?? 1))
  ];
  return sequences.every((sequence) => {
    const inStep = request.policy.approvers.filter(
      (approver) => (approver.sequence ?? 1) === sequence
    );
    const approvals = inStep.filter((approver) =>
      request.reviewers.some(
        (reviewer) =>
          reviewer.userId === approver.userId && reviewer.status === ApprovalStatus.APPROVED
      )
    ).length;
    return approvals >= (inStep[0]?.approvalsRequired ?? 1);
  });
};

export const accessApprovalsDemo: AccessApprovalsAdapter = {
  useLicense: () => {
    const scenario = useScenario();
    return query(scenario, { secretApproval: scenario !== "unlicensed", honeyTokens: true });
  },
  usePolicies: () => {
    const scenario = useScenario();
    return query(scenario, scenario === "no-policies" ? [] : POLICIES);
  },
  useRequests: ({ envSlug, authorUserId }) => {
    const scenario = useScenario();
    const { requests } = store.use();
    return query(
      scenario,
      visibleRequests(scenario, requests).filter(
        (request) =>
          (!envSlug || request.environmentName === envSlug) &&
          (!authorUserId || request.requestedByUserId === authorUserId)
      )
    );
  },
  useRequestCount: () => {
    const scenario = useScenario();
    const requests = visibleRequests(scenario, store.use().requests);
    const pendingCount = requests.filter(
      (request) => getAccessRequestState(request) === "pending"
    ).length;
    return query(scenario, { pendingCount, finalizedCount: requests.length - pendingCount });
  },
  useMembers: () => query(useScenario(), MEMBERS),
  useGroups: () => query(useScenario(), GROUPS),
  useDelegatedApprovalOptions: () => query(useScenario(), DELEGATED_OPTIONS),
  useIsDispatchRetrying: () => {
    const { retrying } = store.use();
    return (requestId) => retrying.includes(requestId);
  },
  useCreateRequest: mutation(({ isTemporary, temporaryRange, permissions, note }) => {
    const conditions = permissions?.[0]?.conditions as
      | { environment?: string; secretPath?: { $glob?: string } }
      | undefined;
    const policy = POLICIES.find(
      (entry) =>
        entry.environments.some((env) => env.slug === conditions?.environment) &&
        entry.secretPath === conditions?.secretPath?.$glob
    );
    const seed = POLICY_SEEDS.find((entry) => entry.id === policy?.id);
    if (!seed) throw new Error("No policy matches this environment and secret path");
    const request = requestOf({
      id: `ar-${crypto.randomUUID().slice(0, 8)}`,
      policy: seed.id,
      by: SELF,
      createdAgo: 0,
      range: isTemporary ? (temporaryRange ?? undefined) : undefined,
      note,
      expiresIn: seed.requestExpirationTime ? 3 * DAY : null,
      delegated: seed.delegated
        ? { status: DelegatedApprovalRequestStatus.PendingDispatch }
        : undefined
    });
    store.update((state) => ({
      ...state,
      requests: [{ ...request, permissions: permissions ?? [] }, ...state.requests]
    }));
  }),
  useReviewRequest: mutation(({ requestId, status, bypassReason }) =>
    setRequest(requestId, (request) => {
      const reviewers = [
        ...request.reviewers.filter((reviewer) => reviewer.userId !== SELF),
        { userId: SELF, status, isOrgMembershipActive: true }
      ];
      if (status === "rejected")
        return { ...request, reviewers, status: ApprovalStatus.REJECTED, updatedAt: new Date() };
      const next = { ...request, reviewers };
      if (!bypassReason && !stepsSatisfied(next)) return next;
      return {
        ...next,
        status: ApprovalStatus.APPROVED,
        isApproved: true,
        bypassReason: bypassReason ?? null,
        approvedAt: new Date(),
        updatedAt: new Date(),
        privilege: {
          membershipId: `membership-${request.requestedByUserId}`,
          isTemporary: request.isTemporary,
          temporaryRange: request.temporaryRange,
          temporaryAccessStartTime: new Date(),
          temporaryAccessEndTime: request.isTemporary ? at(4 * HOUR) : null,
          permissions: request.permissions ?? [],
          isApproved: true
        }
      };
    })
  ),
  useRevokeRequest: mutation(({ requestId }) =>
    setRequest(requestId, (request) => ({
      ...request,
      status: ApprovalStatus.REVOKED,
      isApproved: false,
      revokedAt: new Date(),
      revokedByUserId: SELF,
      revokedByUser: requester(SELF)
    }))
  ),
  useRetryDispatch: mutation(({ requestId }) => {
    store.update((state) => ({ ...state, retrying: [...state.retrying, requestId] }));
    setTimeout(() => {
      store.update((state) => ({
        retrying: state.retrying.filter((id) => id !== requestId),
        requests: state.requests.map((request) =>
          request.id === requestId
            ? {
                ...request,
                delegatedApproval: {
                  status: DelegatedApprovalRequestStatus.WaitingApproval,
                  statusReason: null,
                  provider: {
                    type: DelegatedApprovalPolicyType.ServiceNow,
                    recordNumber: "RITM0010431"
                  }
                }
              }
            : request
        )
      }));
    }, 4000);
  }),
  useCancelRequest: mutation(({ requestId }) =>
    setRequest(requestId, (request) => ({
      ...request,
      status: ApprovalStatus.REJECTED,
      updatedAt: new Date(),
      delegatedApproval: request.delegatedApproval
        ? {
            ...request.delegatedApproval,
            status: DelegatedApprovalRequestStatus.Failed,
            statusReason: "Cancelled in Infisical."
          }
        : null
    }))
  )
};
