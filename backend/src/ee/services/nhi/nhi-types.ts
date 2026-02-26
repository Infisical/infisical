import { TProjectPermission } from "@app/lib/types";

import { NhiIdentityStatus, NhiRemediationActionType } from "./nhi-enums";

// --- Policy DTOs ---

export type TCreateNhiPolicyDTO = {
  projectId: string;
  name: string;
  description?: string;
  isEnabled?: boolean;
  conditionRiskFactors?: string[];
  conditionMinRiskScore?: number;
  conditionIdentityTypes?: string[];
  conditionProviders?: string[];
  actionRemediate?: string;
  actionFlag?: boolean;
} & Omit<TProjectPermission, "projectId">;

export type TUpdateNhiPolicyDTO = {
  policyId: string;
  projectId: string;
  name?: string;
  description?: string | null;
  isEnabled?: boolean;
  conditionRiskFactors?: string[] | null;
  conditionMinRiskScore?: number | null;
  conditionIdentityTypes?: string[] | null;
  conditionProviders?: string[] | null;
  actionRemediate?: string | null;
  actionFlag?: boolean;
} & Omit<TProjectPermission, "projectId">;

export type TDeleteNhiPolicyDTO = {
  policyId: string;
  projectId: string;
} & Omit<TProjectPermission, "projectId">;

export type TListNhiPoliciesDTO = {
  projectId: string;
} & Omit<TProjectPermission, "projectId">;

export type TGetPolicyExecutionsDTO = {
  policyId: string;
  projectId: string;
} & Omit<TProjectPermission, "projectId">;

export type TListRecentExecutionsDTO = {
  projectId: string;
} & Omit<TProjectPermission, "projectId">;

export type TCreateNhiSourceDTO = {
  projectId: string;
  name: string;
  provider: string;
  connectionId?: string;
  config?: Record<string, unknown>;
  scanSchedule?: string;
} & Omit<TProjectPermission, "projectId">;

export type TUpdateNhiSourceDTO = {
  sourceId: string;
  projectId: string;
  name?: string;
  scanSchedule?: string | null;
} & Omit<TProjectPermission, "projectId">;

export type TDeleteNhiSourceDTO = {
  sourceId: string;
  projectId: string;
} & Omit<TProjectPermission, "projectId">;

export type TListNhiSourcesDTO = {
  projectId: string;
} & Omit<TProjectPermission, "projectId">;

export type TTriggerNhiScanDTO = {
  sourceId: string;
  projectId: string;
} & Omit<TProjectPermission, "projectId">;

export type TListNhiScansDTO = {
  sourceId: string;
  projectId: string;
} & Omit<TProjectPermission, "projectId">;

export type TGetNhiScanDTO = {
  scanId: string;
  projectId: string;
} & Omit<TProjectPermission, "projectId">;

export type TListNhiIdentitiesDTO = {
  projectId: string;
  search?: string;
  riskLevel?: string;
  type?: string;
  sourceId?: string;
  provider?: string;
  status?: string;
  ownerFilter?: string;
  page: number;
  limit: number;
  sortBy?: string;
  sortDir?: "asc" | "desc";
} & Omit<TProjectPermission, "projectId">;

export type TGetNhiIdentityByIdDTO = {
  identityId: string;
  projectId: string;
} & Omit<TProjectPermission, "projectId">;

export type TUpdateNhiIdentityDTO = {
  identityId: string;
  projectId: string;
  ownerEmail?: string;
  status?: NhiIdentityStatus;
} & Omit<TProjectPermission, "projectId">;

export type TGetNhiStatsDTO = {
  projectId: string;
} & Omit<TProjectPermission, "projectId">;

export type TExecuteRemediationDTO = {
  identityId: string;
  projectId: string;
  actionType: NhiRemediationActionType;
  riskFactor?: string;
} & Omit<TProjectPermission, "projectId">;

export type TListRemediationActionsDTO = {
  identityId: string;
  projectId: string;
} & Omit<TProjectPermission, "projectId">;

export type TGetRecommendedActionsDTO = {
  identityId: string;
  projectId: string;
} & Omit<TProjectPermission, "projectId">;

export type TAcceptNhiIdentityRiskDTO = {
  identityId: string;
  projectId: string;
  reason: string;
  expiresAt?: string;
} & Omit<TProjectPermission, "projectId">;

export type TRevokeNhiIdentityRiskAcceptanceDTO = {
  identityId: string;
  projectId: string;
} & Omit<TProjectPermission, "projectId">;
