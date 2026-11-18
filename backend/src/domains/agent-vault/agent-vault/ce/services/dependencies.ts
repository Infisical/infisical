import type { TActorContext } from "@app/domains/lib/actor-context";
import { TGrantActor } from "@app/domains/platform/access-control/ce/module";
import { ProjectPermission } from "@app/domains/platform/projects/ce/module";

import {
  AgentVaultAccessState,
  AgentVaultFreeUsageThreshold,
  TAgentVaultAccessJSON,
  TAgentVaultFreeUsageJSON
} from "../models/agent-vault-access-state";

// Agent Vault billing is EE (ee/), so other code reaches it only through these types.
export type TAgentVaultAccessDecision = {
  readonly allowed: boolean;
  readonly state: AgentVaultAccessState;
  readonly freeUsage: TAgentVaultFreeUsageJSON | null;
  readonly warn: boolean;
  // Throws a RuleViolationError named AgentVaultFreeLimitReached, which the CLI keys on.
  assertAllowed(): void;
  toJSON(): TAgentVaultAccessJSON;
};

export type TAgentVaultAccessService = {
  // For calls the proxy makes on every poll: reads the free count only when the plan says no.
  assertCanBroker(orgId: string): Promise<void>;
  // For the UI. Reads only.
  getAccess(orgId: string): Promise<TAgentVaultAccessDecision>;
};

export type TRecordProxyUsageInput = {
  orgId: string;
  reportId: string;
  endedAt: Date;
  brokered: number;
};

// A free-tier root org's count at or past a notice threshold this month, with no notice sent yet. Whoever is handed
// one holds a short lock on it and must call `completeNotice` once the notice is delivered, or `releaseNotice` if it
// failed, so a later report retries.
export type TAgentVaultFreeUsageCrossing = {
  rootOrgId: string;
  threshold: AgentVaultFreeUsageThreshold;
  // The threshold as a whole percent of the free requests.
  percent: number;
  // YYYY-MM, UTC.
  month: string;
  limit: number;
  resetsAt: Date;
};

export type TAgentVaultUsageService = {
  recordProxyUsage(input: TRecordProxyUsageInput): Promise<TAgentVaultFreeUsageCrossing[]>;
  completeNotice(crossing: TAgentVaultFreeUsageCrossing): Promise<void>;
  releaseNotice(crossing: TAgentVaultFreeUsageCrossing): Promise<void>;
};

export type TGetAccessBundlePermissionInput = {
  actor: TActorContext;
  projectId: string;
};

export type TAgentVaultPermission = {
  permission: ProjectPermission;
};

export type TAgentVaultReachability = TAgentVaultPermission & {
  // A role that reaches every bundle without a grant (the built-in admin).
  reachesEveryBundle: boolean;
  // The bundles the actor reaches: null for every bundle, otherwise the ones it is granted.
  accessBundleIds: string[] | null;
};

export type TAgentVaultGrantedReachability = TAgentVaultReachability & {
  // The bundles granted to the actor, directly or through a group, whatever its role: what "mine" means for an actor
  // that reaches every bundle.
  grantedAccessBundleIds: string[];
};

// What the actor may do in an Agent Vault project, and which access bundles it reaches. Reaching a bundle is a filter
// the services apply, not a CASL condition (conditions interpolate only identity.id, username and metadata).
export type TAccessBundlePermissionService = {
  // The project permission alone. Refuses a project of another type and a non-member.
  getAgentVaultPermission(input: TGetAccessBundlePermissionInput): Promise<TAgentVaultPermission>;
  // The permission and the bundles the actor reaches. An actor that is not a user or an identity reaches none.
  getAccessBundlePermission(input: TGetAccessBundlePermissionInput): Promise<TAgentVaultReachability>;
  // The same, plus the bundles granted to the actor whatever its role.
  getGrantedAccessBundlePermission(input: TGetAccessBundlePermissionInput): Promise<TAgentVaultGrantedReachability>;
  // The bundles granted to the actor, directly or through one of the groups given. Pass only the groups that hold a
  // live role in the project: a group's grants count only while it does.
  findReachableAccessBundleIds(input: { projectId: string; actor: TGrantActor; groupIds: string[] }): Promise<string[]>;
  // The bundles both reach, where null reaches every bundle (so it returns the other side unchanged).
  intersectAccessBundleIds(a: string[] | null, b: string[] | null): string[] | null;
};
