import {
  dataProtocolDynamicSecretProviders,
  identityAccessDynamicSecretProviders,
  managedStoresDynamicSecretProviders,
  relationalWarehouseDynamicSecretProviders
} from "./providerDefinitions";
import { createDynamicSecretProviderRegistry } from "./registry";

export const dynamicSecretProviderRegistry = createDynamicSecretProviderRegistry(
  relationalWarehouseDynamicSecretProviders,
  dataProtocolDynamicSecretProviders,
  managedStoresDynamicSecretProviders,
  identityAccessDynamicSecretProviders
);
