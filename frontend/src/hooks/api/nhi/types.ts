export enum NhiProvider {
  AWS = "aws",
  GitHub = "github"
}

export enum NhiIdentityType {
  IamUser = "iam_user",
  IamRole = "iam_role",
  IamAccessKey = "iam_access_key",
  GitHubAppInstallation = "github_app_installation",
  GitHubDeployKey = "github_deploy_key",
  GitHubFinegrainedPat = "github_finegrained_pat"
}

export enum NhiScanStatus {
  Scanning = "scanning",
  Completed = "completed",
  Failed = "failed"
}

export enum NhiIdentityStatus {
  Active = "active",
  Inactive = "inactive",
  Flagged = "flagged"
}

export type TNhiRiskFactor = {
  factor: string;
  severity: "critical" | "high" | "medium" | "low";
  description: string;
};

export type TNhiSource = {
  id: string;
  projectId: string;
  name: string;
  provider: string;
  connectionId: string | null;
  config: Record<string, unknown> | null;
  lastScanStatus: NhiScanStatus | null;
  lastScanMessage: string | null;
  lastScannedAt: string | null;
  lastIdentitiesFound: number | null;
  createdAt: string;
  updatedAt: string;
};

export type TNhiIdentity = {
  id: string;
  sourceId: string;
  projectId: string;
  externalId: string;
  name: string;
  type: string;
  provider: string;
  metadata: Record<string, unknown>;
  riskScore: number;
  riskFactors: TNhiRiskFactor[];
  ownerEmail: string | null;
  status: string;
  lastActivityAt: string | null;
  lastSeenAt: string;
  createdAt: string;
  updatedAt: string;
  sourceName?: string | null;
};

export type TNhiScan = {
  id: string;
  sourceId: string;
  projectId: string;
  status: string;
  statusMessage: string | null;
  identitiesFound: number | null;
  createdAt: string;
  updatedAt: string;
};

export type TNhiStats = {
  total: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  unownedCount: number;
  avgRiskScore: number;
};

export enum NhiRemediationActionType {
  DeactivateAccessKey = "deactivate_access_key",
  DeleteAccessKey = "delete_access_key",
  DeactivateAllAccessKeys = "deactivate_all_access_keys",
  RemoveAdminPoliciesUser = "remove_admin_policies_user",
  RemoveAdminPoliciesRole = "remove_admin_policies_role",
  DeleteDeployKey = "delete_deploy_key",
  RevokeFinegrainedPat = "revoke_finegrained_pat",
  SuspendAppInstallation = "suspend_app_installation"
}

export enum NhiRemediationStatus {
  Pending = "pending",
  InProgress = "in_progress",
  Completed = "completed",
  Failed = "failed"
}

export type TNhiRecommendedAction = {
  actionType: NhiRemediationActionType;
  label: string;
  description: string;
  severity: string;
  riskFactor: string;
};

export type TNhiRemediationAction = {
  id: string;
  identityId: string;
  projectId: string;
  sourceId: string;
  actionType: string;
  status: string;
  statusMessage: string | null;
  triggeredBy: string;
  riskFactor: string | null;
  metadata: Record<string, unknown>;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export enum NhiPolicyActionTaken {
  Remediate = "remediate",
  Flag = "flag",
  RemediateAndFlag = "remediate_and_flag"
}

export type TNhiPolicy = {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  isEnabled: boolean;
  conditionRiskFactors: string[] | null;
  conditionMinRiskScore: number | null;
  conditionIdentityTypes: string[] | null;
  conditionProviders: string[] | null;
  actionRemediate: string | null;
  actionFlag: boolean;
  lastTriggeredAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TNhiPolicyExecution = {
  id: string;
  policyId: string;
  identityId: string;
  scanId: string;
  projectId: string;
  actionTaken: string;
  remediationActionId: string | null;
  status: string;
  statusMessage: string | null;
  policyName?: string | null;
  identityName?: string | null;
  createdAt: string;
  updatedAt: string;
};
