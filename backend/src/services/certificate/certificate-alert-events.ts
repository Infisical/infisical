import { Knex } from "knex";

import { logger } from "@app/lib/logger";
import { TEventEmitter } from "@app/services/event-outbox/event-outbox-types";
import { TProjectDALFactory } from "@app/services/project/project-dal";

export const CERT_MANAGER_APPLICATION_RESOURCE_TYPE = "cert-manager.application";

export enum CertificateAlertEvent {
  Expiry = "cert-manager.application.certificate.expiry",
  Issuance = "cert-manager.application.certificate.issuance",
  Renewal = "cert-manager.application.certificate.renewal",
  Revocation = "cert-manager.application.certificate.revocation"
}

export const CERT_MANAGER_RESOURCE_TYPE = "cert-manager";

export enum CertificateManagerAlertEvent {
  Expiry = "cert-manager.certificate.expiry",
  Issuance = "cert-manager.certificate.issuance",
  Renewal = "cert-manager.certificate.renewal",
  Revocation = "cert-manager.certificate.revocation"
}

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
  projectDAL: Pick<TProjectDALFactory, "findById">;
};

export type TCertificateAlertEventEmitter = ReturnType<typeof certificateAlertEventEmitterFactory>;

export const certificateAlertEventEmitterFactory = ({ eventEmitter, projectDAL }: TCertificateAlertEventEmitterDep) => {
  const $emit = async (
    { certificateId, projectId, orgId, applicationId, eventType }: TCertificateAlertEventInput,
    tx?: Knex
  ) => {
    const resolvedOrgId = orgId ?? (await projectDAL.findById(projectId, tx))?.orgId;
    if (!resolvedOrgId) return;

    const event = {
      eventType,
      payload: {
        orgId: resolvedOrgId,
        projectId,
        resourceType: CERT_MANAGER_APPLICATION_RESOURCE_TYPE,
        resourceId: applicationId ?? null,
        targetIds: [certificateId]
      }
    };

    await eventEmitter.emit(event, tx);
  };

  const emit = (input: TCertificateAlertEventInput, tx: Knex) => $emit(input, tx);

  const notify = async (input: TCertificateAlertEventInput) => {
    try {
      await $emit(input);
    } catch (error) {
      logger.warn(
        error,
        `Failed to emit certificate alert event [certificateId=${input.certificateId}] [eventType=${input.eventType}]`
      );
    }
  };

  return { emit, notify };
};
