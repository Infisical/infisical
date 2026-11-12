import type {
  AppConnectionFieldPreset,
  AppConnectionMethodPreset,
  AppConnectionPreset
} from "@app/components/v4/patterns/app-connection-form";
import { APP_CONNECTION_MAP } from "@app/helpers/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { AdcsConnectionMethod } from "@app/hooks/api/appConnections/types/adcs-connection";
import { AzureADCSConnectionMethod } from "@app/hooks/api/appConnections/types/azure-adcs-connection";
import { AzureAppConfigurationConnectionMethod } from "@app/hooks/api/appConnections/types/azure-app-configuration-connection";
import { AzureClientSecretsConnectionMethod } from "@app/hooks/api/appConnections/types/azure-client-secrets-connection";
import { AzureDevOpsConnectionMethod } from "@app/hooks/api/appConnections/types/azure-devops-connection";
import { AzureDNSConnectionMethod } from "@app/hooks/api/appConnections/types/azure-dns-connection";
import { AzureEntraIdConnectionMethod } from "@app/hooks/api/appConnections/types/azure-entra-id-connection";
import { AzureKeyVaultConnectionMethod } from "@app/hooks/api/appConnections/types/azure-key-vault-connection";
import { CloudflareConnectionMethod } from "@app/hooks/api/appConnections/types/cloudflare-connection";
import { DigitalOceanConnectionMethod } from "@app/hooks/api/appConnections/types/digital-ocean";
import { GcpConnectionMethod } from "@app/hooks/api/appConnections/types/gcp-connection";
import { HerokuConnectionMethod } from "@app/hooks/api/appConnections/types/heroku-connection";
import { MicrosoftIntuneConnectionMethod } from "@app/hooks/api/appConnections/types/microsoft-intune-connection";
import { OCIConnectionMethod } from "@app/hooks/api/appConnections/types/oci-connection";
import { OVHConnectionMethod } from "@app/hooks/api/appConnections/types/ovh-connection";
import { S3CompatibleConnectionMethod } from "@app/hooks/api/appConnections/types/s3-compatible-connection";
import { SalesforceConnectionMethod } from "@app/hooks/api/appConnections/types/salesforce-connection";
import { StripeConnectionMethod } from "@app/hooks/api/appConnections/types/stripe-connection";
import {
  adcsConnectionBaseFormSchema,
  azureAdcsConnectionFormSchema,
  azureAppConfigurationConnectionFormSchema,
  azureClientSecretsConnectionFormSchema,
  azureDevOpsConnectionFormSchema,
  azureDnsConnectionFormSchema,
  azureEntraIdConnectionFormSchema,
  azureKeyVaultConnectionFormSchema,
  cloudflareConnectionFormSchema,
  digitalOceanConnectionFormSchema,
  gcpConnectionFormSchema,
  herokuConnectionFormSchema,
  microsoftIntuneConnectionFormSchema,
  ociConnectionFormSchema,
  ovhConnectionFormSchema,
  s3CompatibleConnectionFormSchema,
  salesforceConnectionFormSchema,
  stripeConnectionFormSchema
} from "@app/lib/schemas/app-connections";

import { appStateSuffix } from "../connection-redirect";
import { methodLabel } from "./shared";

const UUID_PLACEHOLDER = "00000000-0000-0000-0000-000000000000";

const tenantIdField: AppConnectionFieldPreset = {
  name: "credentials.tenantId",
  label: "Tenant ID",
  mono: true,
  placeholder: UUID_PLACEHOLDER
};

const clientIdField: AppConnectionFieldPreset = {
  name: "credentials.clientId",
  label: "Client ID",
  mono: true,
  placeholder: UUID_PLACEHOLDER
};

const clientSecretField: AppConnectionFieldPreset = {
  name: "credentials.clientSecret",
  label: "Client secret",
  kind: "secret"
};

const azureCertificateFields: readonly AppConnectionFieldPreset[] = [
  tenantIdField,
  clientIdField,
  {
    name: "credentials.certificateBody",
    label: "Certificate",
    kind: "textarea",
    placeholder: "-----BEGIN CERTIFICATE-----",
    description: "The PEM-encoded certificate uploaded to your Azure app registration."
  },
  {
    name: "credentials.privateKey",
    label: "Private key",
    kind: "secret",
    placeholder: "-----BEGIN PRIVATE KEY-----",
    description: "Used only to sign the client assertion; it is never sent to Azure."
  }
];

const AZURE_SCOPES = {
  vault: "https://vault.azure.net/.default openid offline_access",
  appConfiguration: "https://azconfig.io/.default openid offline_access",
  graph: "https://graph.microsoft.com/.default openid offline_access"
};

/** Azure OAuth: tenant ID (and organization for DevOps) sit at the form root in main's schemas. */
const azureOAuthMethod = (
  app: AppConnection,
  value: string,
  scope: string,
  withOrgName = false
): AppConnectionMethodPreset => ({
  value,
  label: methodLabel(value as Parameters<typeof methodLabel>[0]),
  credentials: {},
  fields: [
    { ...tenantIdField, name: "tenantId" },
    ...(withOrgName
      ? [{ name: "orgName", label: "Organization name", mono: true } as AppConnectionFieldPreset]
      : [])
  ],
  redirect: {
    submitLabel: "Connect to Azure",
    href: ({ values, option }) => {
      if (typeof option?.oauthClientId !== "string" || !option.oauthClientId) return undefined;
      const tenantId = (values.tenantId as string | undefined)?.trim();
      const query = new URLSearchParams({
        client_id: option.oauthClientId,
        response_type: "code",
        redirect_uri: `${window.location.origin}/organization/app-connections/azure/oauth/callback`,
        response_mode: "query",
        scope,
        state: appStateSuffix(app, {
          tenantId,
          ...(withOrgName ? { orgName: (values.orgName as string | undefined)?.trim() } : {})
        })
      });
      return `https://login.microsoftonline.com/${encodeURIComponent(tenantId || "common")}/oauth2/v2.0/authorize?${query}`;
    },
    unconfigured: "This server has no Azure OAuth application configured.",
    credentials: ({ callback, stored }) => ({
      code: callback.code ?? "",
      tenantId: stored.tenantId,
      ...(withOrgName ? { orgName: stored.orgName } : {})
    })
  }
});

const okmsFields: readonly AppConnectionFieldPreset[] = [
  {
    name: "credentials.okmsDomain",
    label: "REST API endpoint",
    mono: true,
    placeholder: "https://eu-west-rbx.okms.ovh.net"
  },
  { name: "credentials.okmsId", label: "KMS ID", mono: true }
];

export const CLOUD_PRESETS: Partial<Record<AppConnection, AppConnectionPreset>> = {
  [AppConnection.GCP]: {
    app: AppConnection.GCP,
    name: APP_CONNECTION_MAP[AppConnection.GCP].name,
    schema: gcpConnectionFormSchema,
    methods: [
      {
        value: GcpConnectionMethod.ServiceAccountImpersonation,
        label: methodLabel(GcpConnectionMethod.ServiceAccountImpersonation),
        credentials: { serviceAccountEmail: "" },
        fields: [
          {
            name: "credentials.serviceAccountEmail",
            label: "Service account email",
            mono: true,
            placeholder: "name@my-project.iam.gserviceaccount.com",
            description:
              "The service account ID must end with the first two segments of your organization ID."
          }
        ]
      }
    ]
  },
  [AppConnection.AzureKeyVault]: {
    app: AppConnection.AzureKeyVault,
    name: APP_CONNECTION_MAP[AppConnection.AzureKeyVault].name,
    schema: azureKeyVaultConnectionFormSchema,
    values: { gatewayId: null, gatewayPoolId: null },
    methods: [
      azureOAuthMethod(
        AppConnection.AzureKeyVault,
        AzureKeyVaultConnectionMethod.OAuth,
        AZURE_SCOPES.vault
      ),
      {
        value: AzureKeyVaultConnectionMethod.ClientSecret,
        label: methodLabel(AzureKeyVaultConnectionMethod.ClientSecret),
        credentials: { tenantId: "", clientId: "", clientSecret: "" },
        fields: [tenantIdField, clientIdField, clientSecretField]
      },
      {
        value: AzureKeyVaultConnectionMethod.Certificate,
        label: methodLabel(AzureKeyVaultConnectionMethod.Certificate),
        credentials: { tenantId: "", clientId: "", certificateBody: "", privateKey: "" },
        fields: azureCertificateFields
      }
    ]
  },
  [AppConnection.AzureAppConfiguration]: {
    app: AppConnection.AzureAppConfiguration,
    name: APP_CONNECTION_MAP[AppConnection.AzureAppConfiguration].name,
    schema: azureAppConfigurationConnectionFormSchema,
    methods: [
      azureOAuthMethod(
        AppConnection.AzureAppConfiguration,
        AzureAppConfigurationConnectionMethod.OAuth,
        AZURE_SCOPES.appConfiguration
      ),
      {
        value: AzureAppConfigurationConnectionMethod.ClientSecret,
        label: methodLabel(AzureAppConfigurationConnectionMethod.ClientSecret),
        credentials: { tenantId: "", clientId: "", clientSecret: "" },
        fields: [tenantIdField, clientIdField, clientSecretField]
      }
    ]
  },
  [AppConnection.AzureClientSecrets]: {
    app: AppConnection.AzureClientSecrets,
    name: APP_CONNECTION_MAP[AppConnection.AzureClientSecrets].name,
    schema: azureClientSecretsConnectionFormSchema,
    methods: [
      azureOAuthMethod(
        AppConnection.AzureClientSecrets,
        AzureClientSecretsConnectionMethod.OAuth,
        AZURE_SCOPES.graph
      ),
      {
        value: AzureClientSecretsConnectionMethod.ClientSecret,
        label: methodLabel(AzureClientSecretsConnectionMethod.ClientSecret),
        credentials: { tenantId: "", clientId: "", clientSecret: "" },
        fields: [tenantIdField, clientIdField, clientSecretField]
      },
      {
        value: AzureClientSecretsConnectionMethod.Certificate,
        label: methodLabel(AzureClientSecretsConnectionMethod.Certificate),
        credentials: { tenantId: "", clientId: "", certificateBody: "", privateKey: "" },
        fields: azureCertificateFields
      }
    ]
  },
  [AppConnection.MicrosoftIntune]: {
    app: AppConnection.MicrosoftIntune,
    name: APP_CONNECTION_MAP[AppConnection.MicrosoftIntune].name,
    schema: microsoftIntuneConnectionFormSchema,
    methods: [
      {
        value: MicrosoftIntuneConnectionMethod.ClientSecret,
        label: methodLabel(MicrosoftIntuneConnectionMethod.ClientSecret),
        credentials: { tenantId: "", clientId: "", clientSecret: "" },
        fields: [
          tenantIdField,
          {
            ...clientIdField,
            description:
              "The Entra app registration granted the Intune SCEP challenge validation permission."
          },
          clientSecretField
        ]
      }
    ]
  },
  [AppConnection.AzureDevOps]: {
    app: AppConnection.AzureDevOps,
    name: APP_CONNECTION_MAP[AppConnection.AzureDevOps].name,
    schema: azureDevOpsConnectionFormSchema,
    methods: [
      azureOAuthMethod(
        AppConnection.AzureDevOps,
        AzureDevOpsConnectionMethod.OAuth,
        AZURE_SCOPES.appConfiguration,
        true
      ),
      {
        value: AzureDevOpsConnectionMethod.AccessToken,
        label: methodLabel(AzureDevOpsConnectionMethod.AccessToken),
        credentials: { accessToken: "", orgName: "" },
        fields: [
          { name: "credentials.accessToken", label: "Personal access token", kind: "secret" },
          { name: "credentials.orgName", label: "Organization name", mono: true }
        ]
      },
      {
        value: AzureDevOpsConnectionMethod.ClientSecret,
        label: methodLabel(AzureDevOpsConnectionMethod.ClientSecret),
        credentials: { tenantId: "", orgName: "", clientId: "", clientSecret: "" },
        fields: [
          tenantIdField,
          { name: "credentials.orgName", label: "Organization name", mono: true },
          clientIdField,
          clientSecretField
        ]
      }
    ]
  },
  [AppConnection.AzureADCS]: {
    app: AppConnection.AzureADCS,
    name: APP_CONNECTION_MAP[AppConnection.AzureADCS].name,
    schema: azureAdcsConnectionFormSchema,
    methods: [
      {
        value: AzureADCSConnectionMethod.UsernamePassword,
        label: methodLabel(AzureADCSConnectionMethod.UsernamePassword),
        credentials: {
          adcsUrl: "",
          username: "",
          password: "",
          sslRejectUnauthorized: true,
          sslCertificate: ""
        },
        fields: [
          {
            name: "credentials.adcsUrl",
            label: "ADCS URL",
            mono: true,
            placeholder: "https://adcs.example.com"
          },
          {
            name: "credentials.username",
            label: "Username",
            mono: true,
            placeholder: "DOMAIN\\username or user@domain.com"
          },
          { name: "credentials.password", label: "Password", kind: "secret" },
          {
            name: "credentials.sslCertificate",
            label: "SSL certificate",
            kind: "textarea",
            optional: true,
            placeholder: "-----BEGIN CERTIFICATE-----",
            visible: (values) => String(values.credentials?.adcsUrl ?? "").startsWith("https://")
          },
          {
            name: "credentials.sslRejectUnauthorized",
            label: "Reject unauthorized certificates",
            kind: "switch",
            description: "Turn off only in test environments with self-signed certificates.",
            visible: (values) => String(values.credentials?.adcsUrl ?? "").startsWith("https://")
          }
        ]
      }
    ]
  },
  [AppConnection.ADCS]: {
    app: AppConnection.ADCS,
    name: APP_CONNECTION_MAP[AppConnection.ADCS].name,
    schema: adcsConnectionBaseFormSchema,
    values: { gatewayId: null, gatewayPoolId: null },
    methods: [
      {
        value: AdcsConnectionMethod.UsernamePassword,
        label: methodLabel(AdcsConnectionMethod.UsernamePassword),
        credentials: { host: "", username: "", password: "" },
        fields: [
          {
            name: "credentials.host",
            label: "CA host",
            mono: true,
            placeholder: "ca01.corp.example.com",
            description: "The FQDN, hostname or IP the gateway uses to reach the CA server."
          },
          {
            name: "credentials.username",
            label: "Username",
            mono: true,
            placeholder: "DOMAIN\\username or user@domain.com"
          },
          { name: "credentials.password", label: "Password", kind: "secret" }
        ]
      }
    ]
  },
  [AppConnection.AzureDNS]: {
    app: AppConnection.AzureDNS,
    name: APP_CONNECTION_MAP[AppConnection.AzureDNS].name,
    schema: azureDnsConnectionFormSchema,
    methods: [
      {
        value: AzureDNSConnectionMethod.ClientSecret,
        label: methodLabel(AzureDNSConnectionMethod.ClientSecret),
        credentials: { tenantId: "", clientId: "", clientSecret: "", subscriptionId: "" },
        fields: [
          tenantIdField,
          clientIdField,
          clientSecretField,
          {
            name: "credentials.subscriptionId",
            label: "Subscription ID",
            mono: true,
            placeholder: UUID_PLACEHOLDER
          }
        ]
      }
    ]
  },
  [AppConnection.AzureEntraId]: {
    app: AppConnection.AzureEntraId,
    name: APP_CONNECTION_MAP[AppConnection.AzureEntraId].name,
    schema: azureEntraIdConnectionFormSchema,
    methods: [
      {
        value: AzureEntraIdConnectionMethod.ClientSecret,
        label: methodLabel(AzureEntraIdConnectionMethod.ClientSecret),
        credentials: { tenantId: "", clientId: "", clientSecret: "" },
        fields: [tenantIdField, clientIdField, clientSecretField]
      }
    ]
  },
  [AppConnection.Heroku]: {
    app: AppConnection.Heroku,
    name: APP_CONNECTION_MAP[AppConnection.Heroku].name,
    schema: herokuConnectionFormSchema,
    methods: [
      {
        value: HerokuConnectionMethod.AuthToken,
        label: methodLabel(HerokuConnectionMethod.AuthToken),
        credentials: { authToken: "" },
        fields: [{ name: "credentials.authToken", label: "Auth token", kind: "secret" }]
      },
      {
        value: HerokuConnectionMethod.OAuth,
        label: methodLabel(HerokuConnectionMethod.OAuth),
        credentials: { code: "custom" },
        fields: [],
        redirect: {
          submitLabel: "Connect to Heroku",
          href: ({ option }) => {
            if (typeof option?.oauthClientId !== "string" || !option.oauthClientId)
              return undefined;
            const query = new URLSearchParams({
              client_id: option.oauthClientId,
              response_type: "code",
              scope: "write-protected"
            });
            return `https://id.heroku.com/oauth/authorize?${query}`;
          },
          unconfigured: "This server has no Heroku OAuth application configured.",
          credentials: ({ callback }) => ({ code: callback.code ?? "" })
        }
      }
    ]
  },
  [AppConnection.Stripe]: {
    app: AppConnection.Stripe,
    name: APP_CONNECTION_MAP[AppConnection.Stripe].name,
    schema: stripeConnectionFormSchema,
    methods: [
      {
        value: StripeConnectionMethod.OAuth,
        label: methodLabel(StripeConnectionMethod.OAuth),
        credentials: { code: "custom" },
        fields: [],
        redirect: {
          submitLabel: "Connect to Stripe",
          href: ({ option }) => {
            if (
              typeof option?.oauthClientId !== "string" ||
              !option.oauthClientId ||
              typeof option.oauthAuthorizeUrl !== "string" ||
              !option.oauthAuthorizeUrl
            )
              return undefined;
            const url = new URL(option.oauthAuthorizeUrl);
            url.searchParams.set("client_id", option.oauthClientId);
            url.searchParams.set(
              "redirect_uri",
              `${window.location.origin}/organization/app-connections/stripe/oauth/callback`
            );
            return url.toString();
          },
          unconfigured: "This server has no Stripe application configured.",
          credentials: ({ callback }) => ({ code: callback.code ?? "" })
        }
      }
    ]
  },
  [AppConnection.OCI]: {
    app: AppConnection.OCI,
    name: APP_CONNECTION_MAP[AppConnection.OCI].name,
    schema: ociConnectionFormSchema,
    methods: [
      {
        value: OCIConnectionMethod.AccessKey,
        label: methodLabel(OCIConnectionMethod.AccessKey),
        credentials: { userOcid: "", tenancyOcid: "", region: "", fingerprint: "", privateKey: "" },
        fields: [
          {
            name: "credentials.userOcid",
            label: "User OCID",
            mono: true,
            placeholder: "ocid1.user.oc1..aaaa"
          },
          {
            name: "credentials.tenancyOcid",
            label: "Tenancy OCID",
            mono: true,
            placeholder: "ocid1.tenancy.oc1..aaaa"
          },
          { name: "credentials.region", label: "Region", mono: true, placeholder: "us-ashburn-1" },
          {
            name: "credentials.fingerprint",
            label: "Fingerprint",
            mono: true,
            placeholder: "00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00",
            description: "The fingerprint of the public key on your OCI API key."
          },
          {
            name: "credentials.privateKey",
            label: "Private key",
            kind: "secret",
            placeholder: "-----BEGIN PRIVATE KEY-----"
          }
        ]
      }
    ]
  },
  [AppConnection.S3Compatible]: {
    app: AppConnection.S3Compatible,
    name: APP_CONNECTION_MAP[AppConnection.S3Compatible].name,
    schema: s3CompatibleConnectionFormSchema,
    methods: [
      {
        value: S3CompatibleConnectionMethod.AccessKey,
        label: methodLabel(S3CompatibleConnectionMethod.AccessKey),
        credentials: { endpoint: "", accessKeyId: "", secretAccessKey: "" },
        fields: [
          {
            name: "credentials.endpoint",
            label: "Endpoint",
            mono: true,
            placeholder: "https://s3.us-east-1.amazonaws.com",
            description:
              "The S3 API endpoint without the bucket name: AWS S3, Cloudflare R2, Google Cloud Storage or OCI Object Storage."
          },
          { name: "credentials.accessKeyId", label: "Access key ID", mono: true },
          { name: "credentials.secretAccessKey", label: "Secret access key", kind: "secret" }
        ]
      }
    ]
  },
  [AppConnection.DigitalOcean]: {
    app: AppConnection.DigitalOcean,
    name: APP_CONNECTION_MAP[AppConnection.DigitalOcean].name,
    schema: digitalOceanConnectionFormSchema,
    methods: [
      {
        value: DigitalOceanConnectionMethod.ApiToken,
        label: methodLabel(DigitalOceanConnectionMethod.ApiToken),
        credentials: { apiToken: "" },
        fields: [{ name: "credentials.apiToken", label: "API token", kind: "secret" }]
      }
    ]
  },
  [AppConnection.Cloudflare]: {
    app: AppConnection.Cloudflare,
    name: APP_CONNECTION_MAP[AppConnection.Cloudflare].name,
    schema: cloudflareConnectionFormSchema,
    methods: [
      {
        value: CloudflareConnectionMethod.ApiToken,
        label: methodLabel(CloudflareConnectionMethod.ApiToken),
        credentials: { accountId: "", apiToken: "" },
        fields: [
          { name: "credentials.accountId", label: "Account ID", mono: true },
          { name: "credentials.apiToken", label: "API token", kind: "secret" }
        ]
      }
    ]
  },
  [AppConnection.OVH]: {
    app: AppConnection.OVH,
    name: APP_CONNECTION_MAP[AppConnection.OVH].name,
    schema: ovhConnectionFormSchema,
    methods: [
      {
        value: OVHConnectionMethod.Certificate,
        label: methodLabel(OVHConnectionMethod.Certificate),
        credentials: { privateKey: "", certificate: "", okmsDomain: "", okmsId: "" },
        fields: [
          {
            name: "credentials.privateKey",
            label: "Private key",
            kind: "secret",
            placeholder: "-----BEGIN PRIVATE KEY-----"
          },
          {
            name: "credentials.certificate",
            label: "Certificate",
            kind: "textarea",
            placeholder: "-----BEGIN CERTIFICATE-----"
          },
          ...okmsFields
        ]
      },
      {
        value: OVHConnectionMethod.Token,
        label: methodLabel(OVHConnectionMethod.Token),
        credentials: { token: "", okmsDomain: "", okmsId: "" },
        fields: [{ name: "credentials.token", label: "Token", kind: "secret" }, ...okmsFields]
      }
    ]
  },
  [AppConnection.Salesforce]: {
    app: AppConnection.Salesforce,
    name: APP_CONNECTION_MAP[AppConnection.Salesforce].name,
    schema: salesforceConnectionFormSchema,
    methods: [
      {
        value: SalesforceConnectionMethod.ClientCredentials,
        label: methodLabel(SalesforceConnectionMethod.ClientCredentials),
        credentials: { instanceUrl: "", consumerKey: "", consumerSecret: "" },
        fields: [
          {
            name: "credentials.instanceUrl",
            label: "Instance URL",
            mono: true,
            placeholder: "my-org.my.salesforce.com",
            description: "Your Salesforce My Domain URL."
          },
          { name: "credentials.consumerKey", label: "Consumer key", mono: true },
          { name: "credentials.consumerSecret", label: "Consumer secret", kind: "secret" }
        ]
      }
    ]
  }
};
