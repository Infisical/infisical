import { logger } from "@app/lib/logger";
import {
  parseEventPayload,
  runEventsConcurrentlyByKey,
  runEventsSerially
} from "@app/services/event-outbox/event-outbox-fns";
import {
  EventResultStatus,
  IEventConsumer,
  MAX_OUTBOX_ATTEMPTS,
  TEvent,
  TEventConsumerResult
} from "@app/services/event-outbox/event-outbox-types";

import {
  SecretChangePolicyModifiedEventV1,
  TSecretChangePolicyModifiedEventData
} from "../secret-change-policy/secret-change-policy-events";
import {
  SecretImportReplicationConversionRequestedEventV1,
  TSecretImportReplicationConversionRequestedEventData
} from "./secret-import-enforcement-events";
import { TSecretImportEnforcementServiceFactory } from "./secret-import-enforcement-service";

export const SECRET_IMPORT_ENFORCEMENT_POLICY_CONSUMER = "secret-import-enforcement-policy";
export const SECRET_IMPORT_REPLICATION_CONVERSION_CONSUMER = "secret-import-replication-conversion";

const CONVERSION_CONCURRENCY = 5;

const toErrorMessage = (error: unknown) => (error instanceof Error ? error.message : "Unknown error");

export const secretImportEnforcementPolicyConsumerFactory = ({
  secretImportEnforcementService
}: {
  secretImportEnforcementService: Pick<TSecretImportEnforcementServiceFactory, "requestConversions">;
}): IEventConsumer<TSecretChangePolicyModifiedEventData> => {
  const $handleEvent = async (event: TEvent): Promise<TEventConsumerResult> => {
    const { data, failure } = parseEventPayload(event, SecretChangePolicyModifiedEventV1.data, "secret change policy");
    if (failure) return failure;

    try {
      const requested = await secretImportEnforcementService.requestConversions(data);
      if (requested) {
        logger.info(
          `Requested secret import conversions for a secret change policy change [policyId=${data.policyId}] [imports=${requested}]`
        );
      }
      return { id: event.id, status: EventResultStatus.Delivered };
    } catch (error) {
      logger.warn(error, `Failed to find secret imports to convert [policyId=${data.policyId}]`);
      return { id: event.id, status: EventResultStatus.Retry, error: toErrorMessage(error) };
    }
  };

  return {
    name: SECRET_IMPORT_ENFORCEMENT_POLICY_CONSUMER,
    subscribesTo: (type: string) => type === SecretChangePolicyModifiedEventV1.type,
    dataSchema: SecretChangePolicyModifiedEventV1.data,
    handle: (events) => runEventsSerially(events, $handleEvent)
  };
};

export const secretImportReplicationConversionConsumerFactory = ({
  secretImportEnforcementService
}: {
  secretImportEnforcementService: Pick<
    TSecretImportEnforcementServiceFactory,
    "convertImport" | "auditConversionFailure"
  >;
}): IEventConsumer<TSecretImportReplicationConversionRequestedEventData> => {
  const $handleEvent = async (event: TEvent): Promise<TEventConsumerResult> => {
    const { data, failure } = parseEventPayload(
      event,
      SecretImportReplicationConversionRequestedEventV1.data,
      "secret import conversion"
    );
    if (failure) return failure;

    try {
      await secretImportEnforcementService.convertImport(data);
      return { id: event.id, status: EventResultStatus.Delivered };
    } catch (error) {
      const message = toErrorMessage(error);
      if (event.isFinalAttempt) {
        logger.error(error, `Gave up converting a secret import [secretImportId=${data.secretImportId}]`);
        await secretImportEnforcementService.auditConversionFailure(
          data,
          `Infisical could not convert this import to a replication import after ${MAX_OUTBOX_ATTEMPTS} attempts (${message}). It still reads the source directly. Save the secret change policy again to retry.`
        );
        return { id: event.id, status: EventResultStatus.Failed, error: message };
      }
      logger.warn(error, `Failed to convert a secret import, will retry [secretImportId=${data.secretImportId}]`);
      return { id: event.id, status: EventResultStatus.Retry, error: message };
    }
  };

  // Conversions into one folder run one at a time, since each one shifts that folder's import positions.
  return {
    name: SECRET_IMPORT_REPLICATION_CONVERSION_CONSUMER,
    subscribesTo: (type: string) => type === SecretImportReplicationConversionRequestedEventV1.type,
    dataSchema: SecretImportReplicationConversionRequestedEventV1.data,
    handle: (events) =>
      runEventsConcurrentlyByKey(events, {
        keyOf: (event) => {
          const parsed = SecretImportReplicationConversionRequestedEventV1.data.safeParse(event.data);
          return parsed.success ? `${parsed.data.environment}:${parsed.data.secretPath}` : undefined;
        },
        concurrency: CONVERSION_CONCURRENCY,
        handleEvent: $handleEvent
      })
  };
};
