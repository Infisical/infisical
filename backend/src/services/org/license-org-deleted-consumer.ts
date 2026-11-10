import { TEnvConfig } from "@app/lib/config/env";
import { logger } from "@app/lib/logger";
import { EventModificationType } from "@app/services/event-outbox/event-definition";
import { parseEventPayload, runEventsConcurrentlyByKey } from "@app/services/event-outbox/event-outbox-fns";
import {
  EventResultStatus,
  IEventConsumer,
  TEvent,
  TEventConsumerResult
} from "@app/services/event-outbox/event-outbox-types";
import { TLicenseClientFactory } from "@app/services/license-client/license-client";

import { OrganizationModifiedEventV1, TOrganizationModifiedEventData } from "./org-events";

export const LICENSE_ORG_DELETED_CONSUMER = "license-org-deleted";
const LICENSE_ORG_DELETED_CONCURRENCY = 10;

type TLicenseOrgDeletedConsumerDep = {
  envConfig: Pick<TEnvConfig, "isCloud">;
  licenseClient: Pick<TLicenseClientFactory, "deleteOrganization" | "invalidateEntitlements">;
};

// Cloud only. Sub-orgs bill through their root, so we skip them.
export const licenseOrgDeletedConsumerFactory = ({
  envConfig,
  licenseClient
}: TLicenseOrgDeletedConsumerDep): IEventConsumer<TOrganizationModifiedEventData> => {
  const subscribesTo = (eventType: string) => envConfig.isCloud && eventType === OrganizationModifiedEventV1.type;

  const $handleEvent = async (event: TEvent): Promise<TEventConsumerResult> => {
    const parsed = parseEventPayload(event, OrganizationModifiedEventV1.data, "organization");
    if (parsed.failure) return parsed.failure;

    const { organizationId, rootOrgId, modificationType } = parsed.data;
    if (modificationType !== EventModificationType.Deleted || rootOrgId) {
      return { id: event.id, status: EventResultStatus.Delivered };
    }

    try {
      const result = await licenseClient.deleteOrganization(organizationId);
      await licenseClient.invalidateEntitlements(organizationId);
      logger.info(
        `license-org-deleted: closed the organization's licenses [orgId=${organizationId}] [licensesClosed=${result.licensesClosed}] [canceledSubscriptions=${result.canceledSubscriptionIds.join(",")}]`
      );
      return { id: event.id, status: EventResultStatus.Delivered };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      if (event.isFinalAttempt) {
        logger.error(
          error,
          `license-org-deleted: giving up; the organization's subscription may still be billing and needs a manual cancel [orgId=${organizationId}] [eventId=${event.id}]`
        );
      } else {
        logger.warn(`license-org-deleted: will retry [orgId=${organizationId}] [eventId=${event.id}]: ${message}`);
      }
      return { id: event.id, status: EventResultStatus.Retry, error: message };
    }
  };

  return {
    name: LICENSE_ORG_DELETED_CONSUMER,
    dataSchema: OrganizationModifiedEventV1.data,
    subscribesTo,
    handle: (events) =>
      runEventsConcurrentlyByKey(events, {
        keyOf: (event) => OrganizationModifiedEventV1.data.safeParse(event.data).data?.organizationId,
        concurrency: LICENSE_ORG_DELETED_CONCURRENCY,
        handleEvent: $handleEvent
      })
  };
};
