import { TProjectPermission } from "@app/lib/types";

import { NhiIdentityStatus, NhiRemediationActionType } from "./nhi-enums";

export type TCreateNhiSourceDTO = {
  projectId: string;
  name: string;
  provider: string;
  connectionId: string;
  config?: Record<string, unknown>;
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
