import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

import type { TRegisteredDynamicSecretProviderDefinition } from "../registry";
import { defineDynamicSecretProviderModule } from "../registry";
import { cassandraDynamicSecretProvider } from "./cassandra";
import { DATA_PROTOCOL_DYNAMIC_SECRET_PROVIDERS } from "./dataProtocolContract";
import { elasticSearchDynamicSecretProvider } from "./elasticSearch";
import { ibmApiConnectDynamicSecretProvider } from "./ibmApiConnect";
import { kubernetesDynamicSecretProvider } from "./kubernetes";
import { milvusDynamicSecretProvider } from "./milvus";
import { rabbitMqDynamicSecretProvider } from "./rabbitMq";
import { totpDynamicSecretProvider } from "./totp";

const definitionsByProvider = {
  [DynamicSecretProviders.Cassandra]: cassandraDynamicSecretProvider,
  [DynamicSecretProviders.ElasticSearch]: elasticSearchDynamicSecretProvider,
  [DynamicSecretProviders.Kubernetes]: kubernetesDynamicSecretProvider,
  [DynamicSecretProviders.Milvus]: milvusDynamicSecretProvider,
  [DynamicSecretProviders.RabbitMq]: rabbitMqDynamicSecretProvider,
  [DynamicSecretProviders.IbmApiConnect]: ibmApiConnectDynamicSecretProvider,
  [DynamicSecretProviders.Totp]: totpDynamicSecretProvider
} satisfies Record<
  (typeof DATA_PROTOCOL_DYNAMIC_SECRET_PROVIDERS)[number],
  TRegisteredDynamicSecretProviderDefinition
>;

export const dataProtocolDynamicSecretProviders = defineDynamicSecretProviderModule({
  id: "data-protocol",
  definitions: DATA_PROTOCOL_DYNAMIC_SECRET_PROVIDERS.map(
    (provider) => definitionsByProvider[provider]
  )
});
