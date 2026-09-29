import { Knex } from "knex";

import { logger } from "@app/lib/logger";
import { TEventEmitter } from "@app/services/event-outbox/event-outbox-types";
import { TPkiAlertV2QueueServiceFactory } from "@app/services/pki-alert-v2/pki-alert-v2-queue";
import { PkiAlertEventType } from "@app/services/pki-alert-v2/pki-alert-v2-types";
import { TProjectDALFactory } from "@app/services/project/project-dal";

export const CERT_MANAGER_APPLICATION_RESOURCE_TYPE = "cert-manager.application";
export const CERT_MANAGER_CERTIFICATE_RESOURCE_TYPE = "cert-manager.certificate";

export enum CertificateAlertEvent {
  Expiry = "cert-manager.application.certificate.expiry",
  Issuance = "cert-manager.application.certificate.issuance",
  Renewal = "cert-manager.application.certificate.renewal",
  Revocation = "cert-manager.application.certificate.revocation"
}

export enum ProjectCertificateAlertEvent {
  Expiry = "cert-manager.certificate.expiry",
  Issuance = "cert-manager.certificate.issuance",
  Renewal = "cert-manager.certificate.renewal",
  Revocation = "cert-manager.certificate.revocation"
}

export const PROJECT_EVENT_BY_CERTIFICATE_ALERT_EVENT: Record<CertificateAlertEvent, ProjectCertificateAlertEvent> = {
  [CertificateAlertEvent.Expiry]: ProjectCertificateAlertEvent.Expiry,
  [CertificateAlertEvent.Issuance]: ProjectCertificateAlertEvent.Issuance,
  [CertificateAlertEvent.Renewal]: ProjectCertificateAlertEvent.Renewal,
  [CertificateAlertEvent.Revocation]: ProjectCertificateAlertEvent.Revocation
};

export const CERTIFICATE_ALERT_EVENT_BY_PROJECT_EVENT: Record<ProjectCertificateAlertEvent, CertificateAlertEvent> = {
  [ProjectCertificateAlertEvent.Expiry]: CertificateAlertEvent.Expiry,
  [ProjectCertificateAlertEvent.Issuance]: CertificateAlertEvent.Issuance,
  [ProjectCertificateAlertEvent.Renewal]: CertificateAlertEvent.Renewal,
  [ProjectCertificateAlertEvent.Revocation]: CertificateAlertEvent.Revocation
};

export const LEGACY_PKI_ALERT_EVENT_BY_CERTIFICATE_ALERT_EVENT: Record<CertificateAlertEvent, PkiAlertEventType> = {
  [CertificateAlertEvent.Expiry]: PkiAlertEventType.EXPIRATION,
  [CertificateAlertEvent.Issuance]: PkiAlertEventType.ISSUANCE,
  [CertificateAlertEvent.Renewal]: PkiAlertEventType.RENEWAL,
  [CertificateAlertEvent.Revocation]: PkiAlertEventType.REVOCATION
};

export const getIssuanceAlertEvent = (isRenewal?: boolean) =>
  isRenewal ? CertificateAlertEvent.Renewal : CertificateAlertEvent.Issuance;

export type TCertificateAlertEventInput = {
  certificateId: string;
  projectId: string;
  orgId?: string;
  applicationId?: string | null;
  eventType: CertificateAlertEvent;
};

type TCertificateAlertEventEmitterDep = {
  eventEmitter: TEventEmitter;
  projectDAL: Pick<TProjectDALFactory, "findById" | "transaction">;
  pkiAlertV2Queue: Pick<TPkiAlertV2QueueServiceFactory, "queueCertificateEvent">;
};

export type TCertificateAlertEventEmitter = ReturnType<typeof certificateAlertEventEmitterFactory>;

export const certificateAlertEventEmitterFactory = ({
  eventEmitter,
  projectDAL,
  pkiAlertV2Queue
}: TCertificateAlertEventEmitterDep) => {
  const emit = async (
    { certificateId, projectId, orgId, applicationId, eventType }: TCertificateAlertEventInput,
    tx?: Knex
  ) => {
    const resolvedOrgId = orgId ?? (await projectDAL.findById(projectId, tx))?.orgId;
    if (!resolvedOrgId) return;

    const events = [
      {
        eventType: PROJECT_EVENT_BY_CERTIFICATE_ALERT_EVENT[eventType],
        payload: {
          orgId: resolvedOrgId,
          projectId,
          resourceType: CERT_MANAGER_CERTIFICATE_RESOURCE_TYPE,
          resourceId: null,
          targetIds: [certificateId]
        }
      },
      ...(applicationId
        ? [
            {
              eventType,
              payload: {
                orgId: resolvedOrgId,
                projectId,
                resourceType: CERT_MANAGER_APPLICATION_RESOURCE_TYPE,
                resourceId: applicationId,
                targetIds: [certificateId]
              }
            }
          ]
        : [])
    ];

    const emitAll = async (trx: Knex) => {
      for (const event of events) {
        // eslint-disable-next-line no-await-in-loop -- one shared tx connection; writes must be serial
        await eventEmitter.emit(event, trx);
      }
    };

    if (tx) {
      await emitAll(tx);
      return;
    }
    await projectDAL.transaction(emitAll);
  };

  const queueLegacyAlert = async ({ certificateId, projectId, eventType }: TCertificateAlertEventInput) => {
    try {
      await pkiAlertV2Queue.queueCertificateEvent({
        certificateId,
        projectId,
        eventType: LEGACY_PKI_ALERT_EVENT_BY_CERTIFICATE_ALERT_EVENT[eventType]
      });
    } catch (error) {
      logger.warn(
        error,
        `Failed to queue legacy PKI alert event [certificateId=${certificateId}] [eventType=${eventType}]`
      );
    }
  };

  const notify = async (input: TCertificateAlertEventInput) => {
    try {
      await emit(input);
    } catch (error) {
      logger.warn(
        error,
        `Failed to emit certificate alert event [certificateId=${input.certificateId}] [eventType=${input.eventType}]`
      );
    }
    await queueLegacyAlert(input);
  };

  return { emit, queueLegacyAlert, notify };
};
