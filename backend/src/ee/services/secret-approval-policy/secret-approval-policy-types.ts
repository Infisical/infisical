import { EnforcementLevel, TProjectPermission } from "@app/lib/types";

export type TCreateSapDTO = {
  approvals: number;
  secretPath?: string | null;
  environment: string;
  approvers?: string[];
  approverUsernames?: string[];
  projectId: string;
  name: string;
  enforcementLevel: EnforcementLevel;
} & Omit<TProjectPermission, "projectId">;

export type TUpdateSapDTO = {
  secretPolicyId: string;
  approvals?: number;
  secretPath?: string | null;
  approvers?: string[];
  approverUsernames?: string[];
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
