import { EnforcementLevel, PolicyType } from "../policies/enums";
import { TProjectPermission } from "../roles/types";
import { ApprovalStatus } from "../secretApprovalRequest/types";
import { WorkspaceEnv } from "../workspace/types";

export type TAccessApprovalPolicy = {
  id: string;
  name: string;
  approvals: number;
  secretPath: string;
  workspace: string;
  environments: WorkspaceEnv[];
  projectId: string;
  policyType: PolicyType;
  approversRequired: boolean;
  enforcementLevel: EnforcementLevel;
  updatedAt: Date;
  approvers?: Approver[];
  bypassers?: Bypasser[];
  allowedSelfApprovals: boolean;
  maxTimePeriod?: string | null;
};

export enum ApproverType {
  User = "user",
  Group = "group"
}

export enum BypasserType {
  User = "user",
  Group = "group"
}

export type Approver = {
  id: string;
  type: ApproverType;
  sequence?: number;
  approvalsRequired?: number;
  isOrgMembershipActive: boolean;
};

export type Bypasser = {
  id: string;
  type: BypasserType;
};

export type TAccessApprovalRequest = {
  id: string;
  policyId: string;
  privilegeId: string | null;
  requestedByUserId: string;
  requestedByUser: {
    email: string;
    firstName?: string;
    lastName?: string;
    userId: string;
    username: string;
  };
  createdAt: Date;
  updatedAt: Date;
  isTemporary: boolean;
  temporaryRange: string | null | undefined;

  permissions: TProjectPermission[] | null;

  // Computed
  environmentName: string;
  isApproved: boolean;

  privilege: {
    membershipId: string;
    isTemporary: boolean;
    temporaryMode?: string | null;
    temporaryRange?: string | null;
    temporaryAccessStartTime?: Date | null;
    temporaryAccessEndTime?: Date | null;
    permissions: TProjectPermission[];
    isApproved: boolean;
  } | null;
  status: ApprovalStatus;
  policy: {
    id: string;
    name: string;
    approvals: number;
    approvers: {
      isOrgMembershipActive: boolean;
      userId: string;
      sequence?: number;
      approvalsRequired?: number;
      username: string;
      email: string;
    }[];
    bypassers: string[];
    secretPath?: string | null;
    envId: string;
    enforcementLevel: EnforcementLevel;
    deletedAt: Date | null;
    allowedSelfApprovals: boolean;
    maxTimePeriod?: string | null;
  };

  reviewers: {
    isOrgMembershipActive: boolean;
    userId: string;
    status: string;
  }[];

  note?: string;
  editNote?: string;
  editedByUserId?: string;
};

export type TAccessApproval = {
  id: string;
  policyId: string;
  privilegeId: string;
  requestedBy: string;
};

export type TAccessRequestCount = {
  pendingCount: number;
  finalizedCount: number;
};

export type TProjectUserPrivilege = {
  projectMembershipId: string;
  slug: string;
  id: string;
  createdAt: Date;
  updatedAt: Date;
  permissions?: TProjectPermission[];
} & (
  | {
      isTemporary: true;
      temporaryMode: string;
      temporaryRange: string;
      temporaryAccessStartTime: string;
      temporaryAccessEndTime?: string;
    }
  | {
      isTemporary: false;
      temporaryMode?: null;
      temporaryRange?: null;
      temporaryAccessStartTime?: null;
      temporaryAccessEndTime?: null;
    }
);

export type TCreateAccessRequestDTO = {
  projectSlug: string;
  note?: string;
} & Omit<TProjectUserPrivilege, "id" | "createdAt" | "updatedAt" | "slug" | "projectMembershipId">;

export type TUpdateAccessRequestDTO = {
  requestId: string;
  editNote: string;
  temporaryRange: string;
  projectSlug: string;
};

export type TGetAccessApprovalRequestsDTO = {
  projectSlug: string;
  policyId?: string;
  envSlug?: string;
  authorUserId?: string;
};

export type TGetAccessPolicyApprovalCountDTO = {
  projectSlug: string;
  envSlug: string;
};

export type TGetSecretApprovalPolicyOfBoardDTO = {
  workspaceId: string;
  environment: string;
  secretPath: string;
};

export type TCreateAccessPolicyDTO = {
  projectSlug: string;
  name?: string;
  environments: string[];
  approvers?: Omit<Approver, "isOrgMembershipActive">[];
  bypassers?: Bypasser[];
  approvals?: number;
  secretPath: string;
  enforcementLevel?: EnforcementLevel;
  allowedSelfApprovals: boolean;
  approvalsRequired?: { numberOfApprovals: number; stepNumber: number }[];
  maxTimePeriod?: string | null;
};

export type TUpdateAccessPolicyDTO = {
  id: string;
  name?: string;
  approvers?: Omit<Approver, "isOrgMembershipActive">[];
  bypassers?: Bypasser[];
  secretPath?: string;
  environments?: string[];
  approvals?: number;
  enforcementLevel?: EnforcementLevel;
  allowedSelfApprovals: boolean;
  // for invalidating list
  projectSlug: string;
  approvalsRequired?: { numberOfApprovals: number; stepNumber: number }[];
  maxTimePeriod?: string | null;
};

export type TDeleteSecretPolicyDTO = {
  id: string;
  // for invalidating list
  projectSlug: string;
};
