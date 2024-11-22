import { EnforcementLevel, TProjectPermission } from "@app/lib/types";

import { ApproverType } from "../access-approval-policy/access-approval-policy-types";

export type TCreateSapDTO = {
  approvals: number;
  secretPaths: string[];
  environment: string;
  approvers: ({ type: ApproverType.Group; id: string } | { type: ApproverType.User; id?: string; name?: string })[];
  projectId: string;
  name: string;
  enforcementLevel: EnforcementLevel;
} & Omit<TProjectPermission, "projectId">;

export type TUpdateSapDTO = {
  secretPolicyId: string;
  approvals?: number;
  secretPaths?: string[];
  approvers: ({ type: ApproverType.Group; id: string } | { type: ApproverType.User; id?: string; name?: string })[];
  name?: string;
  enforcementLevel?: EnforcementLevel;
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
