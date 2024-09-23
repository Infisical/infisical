import { EnforcementLevel, TProjectPermission } from "@app/lib/types";

import { ApproverType } from "../access-approval-policy/access-approval-policy-types";

export type TCreateSapDTO = {
  approvals: number;
  secretPath?: string | null;
  environment: string;
  approvers: { type: ApproverType; id: string }[];
  projectId: string;
  name: string;
  enforcementLevel: EnforcementLevel;
} & Omit<TProjectPermission, "projectId">;

export type TUpdateSapDTO = {
  secretPolicyId: string;
  approvals?: number;
  secretPath?: string | null;
  approvers: { type: ApproverType; id: string }[];
  name?: string;
  enforcementLevel?: EnforcementLevel;
} & Omit<TProjectPermission, "projectId">;

export type TDeleteSapDTO = {
  secretPolicyId: string;
} & Omit<TProjectPermission, "projectId">;

export type TListSapDTO = TProjectPermission;

export type TGetBoardSapDTO = {
  projectId: string;
  environment: string;
  secretPath: string;
} & Omit<TProjectPermission, "projectId">;
