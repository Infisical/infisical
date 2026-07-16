import { IResourceAlarmProvider } from "./alarm-types";

export type TAlarmProviderRegistry = ReturnType<typeof alarmProviderRegistryFactory>;

export const alarmProviderRegistryFactory = () => {
  const providers = new Map<string, IResourceAlarmProvider>();

  const register = (provider: IResourceAlarmProvider) => {
    if (providers.has(provider.resourceType)) {
      throw new Error(`Alarm provider already registered for resource type '${provider.resourceType}'`);
    }
    providers.set(provider.resourceType, provider);
  };

  const get = (resourceType: string): IResourceAlarmProvider | undefined => providers.get(resourceType);

  const resourceTypes = (): string[] => [...providers.keys()];

  const list = (): IResourceAlarmProvider[] => [...providers.values()];

  return { register, get, resourceTypes, list };
};
