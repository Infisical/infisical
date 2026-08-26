import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

import type { TRegisteredDynamicSecretProviderDefinition } from "../registry";
import { defineDynamicSecretProviderModule } from "../registry";
import {
  awsElastiCacheDynamicSecretProvider,
  awsMemoryDbDynamicSecretProvider
} from "./awsManagedStores";
import { couchbaseDynamicSecretProvider } from "./couchbase";
import { MANAGED_STORE_DYNAMIC_SECRET_PROVIDERS } from "./managedStoresContract";
import { mongoAtlasDynamicSecretProvider } from "./mongoAtlas";
import { mongoDbDynamicSecretProvider } from "./mongoDb";
import { redisDynamicSecretProvider } from "./redis";

const definitionsByProvider = {
  [DynamicSecretProviders.Redis]: redisDynamicSecretProvider,
  [DynamicSecretProviders.AwsElastiCache]: awsElastiCacheDynamicSecretProvider,
  [DynamicSecretProviders.AwsMemoryDb]: awsMemoryDbDynamicSecretProvider,
  [DynamicSecretProviders.MongoAtlas]: mongoAtlasDynamicSecretProvider,
  [DynamicSecretProviders.MongoDB]: mongoDbDynamicSecretProvider,
  [DynamicSecretProviders.Couchbase]: couchbaseDynamicSecretProvider
} satisfies Record<
  (typeof MANAGED_STORE_DYNAMIC_SECRET_PROVIDERS)[number],
  TRegisteredDynamicSecretProviderDefinition
>;

export const managedStoresDynamicSecretProviders = defineDynamicSecretProviderModule({
  id: "managed-stores",
  definitions: MANAGED_STORE_DYNAMIC_SECRET_PROVIDERS.map(
    (provider) => definitionsByProvider[provider]
  )
});
