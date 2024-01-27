import { TOrgPermission } from "@app/lib/types";

export enum SecretScanningRiskStatus {
  FalsePositive = "RESOLVED_FALSE_POSITIVE",
  Revoked = "RESOLVED_REVOKED",
  NotRevoked = "RESOLVED_NOT_REVOKED",
  Unresolved = "UNRESOLVED"
}

export type TInstallAppSessionDTO = TOrgPermission;

export type TLinkInstallSessionDTO = {
  installationId: string;
  sessionId: string;
} & Omit<TOrgPermission, "orgId">;

export type TGetOrgInstallStatusDTO = TOrgPermission;

export type TGetOrgRisksDTO = TOrgPermission;

export type TUpdateRiskStatusDTO = {
  riskId: string;
  status: SecretScanningRiskStatus;
} & TOrgPermission;
