import { TProjectPermission } from "@app/lib/types";

export type TCreateAccessApprovalPolicy = {
  approvals: number;
  environment: string;
  approvers: string[];
  projectId: string;
  name: string;
} & Omit<TProjectPermission, "projectId">;

export type TUpdateAccessApprovalPolicy = {
  policyId: string;
  approvals?: number;
  approvers: string[];
  name?: string;
} & Omit<TProjectPermission, "projectId">;

export type TDeleteAccessApprovalPolicy = {
  policyId: string;
} & Omit<TProjectPermission, "projectId">;

export type TListAccessApprovalPoliciesDTO = TProjectPermission;

export type TGetBoardAccessApprovalPolicy = {
  projectId: string;
  environment: string;
} & Omit<TProjectPermission, "projectId">;
