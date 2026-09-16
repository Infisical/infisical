import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DynamicSecretProviders,
  KubernetesDynamicSecretCredentialType
} from "@app/hooks/api/dynamicSecret/types";

import {
  CASSANDRA_CUSTOM_RENDERER_REASONS,
  cassandraCreateFormSchema,
  cassandraEditFormSchema,
  getCassandraCreateDefaultValues,
  getCassandraCreatePayload,
  getCassandraEditDefaultValues,
  getCassandraEditPayload,
  getCassandraVaultImportValues
} from "./providerDefinitions/cassandraContract";
import { DATA_PROTOCOL_DYNAMIC_SECRET_PROVIDERS } from "./providerDefinitions/dataProtocolContract";
import {
  ELASTIC_SEARCH_CUSTOM_RENDERER_REASONS,
  elasticSearchCreateFormSchema,
  elasticSearchEditFormSchema,
  getElasticSearchCreateDefaultValues,
  getElasticSearchCreatePayload,
  getElasticSearchEditDefaultValues,
  getElasticSearchEditPayload
} from "./providerDefinitions/elasticSearchContract";
import {
  getIbmApiConnectCreateDefaultValues,
  getIbmApiConnectCreatePayload,
  getIbmApiConnectEditDefaultValues,
  getIbmApiConnectEditPayload,
  IBM_API_CONNECT_CUSTOM_RENDERER_REASONS,
  ibmApiConnectCreateFormSchema,
  ibmApiConnectEditFormSchema,
  normalizeIbmApiConnectGatewayValueForMode
} from "./providerDefinitions/ibmApiConnectContract";
import {
  getKubernetesCreateDefaultValues,
  getKubernetesCreatePayload,
  getKubernetesEditDefaultValues,
  getKubernetesEditPayload,
  getKubernetesVaultImportValues,
  KUBERNETES_CUSTOM_RENDERER_REASONS,
  KubernetesAuthMethod,
  kubernetesCreateFormSchema,
  kubernetesEditFormSchema,
  KubernetesRoleType,
  normalizeKubernetesGatewayValueForMode
} from "./providerDefinitions/kubernetesContract";
import {
  getMilvusCreateDefaultValues,
  getMilvusCreatePayload,
  getMilvusEditDefaultValues,
  getMilvusEditPayload,
  MILVUS_CUSTOM_RENDERER_REASONS,
  milvusCreateFormSchema,
  milvusEditFormSchema
} from "./providerDefinitions/milvusContract";
import {
  getRabbitMqCreateDefaultValues,
  getRabbitMqCreatePayload,
  getRabbitMqEditDefaultValues,
  getRabbitMqEditPayload,
  RABBIT_MQ_CUSTOM_RENDERER_REASONS,
  rabbitMqCreateFormSchema,
  rabbitMqEditFormSchema
} from "./providerDefinitions/rabbitMqContract";
import {
  getTotpCreateDefaultValues,
  getTotpCreatePayload,
  getTotpEditDefaultValues,
  getTotpEditPayload,
  TOTP_CUSTOM_RENDERER_REASONS,
  TotpAlgorithm,
  TotpConfigType,
  totpCreateFormSchema,
  totpEditFormSchema
} from "./providerDefinitions/totpContract";
import { testDynamicSecretProviderContract } from "./providerContractTestHarness";
import { createDynamicSecretProviderRegistry, defineDynamicSecretProviderModule } from "./registry";
import { DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE } from "./schemas";
import type {
  TCreateDynamicSecretProviderFormContext,
  TEditDynamicSecretProviderFormContext
} from "./types";
import { defineDynamicSecretProvider } from "./types";

const environment = { id: "env-id", name: "Development", slug: "dev", position: 1 };
const createContext: TCreateDynamicSecretProviderFormContext = {
  projectSlug: "project",
  secretPath: "/folder",
  environments: [environment],
  isSingleEnvironmentMode: true
};

const getEditContext = ({
  provider,
  inputs,
  defaultTTL = "1h",
  maxTTL = "24h",
  usernameTemplate,
  metadata
}: {
  provider: DynamicSecretProviders;
  inputs: unknown;
  defaultTTL?: string;
  maxTTL?: string;
  usernameTemplate?: string | null;
  metadata?: { key: string; value: string }[];
}): TEditDynamicSecretProviderFormContext => ({
  projectSlug: "project",
  secretPath: "/folder",
  environment: "dev",
  dynamicSecret: {
    id: "dynamic-secret-id",
    name: "existing-secret",
    type: provider,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    defaultTTL,
    maxTTL,
    ...(usernameTemplate === undefined ? {} : { usernameTemplate }),
    ...(metadata === undefined ? {} : { metadata }),
    inputs
  }
});

const NoopRenderer = () => null;

const cassandraDynamicSecretProvider = defineDynamicSecretProvider({
  provider: DynamicSecretProviders.Cassandra,
  label: "Cassandra",
  customRenderer: {
    reasons: CASSANDRA_CUSTOM_RENDERER_REASONS,
    Component: NoopRenderer
  },
  create: {
    schema: cassandraCreateFormSchema,
    getDefaultValues: getCassandraCreateDefaultValues,
    toPayload: getCassandraCreatePayload,
    submitLabel: "Submit"
  },
  edit: {
    schema: cassandraEditFormSchema,
    getDefaultValues: getCassandraEditDefaultValues,
    toPayload: getCassandraEditPayload,
    submitLabel: "Save",
    successMessage: "Successfully updated dynamic secret"
  }
});

const elasticSearchDynamicSecretProvider = defineDynamicSecretProvider({
  provider: DynamicSecretProviders.ElasticSearch,
  label: "Elasticsearch",
  customRenderer: {
    reasons: ELASTIC_SEARCH_CUSTOM_RENDERER_REASONS,
    Component: NoopRenderer
  },
  create: {
    schema: elasticSearchCreateFormSchema,
    getDefaultValues: getElasticSearchCreateDefaultValues,
    toPayload: getElasticSearchCreatePayload,
    submitLabel: "Submit"
  },
  edit: {
    schema: elasticSearchEditFormSchema,
    getDefaultValues: getElasticSearchEditDefaultValues,
    toPayload: getElasticSearchEditPayload,
    submitLabel: "Save",
    successMessage: "Successfully updated dynamic secret"
  }
});

const kubernetesDynamicSecretProvider = defineDynamicSecretProvider({
  provider: DynamicSecretProviders.Kubernetes,
  label: "Kubernetes",
  customRenderer: {
    reasons: KUBERNETES_CUSTOM_RENDERER_REASONS,
    Component: NoopRenderer
  },
  create: {
    schema: kubernetesCreateFormSchema,
    getDefaultValues: getKubernetesCreateDefaultValues,
    toPayload: getKubernetesCreatePayload,
    submitLabel: "Submit"
  },
  edit: {
    schema: kubernetesEditFormSchema,
    getDefaultValues: getKubernetesEditDefaultValues,
    toPayload: getKubernetesEditPayload,
    submitLabel: "Submit",
    successMessage: "Successfully updated dynamic secret"
  }
});

const milvusDynamicSecretProvider = defineDynamicSecretProvider({
  provider: DynamicSecretProviders.Milvus,
  label: "Milvus",
  customRenderer: {
    reasons: MILVUS_CUSTOM_RENDERER_REASONS,
    Component: NoopRenderer
  },
  create: {
    schema: milvusCreateFormSchema,
    getDefaultValues: getMilvusCreateDefaultValues,
    toPayload: getMilvusCreatePayload,
    submitLabel: "Submit"
  },
  edit: {
    schema: milvusEditFormSchema,
    getDefaultValues: getMilvusEditDefaultValues,
    toPayload: getMilvusEditPayload,
    submitLabel: "Save",
    successMessage: "Successfully updated dynamic secret"
  }
});

const rabbitMqDynamicSecretProvider = defineDynamicSecretProvider({
  provider: DynamicSecretProviders.RabbitMq,
  label: "RabbitMQ",
  customRenderer: {
    reasons: RABBIT_MQ_CUSTOM_RENDERER_REASONS,
    Component: NoopRenderer
  },
  create: {
    schema: rabbitMqCreateFormSchema,
    getDefaultValues: getRabbitMqCreateDefaultValues,
    toPayload: getRabbitMqCreatePayload,
    submitLabel: "Submit"
  },
  edit: {
    schema: rabbitMqEditFormSchema,
    getDefaultValues: getRabbitMqEditDefaultValues,
    toPayload: getRabbitMqEditPayload,
    submitLabel: "Save",
    successMessage: "Successfully updated dynamic secret"
  }
});

const ibmApiConnectDynamicSecretProvider = defineDynamicSecretProvider({
  provider: DynamicSecretProviders.IbmApiConnect,
  label: "IBM API Connect",
  customRenderer: {
    reasons: IBM_API_CONNECT_CUSTOM_RENDERER_REASONS,
    Component: NoopRenderer
  },
  create: {
    schema: ibmApiConnectCreateFormSchema,
    getDefaultValues: getIbmApiConnectCreateDefaultValues,
    toPayload: getIbmApiConnectCreatePayload,
    submitLabel: "Submit"
  },
  edit: {
    schema: ibmApiConnectEditFormSchema,
    getDefaultValues: getIbmApiConnectEditDefaultValues,
    toPayload: getIbmApiConnectEditPayload,
    submitLabel: "Save",
    successMessage: "Successfully updated dynamic secret"
  }
});

const totpDynamicSecretProvider = defineDynamicSecretProvider({
  provider: DynamicSecretProviders.Totp,
  label: "TOTP",
  customRenderer: {
    reasons: TOTP_CUSTOM_RENDERER_REASONS,
    Component: NoopRenderer
  },
  create: {
    schema: totpCreateFormSchema,
    getDefaultValues: getTotpCreateDefaultValues,
    toPayload: getTotpCreatePayload,
    submitLabel: "Submit"
  },
  edit: {
    schema: totpEditFormSchema,
    getDefaultValues: getTotpEditDefaultValues,
    toPayload: getTotpEditPayload,
    submitLabel: "Save",
    successMessage: "Successfully updated dynamic secret"
  }
});

const definitionsByProvider = {
  [DynamicSecretProviders.Cassandra]: cassandraDynamicSecretProvider,
  [DynamicSecretProviders.ElasticSearch]: elasticSearchDynamicSecretProvider,
  [DynamicSecretProviders.Kubernetes]: kubernetesDynamicSecretProvider,
  [DynamicSecretProviders.Milvus]: milvusDynamicSecretProvider,
  [DynamicSecretProviders.RabbitMq]: rabbitMqDynamicSecretProvider,
  [DynamicSecretProviders.IbmApiConnect]: ibmApiConnectDynamicSecretProvider,
  [DynamicSecretProviders.Totp]: totpDynamicSecretProvider
};

const dataProtocolContractModule = defineDynamicSecretProviderModule({
  id: "data-protocol",
  definitions: DATA_PROTOCOL_DYNAMIC_SECRET_PROVIDERS.map(
    (provider) => definitionsByProvider[provider]
  )
});

const cassandraCreateDefaults = getCassandraCreateDefaultValues(createContext);
const cassandraCreateValues = {
  ...cassandraCreateDefaults,
  name: "cassandra-secret",
  inputs: {
    ...cassandraCreateDefaults.inputs,
    host: "CASSANDRA.EXAMPLE.COM",
    username: "admin",
    password: "password"
  }
};
const cassandraEditInputs = {
  ...cassandraCreateDefaults.inputs,
  host: "cassandra.example.com",
  username: "admin",
  password: "********"
};
const cassandraEditContext = getEditContext({
  provider: DynamicSecretProviders.Cassandra,
  inputs: cassandraEditInputs,
  usernameTemplate: null
});
const cassandraEditValues = {
  name: "renamed-cassandra-secret",
  defaultTTL: "1h",
  maxTTL: "24h",
  usernameTemplate: DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE,
  inputs: cassandraEditInputs
};

testDynamicSecretProviderContract({
  name: "Cassandra",
  definition: cassandraDynamicSecretProvider,
  create: {
    context: createContext,
    defaultValues: cassandraCreateDefaults,
    validValues: cassandraCreateValues,
    payload: {
      provider: {
        type: DynamicSecretProviders.Cassandra,
        inputs: { ...cassandraCreateValues.inputs, host: "cassandra.example.com" }
      },
      maxTTL: "24h",
      name: "cassandra-secret",
      path: "/folder",
      defaultTTL: "1h",
      projectSlug: "project",
      environmentSlug: "dev",
      usernameTemplate: undefined
    },
    invalidValues: [
      {
        name: "local data center is missing",
        values: {
          ...cassandraCreateValues,
          inputs: { ...cassandraCreateValues.inputs, localDataCenter: "" }
        },
        issuePaths: [["inputs", "localDataCenter"]]
      }
    ]
  },
  edit: {
    context: cassandraEditContext,
    defaultValues: {
      name: "existing-secret",
      defaultTTL: "1h",
      maxTTL: "24h",
      usernameTemplate: DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE,
      inputs: cassandraEditInputs
    },
    validValues: cassandraEditValues,
    payload: {
      name: "existing-secret",
      path: "/folder",
      projectSlug: "project",
      environmentSlug: "dev",
      data: {
        maxTTL: "24h",
        defaultTTL: "1h",
        inputs: cassandraEditInputs,
        newName: "renamed-cassandra-secret",
        usernameTemplate: null
      }
    },
    maskedValues: [
      {
        name: "password",
        expected: "********",
        defaultValuePath: ["inputs", "password"],
        payloadValuePath: ["data", "inputs", "password"]
      }
    ]
  }
});

const elasticSearchCreateDefaults = getElasticSearchCreateDefaultValues(createContext);
const elasticSearchCreateValues = {
  ...elasticSearchCreateDefaults,
  name: "elasticsearch-secret",
  inputs: {
    ...elasticSearchCreateDefaults.inputs,
    host: "elastic.example.com",
    auth: { type: "api-key" as const, apiKeyId: "key-id", apiKey: "secret" }
  }
};
const elasticSearchEditInputs = {
  host: "elastic.example.com",
  port: 443,
  auth: { type: "user" as const, username: "admin", password: "********" },
  roles: ["superuser"],
  ca: "",
  sslRejectUnauthorized: true
};
const elasticSearchEditContext = getEditContext({
  provider: DynamicSecretProviders.ElasticSearch,
  inputs: elasticSearchEditInputs,
  usernameTemplate: null
});
const elasticSearchEditValues = {
  name: "renamed-elasticsearch-secret",
  defaultTTL: "1h",
  maxTTL: "24h",
  usernameTemplate: DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE,
  inputs: elasticSearchEditInputs
};

testDynamicSecretProviderContract({
  name: "Elasticsearch",
  definition: elasticSearchDynamicSecretProvider,
  create: {
    context: createContext,
    defaultValues: elasticSearchCreateDefaults,
    validValues: elasticSearchCreateValues,
    payload: {
      provider: {
        type: DynamicSecretProviders.ElasticSearch,
        inputs: elasticSearchCreateValues.inputs
      },
      maxTTL: "24h",
      name: "elasticsearch-secret",
      path: "/folder",
      defaultTTL: "1h",
      projectSlug: "project",
      environmentSlug: "dev",
      usernameTemplate: undefined
    },
    invalidValues: [
      {
        name: "at least one role is required",
        values: {
          ...elasticSearchCreateValues,
          inputs: { ...elasticSearchCreateValues.inputs, roles: [] }
        },
        issuePaths: [["inputs", "roles"]]
      }
    ]
  },
  edit: {
    context: elasticSearchEditContext,
    defaultValues: {
      name: "existing-secret",
      defaultTTL: "1h",
      maxTTL: "24h",
      usernameTemplate: DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE,
      inputs: elasticSearchEditInputs
    },
    validValues: elasticSearchEditValues,
    payload: {
      name: "existing-secret",
      path: "/folder",
      projectSlug: "project",
      environmentSlug: "dev",
      data: {
        maxTTL: "24h",
        defaultTTL: "1h",
        inputs: elasticSearchEditInputs,
        newName: "renamed-elasticsearch-secret",
        usernameTemplate: null
      }
    },
    maskedValues: [
      {
        name: "password",
        expected: "********",
        defaultValuePath: ["inputs", "auth", "password"],
        payloadValuePath: ["data", "inputs", "auth", "password"]
      }
    ]
  }
});

const kubernetesCreateDefaults = getKubernetesCreateDefaultValues(createContext);
const kubernetesCreateValues = {
  ...kubernetesCreateDefaults,
  name: "kubernetes-secret",
  inputs: {
    ...kubernetesCreateDefaults.inputs,
    url: "https://kubernetes.example.com",
    clusterToken: "cluster-token",
    serviceAccountName: "lease-account",
    namespace: "platform",
    audiences: ["infisical"]
  }
};
const kubernetesEditInputs = {
  url: "https://kubernetes.example.com",
  clusterToken: "********",
  ca: "certificate",
  sslEnabled: true,
  sslRejectUnauthorized: true,
  credentialType: KubernetesDynamicSecretCredentialType.Dynamic as const,
  namespace: "platform, security",
  gatewayId: "gateway-id",
  gatewayPoolId: null,
  audiences: ["infisical"],
  roleType: KubernetesRoleType.ClusterRole,
  role: "lease-role",
  authMethod: KubernetesAuthMethod.Gateway
};
const kubernetesEditContext = getEditContext({
  provider: DynamicSecretProviders.Kubernetes,
  inputs: kubernetesEditInputs,
  usernameTemplate: null
});
const kubernetesEditValues = {
  name: "renamed-kubernetes-secret",
  defaultTTL: "1h",
  maxTTL: "24h",
  usernameTemplate: DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE,
  inputs: kubernetesEditInputs
};

testDynamicSecretProviderContract({
  name: "Kubernetes",
  definition: kubernetesDynamicSecretProvider,
  create: {
    context: createContext,
    defaultValues: kubernetesCreateDefaults,
    validValues: kubernetesCreateValues,
    payload: {
      provider: {
        type: DynamicSecretProviders.Kubernetes,
        inputs: {
          url: "https://kubernetes.example.com",
          clusterToken: "cluster-token",
          ca: "",
          sslEnabled: false,
          sslRejectUnauthorized: true,
          credentialType: KubernetesDynamicSecretCredentialType.Static,
          serviceAccountName: "lease-account",
          namespace: "platform",
          gatewayId: undefined,
          gatewayPoolId: undefined,
          audiences: ["infisical"],
          authMethod: KubernetesAuthMethod.Api
        }
      },
      maxTTL: "24h",
      name: "kubernetes-secret",
      path: "/folder",
      defaultTTL: "1h",
      projectSlug: "project",
      environmentSlug: "dev",
      usernameTemplate: undefined
    },
    invalidValues: [
      {
        name: "gateway authentication requires a gateway",
        values: {
          ...kubernetesCreateValues,
          inputs: {
            ...kubernetesCreateValues.inputs,
            authMethod: KubernetesAuthMethod.Gateway,
            gatewayId: undefined,
            gatewayPoolId: undefined
          }
        },
        issuePaths: [["inputs", "gatewayId"]]
      },
      {
        name: "static credentials require one namespace",
        values: {
          ...kubernetesCreateValues,
          inputs: { ...kubernetesCreateValues.inputs, namespace: "platform, security" }
        },
        issuePaths: [["inputs", "namespace"]]
      }
    ]
  },
  edit: {
    context: kubernetesEditContext,
    defaultValues: {
      name: "existing-secret",
      defaultTTL: "1h",
      maxTTL: "24h",
      usernameTemplate: DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE,
      inputs: kubernetesEditInputs
    },
    validValues: kubernetesEditValues,
    payload: {
      name: "existing-secret",
      path: "/folder",
      projectSlug: "project",
      environmentSlug: "dev",
      data: {
        inputs: kubernetesEditInputs,
        newName: "renamed-kubernetes-secret",
        defaultTTL: "1h",
        maxTTL: "24h",
        usernameTemplate: null
      }
    },
    maskedValues: [
      {
        name: "cluster token",
        expected: "********",
        defaultValuePath: ["inputs", "clusterToken"],
        payloadValuePath: ["data", "inputs", "clusterToken"]
      }
    ]
  }
});

const milvusCreateDefaults = getMilvusCreateDefaultValues(createContext);
const milvusCreateValues = {
  ...milvusCreateDefaults,
  name: "milvus-secret",
  inputs: {
    ...milvusCreateDefaults.inputs,
    password: "secret",
    privileges: [
      {
        objectType: "Collection",
        objectName: "documents",
        privilege: "Search",
        dbName: "default"
      }
    ]
  }
};
const milvusEditInputs = {
  ...milvusCreateValues.inputs,
  password: "********",
  gatewayId: undefined,
  gatewayPoolId: undefined
};
const milvusMetadata = [{ key: "owner", value: "platform" }];
const milvusEditContext = getEditContext({
  provider: DynamicSecretProviders.Milvus,
  inputs: milvusEditInputs,
  usernameTemplate: null,
  metadata: milvusMetadata
});
const milvusEditValues = {
  name: "renamed-milvus-secret",
  defaultTTL: "1h",
  maxTTL: "24h",
  usernameTemplate: null,
  metadata: milvusMetadata,
  inputs: milvusEditInputs
};

testDynamicSecretProviderContract({
  name: "Milvus",
  definition: milvusDynamicSecretProvider,
  create: {
    context: createContext,
    defaultValues: milvusCreateDefaults,
    validValues: milvusCreateValues,
    payload: {
      provider: { type: DynamicSecretProviders.Milvus, inputs: milvusCreateValues.inputs },
      maxTTL: "24h",
      name: "milvus-secret",
      path: "/folder",
      defaultTTL: "1h",
      projectSlug: "project",
      environmentSlug: "dev",
      usernameTemplate: undefined
    },
    invalidValues: [
      {
        name: "privilege name is missing",
        values: {
          ...milvusCreateValues,
          inputs: {
            ...milvusCreateValues.inputs,
            privileges: [{ objectType: "Collection", objectName: "*", privilege: "" }]
          }
        },
        issuePaths: [["inputs", "privileges", 0, "privilege"]]
      }
    ]
  },
  edit: {
    context: milvusEditContext,
    defaultValues: {
      name: "existing-secret",
      defaultTTL: "1h",
      maxTTL: "24h",
      usernameTemplate: null,
      metadata: milvusMetadata,
      inputs: milvusEditInputs
    },
    validValues: milvusEditValues,
    payload: {
      name: "existing-secret",
      path: "/folder",
      projectSlug: "project",
      environmentSlug: "dev",
      data: {
        defaultTTL: "1h",
        maxTTL: "24h",
        newName: "renamed-milvus-secret",
        metadata: milvusMetadata,
        usernameTemplate: undefined,
        inputs: { ...milvusEditInputs, gatewayId: null, gatewayPoolId: null }
      }
    },
    maskedValues: [
      {
        name: "password",
        expected: "********",
        defaultValuePath: ["inputs", "password"],
        payloadValuePath: ["data", "inputs", "password"]
      }
    ]
  }
});

const rabbitMqCreateDefaults = getRabbitMqCreateDefaultValues(createContext);
const rabbitMqCreateValues = {
  ...rabbitMqCreateDefaults,
  name: "rabbitmq-secret",
  inputs: {
    ...rabbitMqCreateDefaults.inputs,
    host: "https://rabbitmq.example.com",
    username: "admin",
    password: "secret",
    tags: [" management "]
  }
};
const rabbitMqEditInputs = {
  ...rabbitMqCreateDefaults.inputs,
  host: "https://rabbitmq.example.com",
  username: "admin",
  password: "********",
  tags: ["management"]
};
const rabbitMqEditContext = getEditContext({
  provider: DynamicSecretProviders.RabbitMq,
  inputs: rabbitMqEditInputs,
  usernameTemplate: null
});
const rabbitMqEditValues = {
  name: "renamed-rabbitmq-secret",
  defaultTTL: "1h",
  maxTTL: "24h",
  usernameTemplate: DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE,
  inputs: rabbitMqEditInputs
};

testDynamicSecretProviderContract({
  name: "RabbitMQ",
  definition: rabbitMqDynamicSecretProvider,
  create: {
    context: createContext,
    defaultValues: rabbitMqCreateDefaults,
    validValues: rabbitMqCreateValues,
    payload: {
      provider: {
        type: DynamicSecretProviders.RabbitMq,
        inputs: { ...rabbitMqCreateValues.inputs, tags: ["management"] }
      },
      maxTTL: "24h",
      name: "rabbitmq-secret",
      path: "/folder",
      defaultTTL: "1h",
      projectSlug: "project",
      environmentSlug: "dev",
      usernameTemplate: undefined
    },
    invalidValues: [
      {
        name: "virtual host is missing",
        values: {
          ...rabbitMqCreateValues,
          inputs: {
            ...rabbitMqCreateValues.inputs,
            virtualHost: { ...rabbitMqCreateValues.inputs.virtualHost, name: "" }
          }
        },
        issuePaths: [["inputs", "virtualHost", "name"]]
      }
    ]
  },
  edit: {
    context: rabbitMqEditContext,
    defaultValues: {
      name: "existing-secret",
      defaultTTL: "1h",
      maxTTL: "24h",
      usernameTemplate: DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE,
      inputs: rabbitMqEditInputs
    },
    validValues: rabbitMqEditValues,
    payload: {
      name: "existing-secret",
      path: "/folder",
      projectSlug: "project",
      environmentSlug: "dev",
      data: {
        maxTTL: "24h",
        defaultTTL: "1h",
        inputs: rabbitMqEditInputs,
        newName: "renamed-rabbitmq-secret",
        usernameTemplate: null
      }
    },
    maskedValues: [
      {
        name: "password",
        expected: "********",
        defaultValuePath: ["inputs", "password"],
        payloadValuePath: ["data", "inputs", "password"]
      }
    ]
  }
});

const ibmApiConnectInputs = {
  clientId: "client-id",
  clientSecret: "client-secret",
  instanceUrl: "https://api.example.com",
  apiKey: "api-key",
  orgId: "org-id",
  catalogId: "catalog-id",
  consumerOrgId: "consumer-org-id",
  appId: "app-id",
  gatewayId: "gateway-id",
  gatewayPoolId: undefined
};
const ibmApiConnectCreateDefaults = getIbmApiConnectCreateDefaultValues(createContext);
const ibmApiConnectCreateValues = {
  ...ibmApiConnectCreateDefaults,
  name: "ibm-api-connect-secret",
  inputs: ibmApiConnectInputs
};
const ibmApiConnectEditInputs = {
  ...ibmApiConnectInputs,
  clientSecret: "********",
  apiKey: "********",
  gatewayId: null,
  gatewayPoolId: null
};
const ibmApiConnectEditContext = getEditContext({
  provider: DynamicSecretProviders.IbmApiConnect,
  inputs: ibmApiConnectEditInputs
});
const ibmApiConnectEditValues = {
  name: "renamed-ibm-api-connect-secret",
  defaultTTL: "1h",
  maxTTL: "24h",
  inputs: ibmApiConnectEditInputs
};

testDynamicSecretProviderContract({
  name: "IBM API Connect",
  definition: ibmApiConnectDynamicSecretProvider,
  create: {
    context: createContext,
    defaultValues: ibmApiConnectCreateDefaults,
    validValues: ibmApiConnectCreateValues,
    payload: {
      provider: { type: DynamicSecretProviders.IbmApiConnect, inputs: ibmApiConnectInputs },
      maxTTL: "24h",
      name: "ibm-api-connect-secret",
      path: "/folder",
      defaultTTL: "1h",
      projectSlug: "project",
      environmentSlug: "dev"
    },
    invalidValues: [
      {
        name: "remote application identifier is missing",
        values: {
          ...ibmApiConnectCreateValues,
          inputs: { ...ibmApiConnectInputs, appId: "" }
        },
        issuePaths: [["inputs", "appId"]]
      },
      {
        name: "maximum TTL is shorter than default TTL",
        values: {
          ...ibmApiConnectCreateValues,
          defaultTTL: "2s",
          maxTTL: "1s"
        },
        issuePaths: [["maxTTL"]]
      }
    ]
  },
  edit: {
    context: ibmApiConnectEditContext,
    defaultValues: {
      name: "existing-secret",
      defaultTTL: "1h",
      maxTTL: "24h",
      inputs: ibmApiConnectEditInputs
    },
    validValues: ibmApiConnectEditValues,
    payload: {
      name: "existing-secret",
      path: "/folder",
      projectSlug: "project",
      environmentSlug: "dev",
      data: {
        maxTTL: "24h",
        defaultTTL: "1h",
        inputs: ibmApiConnectEditInputs,
        newName: "renamed-ibm-api-connect-secret"
      }
    },
    maskedValues: [
      {
        name: "client secret",
        expected: "********",
        defaultValuePath: ["inputs", "clientSecret"],
        payloadValuePath: ["data", "inputs", "clientSecret"]
      },
      {
        name: "API key",
        expected: "********",
        defaultValuePath: ["inputs", "apiKey"],
        payloadValuePath: ["data", "inputs", "apiKey"]
      }
    ]
  }
});

const totpCreateDefaults = getTotpCreateDefaultValues(createContext);
const totpCreateValues = {
  ...totpCreateDefaults,
  name: "totp-secret",
  inputs: {
    configType: TotpConfigType.MANUAL as const,
    secret: "ABC 123",
    period: 30,
    algorithm: TotpAlgorithm.SHA256,
    digits: 6
  }
};
const totpEditInputs = {
  configType: TotpConfigType.MANUAL as const,
  secret: "********",
  period: 30,
  algorithm: TotpAlgorithm.SHA1,
  digits: 6
};
const totpEditContext = getEditContext({
  provider: DynamicSecretProviders.Totp,
  inputs: totpEditInputs,
  defaultTTL: "1m"
});
const totpEditValues = {
  name: "renamed-totp-secret",
  defaultTTL: "1m",
  maxTTL: "24h",
  inputs: totpEditInputs
};

testDynamicSecretProviderContract({
  name: "TOTP",
  definition: totpDynamicSecretProvider,
  create: {
    context: createContext,
    defaultValues: totpCreateDefaults,
    validValues: totpCreateValues,
    payload: {
      provider: {
        type: DynamicSecretProviders.Totp,
        inputs: { ...totpCreateValues.inputs, secret: "ABC123" }
      },
      maxTTL: "24h",
      name: "totp-secret",
      path: "/folder",
      defaultTTL: "1m",
      projectSlug: "project",
      environmentSlug: "dev"
    },
    invalidValues: [
      {
        name: "OTP URL has no embedded secret",
        values: {
          ...totpCreateValues,
          inputs: { configType: TotpConfigType.URL, url: "otpauth://totp/example" }
        },
        issuePaths: [["inputs", "url"]]
      }
    ]
  },
  edit: {
    context: totpEditContext,
    defaultValues: {
      name: "existing-secret",
      defaultTTL: "1m",
      maxTTL: "24h",
      inputs: totpEditInputs
    },
    validValues: totpEditValues,
    payload: {
      name: "existing-secret",
      path: "/folder",
      projectSlug: "project",
      environmentSlug: "dev",
      data: {
        inputs: totpEditInputs,
        newName: "renamed-totp-secret"
      }
    },
    maskedValues: [
      {
        name: "manual secret",
        expected: "********",
        defaultValuePath: ["inputs", "secret"],
        payloadValuePath: ["data", "inputs", "secret"]
      }
    ]
  }
});

describe("data-service and protocol provider registration", () => {
  it("registers all seven providers in product picker order", () => {
    assert.deepEqual(
      dataProtocolContractModule.definitions.map(({ provider }) => provider),
      DATA_PROTOCOL_DYNAMIC_SECRET_PROVIDERS
    );

    const registry = createDynamicSecretProviderRegistry(dataProtocolContractModule);
    assert.deepEqual(registry.providers, [
      DynamicSecretProviders.Cassandra,
      DynamicSecretProviders.ElasticSearch,
      DynamicSecretProviders.RabbitMq,
      DynamicSecretProviders.Totp,
      DynamicSecretProviders.Kubernetes,
      DynamicSecretProviders.Milvus,
      DynamicSecretProviders.IbmApiConnect
    ]);
    registry.providers.forEach((provider) => {
      assert.equal(registry.requireDefinition(provider).provider, provider);
    });
  });

  it("keeps discovered and non-scalar values behind explicit custom renderers", () => {
    assert.ok(cassandraDynamicSecretProvider.customRenderer?.reasons.includes("import-workflow"));
    assert.ok(
      elasticSearchDynamicSecretProvider.customRenderer?.reasons.includes("repeatable-fields")
    );
    assert.ok(kubernetesDynamicSecretProvider.customRenderer?.reasons.includes("remote-options"));
    assert.ok(milvusDynamicSecretProvider.customRenderer?.reasons.includes("remote-options"));
    assert.ok(rabbitMqDynamicSecretProvider.customRenderer?.reasons.includes("non-scalar-value"));
    assert.ok(
      ibmApiConnectDynamicSecretProvider.customRenderer?.reasons.includes("remote-options")
    );
    assert.ok(totpDynamicSecretProvider.customRenderer?.reasons.includes("conditional-fields"));
  });
});

describe("data-service and protocol provider-specific branches", () => {
  it("preserves provider TLS verification flags", () => {
    const cassandraPayload = getCassandraCreatePayload(
      {
        ...cassandraCreateValues,
        inputs: { ...cassandraCreateValues.inputs, sslRejectUnauthorized: false }
      },
      createContext
    );
    assert.equal(
      (cassandraPayload.provider.inputs as unknown as { sslRejectUnauthorized: boolean })
        .sslRejectUnauthorized,
      false
    );

    const elasticSearchPayload = getElasticSearchEditPayload(
      {
        ...elasticSearchEditValues,
        inputs: { ...elasticSearchEditValues.inputs, sslRejectUnauthorized: false }
      },
      elasticSearchEditContext
    );
    assert.equal(
      (elasticSearchPayload.data.inputs as { sslRejectUnauthorized: boolean })
        .sslRejectUnauthorized,
      false
    );

    const kubernetesPayload = getKubernetesCreatePayload(
      {
        ...kubernetesCreateValues,
        inputs: {
          ...kubernetesCreateValues.inputs,
          sslEnabled: true,
          sslRejectUnauthorized: false
        }
      },
      createContext
    );
    assert.equal(
      (kubernetesPayload.provider.inputs as unknown as { sslRejectUnauthorized: boolean })
        .sslRejectUnauthorized,
      false
    );

    const milvusPayload = getMilvusCreatePayload(
      {
        ...milvusCreateValues,
        inputs: { ...milvusCreateValues.inputs, sslRejectUnauthorized: false }
      },
      createContext
    );
    assert.equal(milvusPayload.provider.inputs.sslRejectUnauthorized, false);

    const rabbitMqPayload = getRabbitMqCreatePayload(
      {
        ...rabbitMqCreateValues,
        inputs: { ...rabbitMqCreateValues.inputs, sslRejectUnauthorized: false }
      },
      createContext
    );
    assert.equal(
      (rabbitMqPayload.provider.inputs as unknown as { sslRejectUnauthorized: boolean })
        .sslRejectUnauthorized,
      false
    );
  });

  it("maps Cassandra Vault fields without inventing credentials", () => {
    const imported = getCassandraVaultImportValues({
      name: "cassandra-role",
      default_ttl: 3600,
      max_ttl: 7200,
      creation_statements: ["CREATE ROLE '{{name}}'"],
      revocation_statements: ["DROP ROLE '{{name}}'"],
      renew_statements: ["ALTER ROLE '{{name}}'"],
      config: {
        connection_details: {
          hosts: "node-1.example.com:9142,node-2.example.com:9142",
          username: "vault-admin",
          tls_ca: "certificate"
        }
      }
    } as never);

    assert.equal(imported.inputs.host, "node-1.example.com,node-2.example.com");
    assert.equal(imported.inputs.port, 9142);
    assert.equal(imported.inputs.username, "vault-admin");
    assert.equal("password" in imported.inputs, false);
    assert.equal(imported.inputs.creationStatement, "CREATE ROLE '{{username}}'");
    assert.equal(imported.defaultTTL, "3600s");
    assert.equal(imported.maxTTL, "7200s");
  });

  it("preserves Kubernetes discriminator, gateway, and Vault import behavior", () => {
    const missingToken = kubernetesCreateFormSchema.safeParse({
      ...kubernetesCreateValues,
      inputs: { ...kubernetesCreateValues.inputs, url: "", clusterToken: "" }
    });
    assert.equal(missingToken.success, false);
    if (!missingToken.success) {
      assert.deepEqual(
        missingToken.error.issues.map(({ path }) => path),
        [
          ["inputs", "clusterToken"],
          ["inputs", "url"]
        ]
      );
    }

    assert.equal(normalizeKubernetesGatewayValueForMode("create", null), undefined);
    assert.equal(normalizeKubernetesGatewayValueForMode("edit", null), null);

    const directApiValues = {
      ...kubernetesEditValues,
      inputs: {
        ...kubernetesEditValues.inputs,
        authMethod: KubernetesAuthMethod.Api,
        gatewayId: null,
        gatewayPoolId: null
      }
    };
    assert.equal(kubernetesEditFormSchema.safeParse(directApiValues).success, true);
    const directApiPayload = getKubernetesEditPayload(directApiValues, kubernetesEditContext);
    assert.equal((directApiPayload.data.inputs as { gatewayId: null }).gatewayId, null);
    assert.equal((directApiPayload.data.inputs as { gatewayPoolId: null }).gatewayPoolId, null);

    const imported = getKubernetesVaultImportValues({
      name: "kubernetes-role",
      token_default_ttl: 3600,
      token_max_ttl: 7200,
      kubernetes_role_name: "lease-role",
      kubernetes_role_type: "ClusterRole",
      allowed_kubernetes_namespaces: ["platform", "security"],
      token_default_audiences: ["infisical"],
      config: {
        kubernetes_host: "https://kubernetes.example.com",
        kubernetes_ca_cert: "certificate"
      }
    } as never);

    assert.equal(imported.inputs.credentialType, KubernetesDynamicSecretCredentialType.Dynamic);
    assert.equal(imported.inputs.roleType, KubernetesRoleType.ClusterRole);
    assert.equal(imported.inputs.namespace, "platform, security");
    assert.deepEqual(imported.inputs.audiences, ["infisical"]);
    assert.equal(imported.inputs.sslEnabled, true);
  });

  it("keeps IBM API Connect's TTL, remote IDs, and edit gateway detachment", () => {
    assert.equal(
      ibmApiConnectCreateFormSchema.safeParse({
        ...ibmApiConnectCreateValues,
        defaultTTL: "1s",
        maxTTL: "2s"
      }).success,
      true
    );
    assert.equal(
      ibmApiConnectCreateFormSchema.safeParse({
        ...ibmApiConnectCreateValues,
        defaultTTL: "500ms"
      }).success,
      false
    );

    const payload = getIbmApiConnectCreatePayload(ibmApiConnectCreateValues, createContext);
    assert.equal(payload.provider.inputs.orgId, "org-id");
    assert.equal(payload.provider.inputs.catalogId, "catalog-id");
    assert.equal(
      (payload.provider.inputs as typeof ibmApiConnectInputs).consumerOrgId,
      "consumer-org-id"
    );
    assert.equal(payload.provider.inputs.appId, "app-id");

    assert.equal(normalizeIbmApiConnectGatewayValueForMode("create", null), undefined);
    assert.equal(normalizeIbmApiConnectGatewayValueForMode("edit", null), null);

    const attachedGatewayContext = getEditContext({
      provider: DynamicSecretProviders.IbmApiConnect,
      inputs: {
        ...ibmApiConnectEditInputs,
        gatewayId: "gateway-id",
        gatewayPoolId: null
      }
    });
    const detachedGatewayPayload = getIbmApiConnectEditPayload(
      {
        ...ibmApiConnectEditValues,
        inputs: {
          ...ibmApiConnectEditValues.inputs,
          gatewayId: normalizeIbmApiConnectGatewayValueForMode("edit", null),
          gatewayPoolId: normalizeIbmApiConnectGatewayValueForMode("edit", null)
        }
      },
      attachedGatewayContext
    );
    const detachedGatewayInputs = detachedGatewayPayload.data.inputs as {
      gatewayId: string | null;
      gatewayPoolId: string | null;
    };
    assert.equal(detachedGatewayInputs.gatewayId, null);
    assert.equal(detachedGatewayInputs.gatewayPoolId, null);
    assert.deepEqual(JSON.parse(JSON.stringify(detachedGatewayInputs)), {
      gatewayId: null,
      gatewayPoolId: null,
      clientId: "client-id",
      clientSecret: "********",
      instanceUrl: "https://api.example.com",
      apiKey: "********",
      orgId: "org-id",
      catalogId: "catalog-id",
      consumerOrgId: "consumer-org-id",
      appId: "app-id"
    });
  });

  it("accepts both TOTP modes and omits unchanged edit inputs when requested", () => {
    assert.equal(
      totpCreateFormSchema.safeParse({
        ...totpCreateDefaults,
        name: "totp-url",
        inputs: { configType: TotpConfigType.URL, url: "otpauth://totp/example?secret=ABC123" }
      }).success,
      true
    );
    assert.equal(
      totpCreateFormSchema.safeParse({
        ...totpCreateDefaults,
        name: "totp-manual",
        inputs: totpCreateValues.inputs
      }).success,
      true
    );

    const valuesWithoutInputs = {
      name: "renamed-totp-secret",
      defaultTTL: "1m",
      maxTTL: "24h",
      inputs: undefined
    };
    assert.equal(totpEditFormSchema.safeParse(valuesWithoutInputs).success, true);
    const payload = getTotpEditPayload(valuesWithoutInputs as never, totpEditContext);
    assert.equal(payload.data.inputs, undefined);
  });
});
