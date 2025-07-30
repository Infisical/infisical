import { EnforcementLevel, TProjectPermission } from "@app/lib/types";

import { ApproverType, BypasserType } from "../access-approval-policy/access-approval-policy-types";

export type TCreateSapDTO = {
  approvals: number;
  secretPath: string;
  environment?: string;
  environments?: string[];
  approvers: ({ type: ApproverType.Group; id: string } | { type: ApproverType.User; id?: string; username?: string })[];
  bypassers?: (
    | { type: BypasserType.Group; id: string }
    | { type: BypasserType.User; id?: string; username?: string }
  )[];
  projectId: string;
  name: string;
  enforcementLevel: EnforcementLevel;
  allowedSelfApprovals: boolean;
} & Omit<TProjectPermission, "projectId">;

export type TUpdateSapDTO = {
  secretPolicyId: string;
  approvals?: number;
  secretPath?: string;
  approvers: ({ type: ApproverType.Group; id: string } | { type: ApproverType.User; id?: string; username?: string })[];
  bypassers?: (
    | { type: BypasserType.Group; id: string }
    | { type: BypasserType.User; id?: string; username?: string }
  )[];
  name?: string;
  enforcementLevel?: EnforcementLevel;
  allowedSelfApprovals?: boolean;
  environments?: string[];
} & Omit<TProjectPermission, "projectId">;

export type TDeleteSapDTO = {
  secretPolicyId: string;
} & Omit<TProjectPermission, "projectId">;

export type TListSapDTO = TProjectPermission;

export type TGetSapByIdDTO = Omit<TProjectPermission, "projectId"> & { sapId: string };

export type TGetBoardSapDTO = {
  projectId: string;
  environment: string;
  secretPath: string;
} & Omit<TProjectPermission, "projectId">;
