import { EnforcementLevel } from "../policies/enums";
import { ProjectEnv } from "../projects/types";

export type TSecretApprovalPolicy = {
  id: string;
  project: string;
  name: string;
  environments: ProjectEnv[];
  secretPath?: string;
  approvals: number;
  approvers: Approver[];
  updatedAt: Date;
  enforcementLevel: EnforcementLevel;
  allowedSelfApprovals: boolean;
  bypassForMachineIdentities: boolean;
  enforceOnSecretImports: boolean;
};

export enum ApproverType {
  User = "user",
  Group = "group"
}

export type Approver = {
  isOrgMembershipActive: boolean;
  id: string;
  type: ApproverType;
};

export enum BypasserType {
  User = "user",
  Group = "group"
}

export type Bypasser = {
  id: string;
  type: BypasserType;
};

export type TSecretApprovalPolicyApproverInput =
  | {
      type: "user";
      id?: string;
      username?: string;
    }
  | {
      type: "group";
      id: string;
    };

export type TSecretApprovalPolicyBypasserInput =
  | {
      type: "user";
      id?: string;
      username?: string;
    }
  | {
      type: "group";
      id: string;
    };

export type TGetSecretApprovalPoliciesDTO = {
  projectId: string;
};

export type TListSecretApprovalPolicyImportsDTO = {
  policyId: string;
  isReplication?: boolean;
};

export type TSecretApprovalPolicyImport = {
  id: string;
  environment: { slug: string; name: string };
  secretPath: string;
  sourceEnvironment: { slug: string; name: string };
  sourceSecretPath: string;
  isReplication: boolean;
};

export type TGetSecretApprovalPolicyOfBoardDTO = {
  projectId: string;
  environment: string;
  secretPath: string;
};

export type TCreateSecretPolicyDTO = {
  projectId: string;
  name?: string;
  environments: string[];
  secretPath: string;
  approvers?: TSecretApprovalPolicyApproverInput[];
  bypassers?: TSecretApprovalPolicyBypasserInput[];
  approvals?: number;
  enforcementLevel: EnforcementLevel;
  allowedSelfApprovals: boolean;
  bypassForMachineIdentities?: boolean;
  enforceOnSecretImports?: boolean;
};

export type TUpdateSecretPolicyDTO = {
  id: string;
  name?: string;
  approvers?: TSecretApprovalPolicyApproverInput[];
  bypassers?: TSecretApprovalPolicyBypasserInput[];
  secretPath?: string;
  approvals?: number;
  allowedSelfApprovals?: boolean;
  bypassForMachineIdentities?: boolean;
  enforceOnSecretImports?: boolean;
  enforcementLevel?: EnforcementLevel;
  // for invalidating list
  projectId: string;
  environments?: string[];
};

export type TDeleteSecretPolicyDTO = {
  id: string;
  // for invalidating list
  projectId: string;
};
