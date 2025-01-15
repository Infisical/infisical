import { OrderByDirection, TOrgPermission } from "@app/lib/types";

export enum SecretScanningRiskStatus {
  FalsePositive = "RESOLVED_FALSE_POSITIVE",
  Revoked = "RESOLVED_REVOKED",
  NotRevoked = "RESOLVED_NOT_REVOKED",
  Unresolved = "UNRESOLVED"
}

export enum SecretScanningResolvedStatus {
  All = "all",
  Resolved = "resolved",
  Unresolved = "unresolved"
}

export type TInstallAppSessionDTO = TOrgPermission;

export type TLinkInstallSessionDTO = {
  installationId: string;
  sessionId: string;
} & Omit<TOrgPermission, "orgId">;

export type TGetOrgInstallStatusDTO = TOrgPermission;

type RiskFilter = {
  offset: number;
  limit: number;
  orderBy?: "createdAt" | "name";
  orderDirection?: OrderByDirection;
  repositoryNames?: string[];
  resolvedStatus?: SecretScanningResolvedStatus;
};

export type TGetOrgRisksDTO = {
  filter: RiskFilter;
} & TOrgPermission;

export type TGetAllOrgRisksDTO = {
  filter: Omit<RiskFilter, "offset" | "limit" | "orderBy" | "orderDirection">;
} & TOrgPermission;

export type TUpdateRiskStatusDTO = {
  riskId: string;
  status: SecretScanningRiskStatus;
} & TOrgPermission;
