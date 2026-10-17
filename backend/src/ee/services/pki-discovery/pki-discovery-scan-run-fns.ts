import { logger } from "@app/lib/logger";
import { TTelemetryServiceFactory } from "@app/services/telemetry/telemetry-service";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

import { TPkiDiscoveryConfigDALFactory } from "./pki-discovery-config-dal";
import { TPkiDiscoveryScanHistoryDALFactory } from "./pki-discovery-scan-history-dal";
import { PkiDiscoveryScanStatus, PkiDiscoveryType } from "./pki-discovery-types";

export const DB_SHORT_VARCHAR_LIMIT = 255;
export const DB_VARCHAR_LIMIT = 4096;

export const truncateString = (value: string | null | undefined, maxLength: number): string | null => {
  if (value === null || value === undefined) {
    return null;
  }
  if (value.length <= maxLength) {
    return value;
  }
  const truncationSuffix = "... (truncated)";
  return value.substring(0, maxLength - truncationSuffix.length) + truncationSuffix;
};

type TScanRunDeps = {
  pkiDiscoveryConfigDAL: Pick<TPkiDiscoveryConfigDALFactory, "transaction" | "updateById" | "findById">;
  pkiDiscoveryScanHistoryDAL: Pick<TPkiDiscoveryScanHistoryDALFactory, "create" | "updateById" | "deleteById">;
};

export const startScanRun = async (discoveryId: string, startedAt: Date, deps: TScanRunDeps): Promise<string> => {
  const history = await deps.pkiDiscoveryConfigDAL.transaction(async (tx) => {
    const created = await deps.pkiDiscoveryScanHistoryDAL.create(
      {
        discoveryConfigId: discoveryId,
        startedAt,
        status: PkiDiscoveryScanStatus.Running,
        targetsScannedCount: 0,
        certificatesFoundCount: 0,
        installationsFoundCount: 0
      },
      tx
    );
    await deps.pkiDiscoveryConfigDAL.updateById(
      discoveryId,
      { lastScanStatus: PkiDiscoveryScanStatus.Running, lastScanJobId: created.id },
      tx
    );
    return created;
  });
  return history.id;
};

export const discardScanRunIfDeleted = async (
  discoveryId: string,
  scanHistoryId: string,
  deps: TScanRunDeps
): Promise<boolean> => {
  const discoveryConfig = await deps.pkiDiscoveryConfigDAL.findById(discoveryId);
  if (discoveryConfig) return false;
  logger.warn({ discoveryId }, "Discovery config was deleted during scan, aborting result processing");
  await deps.pkiDiscoveryScanHistoryDAL.deleteById(scanHistoryId);
  return true;
};

export const finishScanRun = async (
  {
    discoveryId,
    scanHistoryId,
    status,
    completedAt,
    targetsScannedCount,
    certificatesFoundCount,
    installationsFoundCount,
    errorMessage
  }: {
    discoveryId: string;
    scanHistoryId: string;
    status: PkiDiscoveryScanStatus;
    completedAt: Date;
    targetsScannedCount: number;
    certificatesFoundCount: number;
    installationsFoundCount: number;
    errorMessage: string | null;
  },
  deps: TScanRunDeps
) => {
  await deps.pkiDiscoveryConfigDAL.transaction(async (tx) => {
    await deps.pkiDiscoveryScanHistoryDAL.updateById(
      scanHistoryId,
      { status, completedAt, targetsScannedCount, certificatesFoundCount, installationsFoundCount, errorMessage },
      tx
    );
    await deps.pkiDiscoveryConfigDAL.updateById(
      discoveryId,
      {
        lastScanStatus: status,
        lastScannedAt: completedAt,
        lastScanMessage: truncateString(errorMessage, DB_VARCHAR_LIMIT)
      },
      tx
    );
  });
};

export const failScanRun = async (
  discoveryId: string,
  scanHistoryId: string | undefined,
  error: unknown,
  deps: TScanRunDeps
) => {
  const message = truncateString(error instanceof Error ? error.message : "Unknown error", DB_VARCHAR_LIMIT);
  await deps.pkiDiscoveryConfigDAL.transaction(async (tx) => {
    if (scanHistoryId) {
      await deps.pkiDiscoveryScanHistoryDAL.updateById(
        scanHistoryId,
        { status: PkiDiscoveryScanStatus.Failed, completedAt: new Date(), errorMessage: message },
        tx
      );
    }
    await deps.pkiDiscoveryConfigDAL.updateById(
      discoveryId,
      { lastScanStatus: PkiDiscoveryScanStatus.Failed, lastScanMessage: message },
      tx
    );
  });
};

export const sendScanCompletedTelemetry = async (
  telemetryService: Pick<TTelemetryServiceFactory, "sendPostHogEvents"> | undefined,
  {
    discoveryId,
    discoveryType,
    projectId,
    orgId,
    status,
    certificatesFound,
    installationsFound,
    durationMs
  }: {
    discoveryId: string;
    discoveryType: PkiDiscoveryType;
    projectId: string;
    orgId: string;
    status: PkiDiscoveryScanStatus;
    certificatesFound: number;
    installationsFound: number;
    durationMs: number;
  }
) => {
  if (!telemetryService) return;
  try {
    await telemetryService.sendPostHogEvents({
      event: PostHogEventTypes.PkiDiscoveryScanCompleted,
      distinctId: `platform/${projectId}`,
      organizationId: orgId,
      properties: { orgId, projectId, discoveryType, status, certificatesFound, installationsFound, durationMs }
    });
  } catch (telemetryError) {
    logger.error(telemetryError, `Failed to send PKI discovery scan telemetry [discoveryId=${discoveryId}]`);
  }
};
