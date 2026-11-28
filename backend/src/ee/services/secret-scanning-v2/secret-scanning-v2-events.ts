import crypto from "node:crypto";

import { Knex } from "knex";
import { z } from "zod";

import { TEventEmitter } from "@app/lib/knex/event-emitter";

export const SECRET_SCANNING_RESOURCE_TYPE = "secret-scanning.data-source";

export enum SecretScanningAlertEvent {
  SecretsDetected = "secret-scanning.data-source.secrets-detected",
  ScanFailed = "secret-scanning.data-source.scan-failed"
}

export const SecretScanningSecretsDetectedPayloadSchema = z.object({
  unresolvedFindings: z.number().int().positive()
});

export const SecretScanningScanFailedPayloadSchema = z.object({
  errorMessage: z.string()
});

type TScanEventInput = {
  orgId: string;
  projectId: string;
  dataSourceId: string;
  scanId: string;
};

// Alerts are bound to one data source, so the event names it as its resource: the alert module only delivers it to
// that data source's alerts.
const emitScanEvent = (
  eventEmitter: TEventEmitter,
  type: SecretScanningAlertEvent,
  { orgId, projectId, dataSourceId, scanId }: TScanEventInput,
  data: Record<string, unknown>,
  tx: Knex
): Promise<void> =>
  eventEmitter.emit(
    [
      {
        id: crypto.randomUUID(),
        type,
        data: {
          orgId,
          projectId,
          resourceType: SECRET_SCANNING_RESOURCE_TYPE,
          resourceId: dataSourceId,
          targetIds: [scanId],
          ...data
        }
      }
    ],
    tx
  );

export const emitSecretScanningSecretsDetected = (
  eventEmitter: TEventEmitter,
  { unresolvedFindings, ...input }: TScanEventInput & { unresolvedFindings: number },
  tx: Knex
): Promise<void> =>
  emitScanEvent(eventEmitter, SecretScanningAlertEvent.SecretsDetected, input, { unresolvedFindings }, tx);

export const emitSecretScanningScanFailed = (
  eventEmitter: TEventEmitter,
  { errorMessage, ...input }: TScanEventInput & { errorMessage: string },
  tx: Knex
): Promise<void> => emitScanEvent(eventEmitter, SecretScanningAlertEvent.ScanFailed, input, { errorMessage }, tx);

export const SECRET_SCANNING_ALERT_NAMES: Record<SecretScanningAlertEvent, string> = {
  [SecretScanningAlertEvent.SecretsDetected]: "Secrets detected",
  [SecretScanningAlertEvent.ScanFailed]: "Secret scanning failed"
};

// What a data source starts with unless its creator chooses otherwise: the notifications its project's admins got
// before secret scanning used alerts. Existing data sources got these from a migration.
export const SECRET_SCANNING_DEFAULT_ALERTS: { eventType: SecretScanningAlertEvent; name: string }[] = Object.values(
  SecretScanningAlertEvent
).map((eventType) => ({ eventType, name: SECRET_SCANNING_ALERT_NAMES[eventType] }));
