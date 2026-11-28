import { OrderByDirection, TActorInput } from "@app/lib/types";

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

export type TInstallAppSessionDTO = { orgId: string } & TActorInput;

export type TLinkInstallSessionDTO = {
  installationId: string;
  sessionId: string;
} & TActorInput;

export type TGetOrgInstallStatusDTO = { orgId: string } & TActorInput;

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
  orgId: string;
} & TActorInput;

export type TGetAllOrgRisksDTO = {
  filter: Omit<RiskFilter, "offset" | "limit" | "orderBy" | "orderDirection">;
  orgId: string;
} & TActorInput;

export type TUpdateRiskStatusDTO = {
  riskId: string;
  status: SecretScanningRiskStatus;
  orgId: string;
} & TActorInput;
