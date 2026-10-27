import { BadRequestError } from "@app/lib/errors";

import { AlertTriggerType, IResourceAlertProvider, TAlertEventDefinition, TAlertEventRef } from "./alert-types";

export const resolveAlertProjectId = async (
  provider: IResourceAlertProvider,
  { orgId, projectId, resourceId }: { orgId: string; projectId?: string | null; resourceId?: string | null }
): Promise<string | null> => {
  if (projectId || !provider.resolveProjectId) return projectId ?? null;
  return provider.resolveProjectId({ orgId, resourceId });
};

export const getAlertResourceName = async (
  provider: Pick<IResourceAlertProvider, "getResourceNames">,
  orgId: string,
  resourceId?: string | null
): Promise<string | null> => {
  if (!resourceId || !provider.getResourceNames) return null;
  return (await provider.getResourceNames({ orgId, resourceIds: [resourceId] })).get(resourceId) ?? null;
};

export const getAlertEvent = (provider: IResourceAlertProvider, eventType: string): TAlertEventDefinition => {
  const event = provider.events.find((candidate) => candidate.key === eventType);
  if (!event) {
    throw new BadRequestError({
      message: `Event type '${eventType}' is not supported by resource type '${provider.resourceType}'`
    });
  }
  return event;
};

export type TAlertProviderRegistry = ReturnType<typeof alertProviderRegistryFactory>;

export const alertProviderRegistryFactory = () => {
  const providers = new Map<string, IResourceAlertProvider>();
  let eventTriggeredKeyCache: Set<string> | undefined;

  const register = (provider: IResourceAlertProvider) => {
    if (providers.has(provider.resourceType)) {
      throw new Error(`Alert provider already registered for resource type '${provider.resourceType}'`);
    }

    for (const event of provider.events) {
      if (event.triggerType === AlertTriggerType.Scheduled && !provider.findScheduledTargets) {
        throw new Error(
          `Alert provider '${provider.resourceType}' declares scheduled event '${event.key}' but does not implement findScheduledTargets`
        );
      }
      if (event.triggerType === AlertTriggerType.Event && !provider.findEventTargets) {
        throw new Error(
          `Alert provider '${provider.resourceType}' declares event-triggered event '${event.key}' but does not implement findEventTargets`
        );
      }
    }

    providers.set(provider.resourceType, provider);
    eventTriggeredKeyCache = undefined;
  };

  const get = (resourceType: string): IResourceAlertProvider | undefined => providers.get(resourceType);

  const resourceTypes = (): string[] => [...providers.keys()];

  const eventTriggeredKeys = (): Set<string> => {
    eventTriggeredKeyCache ??= new Set(
      [...providers.values()].flatMap((provider) =>
        provider.events.filter((event) => event.triggerType === AlertTriggerType.Event).map((event) => event.key)
      )
    );
    return eventTriggeredKeyCache;
  };

  const findEventsBySource = (source: TAlertEventRef): TAlertEventRef[] =>
    [...providers.values()].flatMap((provider) =>
      provider.events
        .filter(
          (event) =>
            event.triggerType === AlertTriggerType.Event &&
            event.sourceEvent?.resourceType === source.resourceType &&
            event.sourceEvent.eventKey === source.eventKey
        )
        .map((event) => ({ resourceType: provider.resourceType, eventKey: event.key }))
    );

  return { register, get, resourceTypes, eventTriggeredKeys, findEventsBySource };
};
