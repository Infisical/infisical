import { AlertTriggerType, IResourceAlertProvider } from "./alert-types";

export type TAlertProviderRegistry = ReturnType<typeof alertProviderRegistryFactory>;

export const alertProviderRegistryFactory = () => {
  const providers = new Map<string, IResourceAlertProvider>();
  let eventTriggeredKeyCache: Set<string> | undefined;

  const register = (provider: IResourceAlertProvider) => {
    if (providers.has(provider.resourceType)) {
      throw new Error(`Alert provider already registered for resource type '${provider.resourceType}'`);
    }

    for (const event of provider.events) {
      if (event.triggerType === AlertTriggerType.Scheduled && !provider.findDueTargets) {
        throw new Error(
          `Alert provider '${provider.resourceType}' declares scheduled event '${event.key}' but does not implement findDueTargets`
        );
      }
      if (event.triggerType === AlertTriggerType.Event && !provider.findTargetsByIds) {
        throw new Error(
          `Alert provider '${provider.resourceType}' declares event-triggered event '${event.key}' but does not implement findTargetsByIds`
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

  return { register, get, resourceTypes, eventTriggeredKeys };
};
