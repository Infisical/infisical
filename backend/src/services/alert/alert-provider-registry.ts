import { IResourceAlertProvider } from "./alert-types";

export type TAlertProviderRegistry = ReturnType<typeof alertProviderRegistryFactory>;

export const alertProviderRegistryFactory = () => {
  const providers = new Map<string, IResourceAlertProvider>();

  const register = (provider: IResourceAlertProvider) => {
    if (providers.has(provider.resourceType)) {
      throw new Error(`Alert provider already registered for resource type '${provider.resourceType}'`);
    }
    providers.set(provider.resourceType, provider);
  };

  const get = (resourceType: string): IResourceAlertProvider | undefined => providers.get(resourceType);

  const resourceTypes = (): string[] => [...providers.keys()];

  return { register, get, resourceTypes };
};
