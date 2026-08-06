import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { SshCertKeyAlgorithm } from "@app/hooks/api/dynamicSecret/constants";
import {
  DynamicSecretAwsIamAuth,
  DynamicSecretAwsIamCredentialType,
  DynamicSecretProviders,
  TailscaleAuthMethod,
  TailscaleKeyAuthType
} from "@app/hooks/api/dynamicSecret/types";

import type { TAwsIamFormValues } from "./providerDefinitions/awsIamContract";
import {
  AWS_IAM_CUSTOM_RENDERER_REASONS,
  awsIamCreateFormSchema,
  awsIamEditFormSchema,
  getAwsIamCreateDefaultValues,
  getAwsIamCreatePayload,
  getAwsIamEditDefaultValues,
  getAwsIamEditPayload
} from "./providerDefinitions/awsIamContract";
import {
  AZURE_ENTRA_ID_CREATE_RENDERER_REASONS,
  AZURE_ENTRA_ID_EDIT_RENDERER_REASONS,
  azureEntraIdCreateFormSchema,
  azureEntraIdEditFormSchema,
  getAzureEntraIdCreateDefaultValues,
  getAzureEntraIdCreatePayload,
  getAzureEntraIdEditDefaultValues,
  getAzureEntraIdEditPayload
} from "./providerDefinitions/azureEntraIdContract";
import {
  GCP_IAM_CUSTOM_RENDERER_REASONS,
  gcpIamCreateFormSchema,
  gcpIamEditFormSchema,
  getGcpIamCreateDefaultValues,
  getGcpIamCreatePayload,
  getGcpIamEditDefaultValues,
  getGcpIamEditPayload
} from "./providerDefinitions/gcpIamContract";
import {
  getGithubCreateDefaultValues,
  getGithubCreatePayload,
  getGithubEditDefaultValues,
  getGithubEditPayload,
  GITHUB_CUSTOM_RENDERER_REASONS,
  githubCreateFormSchema,
  githubEditFormSchema
} from "./providerDefinitions/githubContract";
import { IDENTITY_ACCESS_DYNAMIC_SECRET_PROVIDERS } from "./providerDefinitions/identityAccessContract";
import {
  getLdapCreateDefaultValues,
  getLdapCreatePayload,
  getLdapEditDefaultValues,
  getLdapEditPayload,
  getLdapVaultImportValues,
  LDAP_CUSTOM_RENDERER_REASONS,
  ldapCreateFormSchema,
  LdapCredentialType,
  ldapEditFormSchema
} from "./providerDefinitions/ldapContract";
import {
  getSshCreateDefaultValues,
  getSshCreatePayload,
  getSshEditDefaultValues,
  getSshEditPayload,
  SSH_CREATE_WORKFLOW_BOUNDARY_REASONS,
  SSH_CUSTOM_RENDERER_REASONS,
  sshCreateFormSchema,
  sshEditFormSchema
} from "./providerDefinitions/sshContract";
import {
  getTailscaleCreateDefaultValues,
  getTailscaleCreatePayload,
  getTailscaleEditDefaultValues,
  getTailscaleEditPayload,
  TAILSCALE_CUSTOM_RENDERER_REASONS,
  tailscaleCreateFormSchema,
  tailscaleEditFormSchema
} from "./providerDefinitions/tailscaleContract";
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
  usernameTemplate
}: {
  provider: DynamicSecretProviders;
  inputs: unknown;
  defaultTTL?: string;
  maxTTL?: string;
  usernameTemplate?: string | null;
}): TEditDynamicSecretProviderFormContext => ({
  projectSlug: "project",
  secretPath: "/folder",
  environment: "dev",
  dynamicSecret: {
    id: "dynamic-secret-id",
    name: "existing-secret",
    type: provider,
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    defaultTTL,
    ...(maxTTL === undefined ? {} : { maxTTL }),
    ...(usernameTemplate === undefined ? {} : { usernameTemplate }),
    inputs
  }
});

const privateKey = "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----";
const NoopRenderer = () => null;

const awsIamDynamicSecretProvider = defineDynamicSecretProvider({
  provider: DynamicSecretProviders.AwsIam,
  label: "AWS IAM",
  customRenderer: {
    reasons: AWS_IAM_CUSTOM_RENDERER_REASONS,
    Component: NoopRenderer
  },
  create: {
    schema: awsIamCreateFormSchema,
    getDefaultValues: getAwsIamCreateDefaultValues,
    toPayload: getAwsIamCreatePayload,
    submitLabel: "Submit"
  },
  edit: {
    schema: awsIamEditFormSchema,
    getDefaultValues: getAwsIamEditDefaultValues,
    toPayload: getAwsIamEditPayload,
    submitLabel: "Submit",
    successMessage: "Successfully updated dynamic secret"
  }
});

const gcpIamDynamicSecretProvider = defineDynamicSecretProvider({
  provider: DynamicSecretProviders.GcpIam,
  label: "GCP IAM",
  customRenderer: {
    reasons: GCP_IAM_CUSTOM_RENDERER_REASONS,
    Component: NoopRenderer
  },
  create: {
    schema: gcpIamCreateFormSchema,
    getDefaultValues: getGcpIamCreateDefaultValues,
    toPayload: getGcpIamCreatePayload,
    submitLabel: "Submit"
  },
  edit: {
    schema: gcpIamEditFormSchema,
    getDefaultValues: getGcpIamEditDefaultValues,
    toPayload: getGcpIamEditPayload,
    submitLabel: "Submit",
    successMessage: "Successfully updated dynamic secret"
  }
});

const azureEntraIdDynamicSecretProvider = defineDynamicSecretProvider({
  provider: DynamicSecretProviders.AzureEntraId,
  label: "Azure Entra ID",
  create: {
    schema: azureEntraIdCreateFormSchema,
    getDefaultValues: getAzureEntraIdCreateDefaultValues,
    toPayload: getAzureEntraIdCreatePayload,
    customRenderer: {
      reasons: AZURE_ENTRA_ID_CREATE_RENDERER_REASONS,
      Component: NoopRenderer
    },
    submitLabel: "Submit"
  },
  edit: {
    schema: azureEntraIdEditFormSchema,
    getDefaultValues: getAzureEntraIdEditDefaultValues,
    toPayload: getAzureEntraIdEditPayload,
    customRenderer: {
      reasons: AZURE_ENTRA_ID_EDIT_RENDERER_REASONS,
      Component: NoopRenderer
    },
    submitLabel: "Submit",
    successMessage: "Successfully updated dynamic secret"
  }
});

const githubDynamicSecretProvider = defineDynamicSecretProvider({
  provider: DynamicSecretProviders.Github,
  label: "GitHub",
  create: {
    schema: githubCreateFormSchema,
    getDefaultValues: getGithubCreateDefaultValues,
    toPayload: getGithubCreatePayload,
    customRenderer: {
      reasons: GITHUB_CUSTOM_RENDERER_REASONS,
      Component: NoopRenderer
    },
    submitLabel: "Submit"
  },
  edit: {
    schema: githubEditFormSchema,
    getDefaultValues: getGithubEditDefaultValues,
    toPayload: getGithubEditPayload,
    customRenderer: {
      reasons: GITHUB_CUSTOM_RENDERER_REASONS,
      Component: NoopRenderer
    },
    submitLabel: "Submit",
    successMessage: "Successfully updated dynamic secret"
  }
});

const tailscaleDynamicSecretProvider = defineDynamicSecretProvider({
  provider: DynamicSecretProviders.Tailscale,
  label: "Tailscale",
  customRenderer: {
    reasons: TAILSCALE_CUSTOM_RENDERER_REASONS,
    Component: NoopRenderer
  },
  create: {
    schema: tailscaleCreateFormSchema,
    getDefaultValues: getTailscaleCreateDefaultValues,
    toPayload: getTailscaleCreatePayload,
    submitLabel: "Submit"
  },
  edit: {
    schema: tailscaleEditFormSchema,
    getDefaultValues: getTailscaleEditDefaultValues,
    toPayload: getTailscaleEditPayload,
    submitLabel: "Submit",
    successMessage: "Successfully updated dynamic secret"
  }
});

const sshDynamicSecretProvider = defineDynamicSecretProvider({
  provider: DynamicSecretProviders.Ssh,
  label: "SSH",
  customRenderer: {
    reasons: SSH_CUSTOM_RENDERER_REASONS,
    Component: NoopRenderer
  },
  create: {
    schema: sshCreateFormSchema,
    getDefaultValues: getSshCreateDefaultValues,
    toPayload: getSshCreatePayload,
    submitLabel: "Submit"
  },
  edit: {
    schema: sshEditFormSchema,
    getDefaultValues: getSshEditDefaultValues,
    toPayload: getSshEditPayload,
    submitLabel: "Submit",
    successMessage: "Successfully updated dynamic secret"
  }
});

const ldapDynamicSecretProvider = defineDynamicSecretProvider({
  provider: DynamicSecretProviders.Ldap,
  label: "LDAP",
  customRenderer: {
    reasons: LDAP_CUSTOM_RENDERER_REASONS,
    Component: NoopRenderer
  },
  create: {
    schema: ldapCreateFormSchema,
    getDefaultValues: getLdapCreateDefaultValues,
    toPayload: getLdapCreatePayload,
    submitLabel: "Submit"
  },
  edit: {
    schema: ldapEditFormSchema,
    getDefaultValues: getLdapEditDefaultValues,
    toPayload: getLdapEditPayload,
    submitLabel: "Submit",
    successMessage: "Successfully updated dynamic secret"
  }
});

const identityAccessContractModule = defineDynamicSecretProviderModule({
  id: "identity-access",
  definitions: [
    awsIamDynamicSecretProvider,
    gcpIamDynamicSecretProvider,
    azureEntraIdDynamicSecretProvider,
    githubDynamicSecretProvider,
    tailscaleDynamicSecretProvider,
    sshDynamicSecretProvider,
    ldapDynamicSecretProvider
  ]
});

const awsCreateDefaults: TAwsIamFormValues = {
  name: "",
  defaultTTL: "1h",
  maxTTL: "24h",
  environment,
  usernameTemplate: DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE,
  inputs: {
    method: DynamicSecretAwsIamAuth.AssumeRole,
    credentialType: DynamicSecretAwsIamCredentialType.IamUser,
    roleArn: "",
    region: "us-east-1",
    awsPath: "/",
    tags: []
  }
};
const awsEditInputs: TAwsIamFormValues["inputs"] = {
  method: DynamicSecretAwsIamAuth.AccessKey,
  credentialType: DynamicSecretAwsIamCredentialType.IamUser,
  accessKey: "AKIAEXAMPLE",
  secretAccessKey: "********",
  region: "us-east-1",
  awsPath: "/",
  // Existing tags can exceed the create-time AWS limits, so edits must preserve them.
  tags: [{ key: "e".repeat(129), value: "platform" }]
};
const awsEditContext = getEditContext({
  provider: DynamicSecretProviders.AwsIam,
  inputs: awsEditInputs,
  usernameTemplate: null
});
const awsCreateValues: TAwsIamFormValues = {
  ...awsCreateDefaults,
  name: "aws-secret",
  inputs: {
    method: DynamicSecretAwsIamAuth.AssumeRole,
    credentialType: DynamicSecretAwsIamCredentialType.TemporaryCredentials,
    roleArn: "arn:aws:iam::123:role/example",
    region: "us-east-1",
    policyArns: "must-clear",
    policyDocument: "must-clear",
    sessionPolicyArns: "session-policy"
  }
};
const awsEditValues: TAwsIamFormValues = {
  name: "renamed-aws-secret",
  defaultTTL: "1h",
  maxTTL: null,
  usernameTemplate: DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE,
  inputs: awsEditInputs
};

testDynamicSecretProviderContract({
  name: "AWS IAM",
  definition: awsIamDynamicSecretProvider,
  create: {
    context: createContext,
    defaultValues: awsCreateDefaults,
    validValues: awsCreateValues,
    payload: {
      provider: {
        type: DynamicSecretProviders.AwsIam,
        inputs: {
          ...awsCreateValues.inputs,
          policyArns: "",
          policyDocument: ""
        }
      },
      maxTTL: "24h",
      name: "aws-secret",
      path: "/folder",
      defaultTTL: "1h",
      projectSlug: "project",
      environmentSlug: "dev",
      usernameTemplate: undefined
    },
    invalidValues: [
      {
        name: "tag key exceeds the create limit",
        values: {
          ...awsCreateDefaults,
          name: "aws-secret",
          inputs: {
            ...awsCreateDefaults.inputs,
            roleArn: "arn:aws:iam::123:role/example",
            tags: [{ key: "a".repeat(129), value: "value" }]
          }
        },
        issuePaths: [["inputs", "tags", 0, "key"]]
      }
    ]
  },
  edit: {
    context: awsEditContext,
    defaultValues: {
      name: "existing-secret",
      defaultTTL: "1h",
      maxTTL: "24h",
      usernameTemplate: DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE,
      inputs: awsEditInputs
    },
    validValues: awsEditValues,
    payload: {
      name: "existing-secret",
      path: "/folder",
      projectSlug: "project",
      environmentSlug: "dev",
      data: {
        maxTTL: undefined,
        defaultTTL: "1h",
        inputs: {
          ...awsEditInputs,
          sessionPolicyArns: "",
          sessionPolicyDocument: ""
        },
        newName: "renamed-aws-secret",
        usernameTemplate: null
      }
    },
    maskedValues: [
      {
        name: "secret access key",
        expected: "********",
        defaultValuePath: ["inputs", "secretAccessKey"],
        payloadValuePath: ["data", "inputs", "secretAccessKey"]
      }
    ]
  }
});

const gcpDefaultScopes = [
  { value: "https://www.googleapis.com/auth/iam" },
  { value: "https://www.googleapis.com/auth/cloud-platform" }
];
const gcpCreateDefaults = {
  name: "",
  defaultTTL: "30m",
  maxTTL: "1h",
  environment,
  inputs: { serviceAccountEmail: "", tokenScopes: gcpDefaultScopes }
};
const gcpEditContext = getEditContext({
  provider: DynamicSecretProviders.GcpIam,
  defaultTTL: "30m",
  maxTTL: "1h",
  inputs: { serviceAccountEmail: "service@example.com" }
});
const gcpCreateValues = {
  ...gcpCreateDefaults,
  name: "gcp-secret",
  inputs: {
    serviceAccountEmail: "service@example.com",
    tokenScopes: [{ value: "scope-a" }, { value: "scope-a" }, { value: "scope-b" }]
  }
};
const gcpEditValues = {
  name: "renamed-gcp-secret",
  defaultTTL: "30m",
  maxTTL: "1h",
  inputs: {
    serviceAccountEmail: "service@example.com",
    tokenScopes: gcpDefaultScopes
  }
};

testDynamicSecretProviderContract({
  name: "GCP IAM",
  definition: gcpIamDynamicSecretProvider,
  create: {
    context: createContext,
    defaultValues: gcpCreateDefaults,
    validValues: gcpCreateValues,
    payload: {
      provider: {
        type: DynamicSecretProviders.GcpIam,
        inputs: {
          serviceAccountEmail: "service@example.com",
          tokenScopes: ["scope-a", "scope-b"]
        }
      },
      maxTTL: "1h",
      name: "gcp-secret",
      path: "/folder",
      defaultTTL: "30m",
      projectSlug: "project",
      environmentSlug: "dev"
    },
    invalidValues: [
      {
        name: "TTL exceeds one hour",
        values: {
          ...gcpCreateValues,
          defaultTTL: "2h",
          maxTTL: undefined
        },
        issuePaths: [["defaultTTL"]]
      }
    ]
  },
  edit: {
    context: gcpEditContext,
    defaultValues: {
      name: "existing-secret",
      defaultTTL: "30m",
      maxTTL: "1h",
      inputs: {
        serviceAccountEmail: "service@example.com",
        tokenScopes: gcpDefaultScopes
      }
    },
    validValues: gcpEditValues,
    payload: {
      name: "existing-secret",
      path: "/folder",
      projectSlug: "project",
      environmentSlug: "dev",
      data: {
        inputs: {
          serviceAccountEmail: "service@example.com",
          tokenScopes: gcpDefaultScopes.map(({ value }) => value)
        },
        newName: "renamed-gcp-secret",
        defaultTTL: "30m",
        maxTTL: "1h"
      }
    }
  }
});

const azureCreateDefaults = {
  name: "",
  defaultTTL: "1h",
  maxTTL: "24h",
  environment,
  selectedUsers: [],
  inputs: { tenantId: "", applicationId: "", clientSecret: "" }
};
const azureEditInputs = {
  email: "alice@example.com",
  userId: "user-id",
  tenantId: "tenant-id",
  applicationId: "application-id",
  clientSecret: "********"
};
const azureEditContext = getEditContext({
  provider: DynamicSecretProviders.AzureEntraId,
  inputs: azureEditInputs
});
const azureCreateValues = {
  ...azureCreateDefaults,
  name: "entra",
  inputs: { tenantId: "tenant", applicationId: "app", clientSecret: "secret" },
  selectedUsers: [
    { id: "1", name: "alice", email: "alice@example.com" },
    { id: "2", name: "bob", email: "bob@example.com" }
  ]
};
const azureEditValues = {
  name: "renamed-entra-secret",
  defaultTTL: "1h",
  maxTTL: "24h",
  inputs: azureEditInputs
};

testDynamicSecretProviderContract({
  name: "Azure Entra ID",
  definition: azureEntraIdDynamicSecretProvider,
  create: {
    context: createContext,
    defaultValues: azureCreateDefaults,
    validValues: azureCreateValues,
    payload: azureCreateValues.selectedUsers.map((user) => ({
      provider: {
        type: DynamicSecretProviders.AzureEntraId,
        inputs: {
          ...azureCreateValues.inputs,
          userId: user.id,
          email: user.email
        }
      },
      maxTTL: "24h",
      name: `entra-${user.name}`,
      path: "/folder",
      defaultTTL: "1h",
      projectSlug: "project",
      environmentSlug: "dev"
    })),
    invalidValues: [
      {
        name: "no users are selected",
        values: { ...azureCreateValues, selectedUsers: [] },
        issuePaths: [["selectedUsers"]]
      },
      {
        name: "selected user is missing an id",
        values: {
          ...azureCreateValues,
          selectedUsers: [{ id: "", name: "alice", email: "alice@example.com" }]
        },
        issuePaths: [["selectedUsers", 0, "id"]]
      }
    ]
  },
  edit: {
    context: azureEditContext,
    defaultValues: {
      name: "existing-secret",
      defaultTTL: "1h",
      maxTTL: "24h",
      inputs: azureEditInputs
    },
    validValues: azureEditValues,
    payload: {
      name: "existing-secret",
      path: "/folder",
      projectSlug: "project",
      environmentSlug: "dev",
      data: {
        maxTTL: "24h",
        defaultTTL: "1h",
        newName: "renamed-entra-secret",
        inputs: azureEditInputs
      }
    },
    maskedValues: [
      {
        name: "client secret",
        expected: "********",
        defaultValuePath: ["inputs", "clientSecret"],
        payloadValuePath: ["data", "inputs", "clientSecret"]
      }
    ]
  }
});

const githubCreateDefaults = {
  name: "",
  defaultTTL: "1h",
  maxTTL: undefined,
  environment,
  inputs: { appId: 0, installationId: 0, privateKey: "" }
};
const githubEditInputs = { appId: 1, installationId: 2, privateKey: "********" };
const githubEditContext = getEditContext({
  provider: DynamicSecretProviders.Github,
  inputs: githubEditInputs,
  maxTTL: undefined
});
const githubCreateValues = {
  ...githubCreateDefaults,
  name: "github-secret",
  inputs: { appId: 1, installationId: 2, privateKey }
};
const githubEditValues = {
  name: "renamed-github-secret",
  defaultTTL: "1h",
  maxTTL: undefined,
  inputs: githubEditInputs
};

testDynamicSecretProviderContract({
  name: "GitHub",
  definition: githubDynamicSecretProvider,
  create: {
    context: createContext,
    defaultValues: githubCreateDefaults,
    validValues: githubCreateValues,
    payload: {
      provider: {
        type: DynamicSecretProviders.Github,
        inputs: githubCreateValues.inputs
      },
      defaultTTL: "1h",
      name: "github-secret",
      path: "/folder",
      projectSlug: "project",
      environmentSlug: "dev"
    },
    invalidValues: [
      {
        name: "private key is not PEM",
        values: {
          ...githubCreateValues,
          inputs: { ...githubCreateValues.inputs, privateKey: "not-pem" }
        },
        issuePaths: [["inputs", "privateKey"]]
      }
    ]
  },
  edit: {
    context: githubEditContext,
    defaultValues: {
      name: "existing-secret",
      defaultTTL: "1h",
      maxTTL: undefined,
      inputs: githubEditInputs
    },
    validValues: githubEditValues,
    payload: {
      name: "existing-secret",
      path: "/folder",
      projectSlug: "project",
      environmentSlug: "dev",
      data: {
        inputs: githubEditInputs,
        newName: "renamed-github-secret"
      }
    },
    maskedValues: [
      {
        name: "private key",
        expected: "********",
        defaultValuePath: ["inputs", "privateKey"],
        payloadValuePath: ["data", "inputs", "privateKey"]
      }
    ]
  }
});

const tailscaleCreateDefaults = {
  name: "",
  defaultTTL: "1h",
  maxTTL: "24h",
  environment,
  inputs: {
    authType: TailscaleKeyAuthType.AuthKeys,
    auth: { method: TailscaleAuthMethod.ApiKey, apiKey: "" },
    tailnet: "-",
    reusable: false,
    preauthorized: false
  }
} as const;
const tailscaleCreateValues = {
  ...tailscaleCreateDefaults,
  name: "tailscale-secret",
  inputs: {
    authType: TailscaleKeyAuthType.AuthKeys,
    auth: {
      method: TailscaleAuthMethod.OAuth,
      clientId: "client-id",
      clientSecret: "client-secret"
    },
    tailnet: "-",
    description: "",
    tags: "tag:ci, tag:prod",
    reusable: true,
    preauthorized: false
  }
} as const;
const tailscaleEditRawInputs = {
  authType: TailscaleKeyAuthType.OAuthKeys,
  auth: {
    method: TailscaleAuthMethod.OAuth,
    clientId: "client-id",
    clientSecret: "********"
  },
  tailnet: "example.com",
  description: "automation",
  tags: ["tag:ci"],
  scopes: ["devices:core", "users:read"]
} as const;
const tailscaleEditContext = getEditContext({
  provider: DynamicSecretProviders.Tailscale,
  inputs: tailscaleEditRawInputs
});
const tailscaleEditValues = {
  name: "renamed-tailscale-secret",
  defaultTTL: "1h",
  maxTTL: "24h",
  inputs: {
    authType: TailscaleKeyAuthType.OAuthKeys,
    auth: tailscaleEditRawInputs.auth,
    tailnet: "example.com",
    description: "automation",
    tags: "tag:ci",
    scopes: "devices:core, users:read"
  }
} as const;

testDynamicSecretProviderContract({
  name: "Tailscale",
  definition: tailscaleDynamicSecretProvider,
  create: {
    context: createContext,
    defaultValues: tailscaleCreateDefaults,
    validValues: tailscaleCreateValues,
    payload: {
      provider: {
        type: DynamicSecretProviders.Tailscale,
        inputs: {
          authType: TailscaleKeyAuthType.AuthKeys,
          auth: tailscaleCreateValues.inputs.auth,
          tailnet: "-",
          description: undefined,
          tags: ["tag:ci", "tag:prod"],
          reusable: true,
          preauthorized: false
        }
      },
      maxTTL: "24h",
      name: "tailscale-secret",
      path: "/folder",
      defaultTTL: "1h",
      projectSlug: "project",
      environmentSlug: "dev"
    },
    invalidValues: [
      {
        name: "OAuth-created auth key has no tags",
        values: {
          ...tailscaleCreateValues,
          inputs: { ...tailscaleCreateValues.inputs, tags: "" }
        },
        issuePaths: [["inputs", "tags"]]
      },
      {
        name: "OAuth key has no tags",
        values: {
          ...tailscaleCreateValues,
          inputs: {
            authType: TailscaleKeyAuthType.OAuthKeys,
            auth: tailscaleCreateValues.inputs.auth,
            tailnet: "-",
            tags: "",
            scopes: "devices:core"
          }
        },
        issuePaths: [["inputs", "tags"]]
      },
      {
        name: "federated key has no tags",
        values: {
          ...tailscaleCreateValues,
          inputs: {
            authType: TailscaleKeyAuthType.FederatedKeys,
            auth: tailscaleCreateValues.inputs.auth,
            tailnet: "-",
            tags: "",
            scopes: "devices:core",
            issuer: "https://issuer.example.com",
            subject: "repo:example/project"
          }
        },
        issuePaths: [["inputs", "tags"]]
      },
      {
        name: "TTL is not a duration",
        values: {
          ...tailscaleCreateValues,
          defaultTTL: "invalid",
          maxTTL: undefined
        },
        issuePaths: [["defaultTTL"]]
      }
    ]
  },
  edit: {
    context: tailscaleEditContext,
    defaultValues: {
      name: "existing-secret",
      defaultTTL: "1h",
      maxTTL: "24h",
      inputs: {
        authType: TailscaleKeyAuthType.OAuthKeys,
        auth: tailscaleEditRawInputs.auth,
        tailnet: "example.com",
        description: "automation",
        tags: "tag:ci",
        scopes: "devices:core, users:read"
      }
    },
    validValues: tailscaleEditValues,
    invalidValues: [
      {
        name: "OAuth key has no tags",
        values: {
          ...tailscaleEditValues,
          inputs: { ...tailscaleEditValues.inputs, tags: "" }
        },
        issuePaths: [["inputs", "tags"]]
      }
    ],
    payload: {
      name: "existing-secret",
      path: "/folder",
      projectSlug: "project",
      environmentSlug: "dev",
      data: {
        maxTTL: "24h",
        defaultTTL: "1h",
        inputs: tailscaleEditRawInputs,
        newName: "renamed-tailscale-secret"
      }
    },
    maskedValues: [
      {
        name: "OAuth client secret",
        expected: "********",
        defaultValuePath: ["inputs", "auth", "clientSecret"],
        payloadValuePath: ["data", "inputs", "auth", "clientSecret"]
      }
    ]
  }
});

const sshCreateDefaults = {
  name: "",
  defaultTTL: "1h",
  maxTTL: "24h",
  environment,
  inputs: { principals: [], keyAlgorithm: SshCertKeyAlgorithm.ED25519 }
};
const sshCreateValues = {
  ...sshCreateDefaults,
  name: "ssh-secret",
  inputs: {
    principals: ["deploy", "root"],
    keyAlgorithm: SshCertKeyAlgorithm.ED25519
  }
};
const sshEditContext = getEditContext({
  provider: DynamicSecretProviders.Ssh,
  inputs: {
    caPublicKey: "ignored",
    principals: ["deploy"],
    keyAlgorithm: SshCertKeyAlgorithm.ED25519
  }
});
const sshEditValues = {
  name: "renamed-ssh-secret",
  defaultTTL: "1h",
  maxTTL: "24h",
  inputs: {
    principals: ["deploy"],
    keyAlgorithm: SshCertKeyAlgorithm.ED25519
  }
};

testDynamicSecretProviderContract({
  name: "SSH",
  definition: sshDynamicSecretProvider,
  create: {
    context: createContext,
    defaultValues: sshCreateDefaults,
    validValues: sshCreateValues,
    payload: {
      provider: {
        type: DynamicSecretProviders.Ssh,
        inputs: sshCreateValues.inputs
      },
      defaultTTL: "1h",
      maxTTL: "24h",
      name: "ssh-secret",
      path: "/folder",
      projectSlug: "project",
      environmentSlug: "dev"
    },
    invalidValues: [
      {
        name: "no principals",
        values: { ...sshCreateValues, inputs: { ...sshCreateValues.inputs, principals: [] } },
        issuePaths: [["inputs", "principals"]]
      }
    ]
  },
  edit: {
    context: sshEditContext,
    defaultValues: {
      name: "existing-secret",
      defaultTTL: "1h",
      maxTTL: "24h",
      inputs: {
        principals: ["deploy"],
        keyAlgorithm: SshCertKeyAlgorithm.ED25519
      }
    },
    validValues: sshEditValues,
    payload: {
      name: "existing-secret",
      path: "/folder",
      projectSlug: "project",
      environmentSlug: "dev",
      data: {
        inputs: sshEditValues.inputs,
        newName: "renamed-ssh-secret",
        defaultTTL: "1h",
        maxTTL: "24h"
      }
    }
  }
});

const ldapCreateDefaults = {
  name: "",
  defaultTTL: "1h",
  maxTTL: "24h",
  environment,
  usernameTemplate: DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE,
  inputs: {
    url: "",
    binddn: "",
    bindpass: "",
    ca: "",
    sslRejectUnauthorized: true,
    creationLdif: "",
    revocationLdif: "",
    rollbackLdif: "",
    credentialType: LdapCredentialType.Dynamic
  }
} as const;
const ldapCreateValues = {
  ...ldapCreateDefaults,
  name: "ldap-secret",
  inputs: {
    ...ldapCreateDefaults.inputs,
    url: "ldaps://ldap.example.com",
    binddn: "cn=admin",
    bindpass: "secret",
    creationLdif: "create",
    revocationLdif: "revoke"
  }
} as const;
const ldapEditInputs = {
  url: "ldaps://ldap.example.com",
  binddn: "cn=admin",
  bindpass: "********",
  ca: "certificate",
  credentialType: LdapCredentialType.Static,
  rotationLdif: "rotate"
} as const;
const ldapEditContext = getEditContext({
  provider: DynamicSecretProviders.Ldap,
  inputs: ldapEditInputs,
  usernameTemplate: null
});
const ldapEditValues = {
  name: "renamed-ldap-secret",
  defaultTTL: "1h",
  maxTTL: "24h",
  usernameTemplate: DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE,
  inputs: ldapEditInputs
};

testDynamicSecretProviderContract({
  name: "LDAP",
  definition: ldapDynamicSecretProvider,
  create: {
    context: createContext,
    defaultValues: ldapCreateDefaults,
    validValues: ldapCreateValues,
    payload: {
      provider: {
        type: DynamicSecretProviders.Ldap,
        inputs: ldapCreateValues.inputs
      },
      maxTTL: "24h",
      name: "ldap-secret",
      path: "/folder",
      defaultTTL: "1h",
      projectSlug: "project",
      usernameTemplate: undefined,
      environmentSlug: "dev"
    },
    invalidValues: [
      {
        name: "static credentials have no rotation LDIF",
        values: {
          ...ldapCreateValues,
          inputs: {
            url: "ldaps://ldap.example.com",
            binddn: "cn=admin",
            bindpass: "secret",
            credentialType: LdapCredentialType.Static
          }
        },
        issuePaths: [["inputs", "rotationLdif"]]
      }
    ]
  },
  edit: {
    context: ldapEditContext,
    defaultValues: {
      name: "existing-secret",
      defaultTTL: "1h",
      maxTTL: "24h",
      usernameTemplate: DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE,
      inputs: ldapEditInputs
    },
    validValues: ldapEditValues,
    payload: {
      name: "existing-secret",
      path: "/folder",
      projectSlug: "project",
      environmentSlug: "dev",
      data: {
        maxTTL: "24h",
        defaultTTL: "1h",
        inputs: ldapEditInputs,
        newName: "renamed-ldap-secret",
        usernameTemplate: null
      }
    },
    maskedValues: [
      {
        name: "bind password",
        expected: "********",
        defaultValuePath: ["inputs", "bindpass"],
        payloadValuePath: ["data", "inputs", "bindpass"]
      }
    ]
  }
});

describe("identity and access provider registration", () => {
  it("registers the seven-provider batch in product picker order", () => {
    assert.deepEqual(
      identityAccessContractModule.definitions.map(({ provider }) => provider),
      IDENTITY_ACCESS_DYNAMIC_SECRET_PROVIDERS
    );
    const registry = createDynamicSecretProviderRegistry(identityAccessContractModule);

    assert.deepEqual(registry.providers, [
      DynamicSecretProviders.AwsIam,
      DynamicSecretProviders.AzureEntraId,
      DynamicSecretProviders.Ldap,
      DynamicSecretProviders.GcpIam,
      DynamicSecretProviders.Github,
      DynamicSecretProviders.Ssh,
      DynamicSecretProviders.Tailscale
    ]);
    registry.providers.forEach((provider) => {
      assert.equal(registry.requireDefinition(provider).provider, provider);
    });
  });

  it("declares every provider-specific renderer boundary", () => {
    assert.ok(awsIamDynamicSecretProvider.customRenderer?.reasons.includes("conditional-fields"));
    assert.ok(gcpIamDynamicSecretProvider.customRenderer?.reasons.includes("repeatable-fields"));
    assert.ok(
      azureEntraIdDynamicSecretProvider.create.customRenderer?.reasons.includes("multi-create")
    );
    assert.ok(
      githubDynamicSecretProvider.edit.customRenderer?.reasons.includes("non-scalar-value")
    );
    assert.ok(
      tailscaleDynamicSecretProvider.customRenderer?.reasons.includes("conditional-fields")
    );
    assert.ok(sshDynamicSecretProvider.customRenderer?.reasons.includes("repeatable-fields"));
    assert.ok(SSH_CREATE_WORKFLOW_BOUNDARY_REASONS.includes("post-create-workflow"));
    assert.ok(ldapDynamicSecretProvider.customRenderer?.reasons.includes("import-workflow"));
  });

  it("maps LDAP Vault roles without inventing a bind password", () => {
    const imported = getLdapVaultImportValues({
      name: "ldap-role",
      config: { url: "ldaps://ldap.example.com", binddn: "cn=admin", certificate: "ca" },
      creation_ldif: "create",
      deletion_ldif: "delete",
      default_ttl: 3600,
      max_ttl: 7200
    } as never);

    assert.equal(imported.inputs?.bindpass, "");
    assert.equal(imported.defaultTTL, "3600s");

    const importWithoutOptionalValues = getLdapVaultImportValues({
      name: "minimal-role",
      config: {}
    } as never);
    assert.equal("defaultTTL" in importWithoutOptionalValues, false);
    assert.equal("maxTTL" in importWithoutOptionalValues, false);
    assert.equal("usernameTemplate" in importWithoutOptionalValues, false);
  });
});
