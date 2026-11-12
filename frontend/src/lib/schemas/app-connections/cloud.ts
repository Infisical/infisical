import { z } from "zod";

import { getS3CompatibleProviderName } from "@app/helpers/appConnections";
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

import { genericAppConnectionFieldsSchema } from "./base";

export const gcpConnectionFormSchema = z.discriminatedUnion("method", [
  genericAppConnectionFieldsSchema.extend({
    app: z.literal(AppConnection.GCP),
    method: z.literal(GcpConnectionMethod.ServiceAccountImpersonation),
    credentials: z.object({
      serviceAccountEmail: z.string().email().trim().min(1, "Service account email required")
    })
  })
]);

const azureKeyVaultBaseSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.AzureKeyVault),
  method: z.nativeEnum(AzureKeyVaultConnectionMethod)
});

export const azureKeyVaultConnectionFormSchema = z.discriminatedUnion("method", [
  azureKeyVaultBaseSchema.extend({
    tenantId: z.string().trim().min(1, "Tenant ID is required"),
    method: z.literal(AzureKeyVaultConnectionMethod.OAuth)
  }),
  azureKeyVaultBaseSchema.extend({
    method: z.literal(AzureKeyVaultConnectionMethod.ClientSecret),
    credentials: z.object({
      clientSecret: z.string().trim().min(1, "Client Secret is required"),
      clientId: z.string().trim().min(1, "Client ID is required"),
      tenantId: z.string().trim().min(1, "Tenant ID is required"),
      clientSecretKeyId: z.string().trim().optional()
    })
  }),
  azureKeyVaultBaseSchema.extend({
    method: z.literal(AzureKeyVaultConnectionMethod.Certificate),
    credentials: z.object({
      clientId: z.string().trim().min(1, "Client ID is required"),
      certificateBody: z.string().trim().min(1, "Certificate is required"),
      privateKey: z.string().trim().min(1, "Private Key is required"),
      tenantId: z.string().trim().min(1, "Tenant ID is required")
    })
  }),
  azureKeyVaultBaseSchema.extend({
    method: z.literal(AzureKeyVaultConnectionMethod.ManagedIdentity),
    credentials: z.object({
      clientId: z.string().trim().min(1, "Client ID is required"),
      tenantId: z.string().trim().min(1, "Tenant ID is required")
    })
  })
]);

const azureAppConfigurationBaseSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.AzureAppConfiguration),
  method: z.nativeEnum(AzureAppConfigurationConnectionMethod)
});

export const azureAppConfigurationConnectionFormSchema = z.discriminatedUnion("method", [
  azureAppConfigurationBaseSchema.extend({
    tenantId: z.string().trim().min(1, "Tenant ID is required"),
    method: z.literal(AzureAppConfigurationConnectionMethod.OAuth)
  }),
  azureAppConfigurationBaseSchema.extend({
    method: z.literal(AzureAppConfigurationConnectionMethod.ClientSecret),
    credentials: z.object({
      clientSecret: z.string().trim().min(1, "Client Secret is required"),
      clientId: z.string().trim().min(1, "Client ID is required"),
      tenantId: z.string().trim().min(1, "Tenant ID is required"),
      clientSecretKeyId: z.string().trim().optional()
    })
  })
]);

const azureClientSecretsBaseSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.AzureClientSecrets),
  method: z.nativeEnum(AzureClientSecretsConnectionMethod)
});

export const azureClientSecretsConnectionFormSchema = z.discriminatedUnion("method", [
  azureClientSecretsBaseSchema.extend({
    tenantId: z.string().trim().min(1, "Tenant ID is required"),
    method: z.literal(AzureClientSecretsConnectionMethod.OAuth)
  }),
  azureClientSecretsBaseSchema.extend({
    method: z.literal(AzureClientSecretsConnectionMethod.ClientSecret),
    credentials: z.object({
      clientSecret: z.string().trim().min(1, "Client Secret is required"),
      clientId: z.string().trim().min(1, "Client ID is required"),
      tenantId: z.string().trim().min(1, "Tenant ID is required"),
      clientSecretKeyId: z.string().trim().optional()
    })
  }),
  azureClientSecretsBaseSchema.extend({
    method: z.literal(AzureClientSecretsConnectionMethod.Certificate),
    credentials: z.object({
      clientId: z.string().trim().min(1, "Client ID is required"),
      certificateBody: z.string().trim().min(1, "Certificate is required"),
      privateKey: z.string().trim().min(1, "Private Key is required"),
      tenantId: z.string().trim().min(1, "Tenant ID is required")
    })
  })
]);

export const microsoftIntuneConnectionFormSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.MicrosoftIntune),
  method: z.literal(MicrosoftIntuneConnectionMethod.ClientSecret),
  credentials: z.object({
    tenantId: z.string().trim().min(1, "Tenant ID is required"),
    clientId: z.string().trim().min(1, "Client ID is required"),
    clientSecret: z.string().trim().min(1, "Client Secret is required")
  })
});

const azureDevOpsBaseSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.AzureDevOps),
  method: z.nativeEnum(AzureDevOpsConnectionMethod)
});

export const azureDevOpsConnectionFormSchema = z.discriminatedUnion("method", [
  azureDevOpsBaseSchema.extend({
    method: z.literal(AzureDevOpsConnectionMethod.OAuth),
    tenantId: z.string().trim().min(1, "Tenant ID is required"),
    orgName: z.string().trim().min(1, "Organization name is required")
  }),
  azureDevOpsBaseSchema.extend({
    method: z.literal(AzureDevOpsConnectionMethod.AccessToken),
    credentials: z.object({
      accessToken: z.string().trim().min(1, "Access Token is required"),
      orgName: z.string().trim().min(1, "Organization name is required")
    })
  }),
  azureDevOpsBaseSchema.extend({
    method: z.literal(AzureDevOpsConnectionMethod.ClientSecret),
    credentials: z.object({
      clientSecret: z.string().trim().min(1, "Client Secret is required"),
      tenantId: z.string().trim().min(1, "Tenant ID is required"),
      clientId: z.string().trim().min(1, "Client ID is required"),
      orgName: z.string().trim().min(1, "Organization name is required"),
      clientSecretKeyId: z.string().trim().optional()
    })
  })
]);

export const azureAdcsConnectionFormSchema = z.discriminatedUnion("method", [
  genericAppConnectionFieldsSchema.extend({
    app: z.literal(AppConnection.AzureADCS),
    method: z.literal(AzureADCSConnectionMethod.UsernamePassword),
    credentials: z.object({
      adcsUrl: z
        .string()
        .trim()
        .min(1, "ADCS URL required")
        .refine((value) => value.startsWith("https://"), "ADCS URL must use HTTPS"),
      username: z.string().trim().min(1, "Username required"),
      password: z.string().trim().min(1, "Password required"),
      sslRejectUnauthorized: z.boolean().optional(),
      sslCertificate: z
        .string()
        .trim()
        .transform((value) => value || undefined)
        .optional()
    })
  })
]);

export const adcsConnectionFormSchema = z
  .discriminatedUnion("method", [
    genericAppConnectionFieldsSchema.extend({
      app: z.literal(AppConnection.ADCS),
      method: z.literal(AdcsConnectionMethod.UsernamePassword),
      credentials: z.object({
        host: z.string().trim().min(1, "CA Host required"),
        username: z.string().trim().min(1, "Username required"),
        password: z.string().trim().min(1, "Password required")
      })
    })
  ])
  .superRefine((data, ctx) => {
    if (!data.gatewayId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Gateway required",
        path: ["gatewayId"]
      });
    }
  });

export const azureDnsConnectionFormSchema = z.discriminatedUnion("method", [
  genericAppConnectionFieldsSchema.extend({
    app: z.literal(AppConnection.AzureDNS),
    method: z.literal(AzureDNSConnectionMethod.ClientSecret),
    credentials: z.object({
      tenantId: z.string().trim().min(1, "Tenant ID required"),
      clientId: z.string().trim().min(1, "Client ID required"),
      clientSecret: z.string().trim().min(1, "Client Secret required"),
      subscriptionId: z.string().trim().min(1, "Subscription ID required"),
      clientSecretKeyId: z.string().trim().optional()
    })
  })
]);

export const azureEntraIdConnectionFormSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.AzureEntraId),
  method: z.literal(AzureEntraIdConnectionMethod.ClientSecret),
  credentials: z.object({
    tenantId: z.string().trim().min(1, "Tenant ID is required"),
    clientId: z.string().trim().min(1, "Client ID is required"),
    clientSecret: z.string().trim().min(1, "Client Secret is required"),
    clientSecretKeyId: z.string().trim().optional()
  })
});

export const herokuConnectionFormSchema = z.discriminatedUnion("method", [
  genericAppConnectionFieldsSchema.extend({
    app: z.literal(AppConnection.Heroku),
    method: z.literal(HerokuConnectionMethod.AuthToken),
    credentials: z.object({
      authToken: z.string().min(1, "Auth token is required")
    })
  }),
  genericAppConnectionFieldsSchema.extend({
    app: z.literal(AppConnection.Heroku),
    method: z.literal(HerokuConnectionMethod.OAuth),
    credentials: z.object({
      code: z.string().min(1, "Code is required")
    })
  })
]);

export const stripeConnectionFormSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.Stripe),
  method: z.literal(StripeConnectionMethod.OAuth),
  credentials: z.object({
    code: z.string().min(1, "Code is required")
  })
});

export const ociConnectionFormSchema = z.discriminatedUnion("method", [
  genericAppConnectionFieldsSchema.extend({
    app: z.literal(AppConnection.OCI),
    method: z.literal(OCIConnectionMethod.AccessKey),
    credentials: z.object({
      userOcid: z
        .string()
        .trim()
        .min(1, "User OCID required")
        .regex(/^ocid1\.user\.oc1\.\..+$/, "Invalid User OCID format"),
      tenancyOcid: z
        .string()
        .trim()
        .min(1, "Tenancy OCID required")
        .regex(/^ocid1\.tenancy\.oc1\.\..+$/, "Invalid Tenancy OCID format"),
      region: z.string().trim().min(1, "Region required"),
      fingerprint: z.string().trim().min(1, "Fingerprint required"),
      privateKey: z.string().trim().min(1, "Private Key required")
    })
  })
]);

export const buildS3CompatibleConnectionFormSchema = (allowedStorageHostnames: string[]) =>
  z.discriminatedUnion("method", [
    genericAppConnectionFieldsSchema.extend({
      app: z.literal(AppConnection.S3Compatible),
      method: z.literal(S3CompatibleConnectionMethod.AccessKey),
      credentials: z.object({
        endpoint: z
          .string()
          .trim()
          .min(1, "Endpoint required")
          .refine(
            (endpoint) => Boolean(getS3CompatibleProviderName(endpoint, allowedStorageHostnames)),
            "Enter the S3 API endpoint of a supported provider, without the bucket name"
          ),
        accessKeyId: z.string().trim().min(1, "Access Key ID required"),
        secretAccessKey: z.string().trim().min(1, "Secret Access Key required"),
        region: z
          .string()
          .trim()
          .max(64, "Region cannot exceed 64 characters")
          .regex(
            /^[a-zA-Z0-9_-]*$/,
            "Region can only contain letters, numbers, hyphens and underscores"
          )
          .optional()
          .transform((region) => region || undefined)
      })
    })
  ]);

export const s3CompatibleConnectionFormSchema = buildS3CompatibleConnectionFormSchema([]);

export const digitalOceanConnectionFormSchema = z.discriminatedUnion("method", [
  genericAppConnectionFieldsSchema.extend({
    app: z.literal(AppConnection.DigitalOcean),
    method: z.literal(DigitalOceanConnectionMethod.ApiToken),
    credentials: z.object({
      apiToken: z.string().trim().min(1, "API Token required")
    })
  })
]);

export const cloudflareConnectionFormSchema = z.discriminatedUnion("method", [
  genericAppConnectionFieldsSchema.extend({
    app: z.literal(AppConnection.Cloudflare),
    method: z.literal(CloudflareConnectionMethod.ApiToken),
    credentials: z.object({
      apiToken: z.string().trim().min(1, "API Token required"),
      accountId: z.string().trim().min(1, "Account ID required")
    })
  })
]);

const ovhPemPrivateKey = z
  .string()
  .trim()
  .min(1, "Private key required")
  .refine((val) => val.startsWith("-----BEGIN "), {
    message: "Private key must be in PEM format (starts with -----BEGIN ...-----)"
  });

const ovhPemCertificate = z
  .string()
  .trim()
  .min(1, "Certificate required")
  .refine((val) => val.startsWith("-----BEGIN CERTIFICATE-----"), {
    message: "Certificate must be in PEM format (starts with -----BEGIN CERTIFICATE-----)"
  });

const ovhOkmsDomain = z
  .string()
  .trim()
  .min(1, "KMS rest API endpoint required")
  .url("KMS rest API endpoint must be a valid URL (e.g. https://eu-west-rbx.okms.ovh.net)")
  .refine((val) => val.startsWith("https://"), {
    message: "KMS rest API endpoint must use https"
  });

const ovhOkmsId = z.string().trim().min(1, "KMS ID required");

export const ovhConnectionFormSchema = z.discriminatedUnion("method", [
  genericAppConnectionFieldsSchema.extend({
    app: z.literal(AppConnection.OVH),
    method: z.literal(OVHConnectionMethod.Certificate),
    credentials: z.object({
      privateKey: ovhPemPrivateKey,
      certificate: ovhPemCertificate,
      okmsDomain: ovhOkmsDomain,
      okmsId: ovhOkmsId
    })
  }),
  genericAppConnectionFieldsSchema.extend({
    app: z.literal(AppConnection.OVH),
    method: z.literal(OVHConnectionMethod.Token),
    credentials: z.object({
      token: z.string().trim().min(1, "Token required"),
      okmsDomain: ovhOkmsDomain,
      okmsId: ovhOkmsId
    })
  })
]);

export const salesforceConnectionFormSchema = z.discriminatedUnion("method", [
  genericAppConnectionFieldsSchema.extend({
    app: z.literal(AppConnection.Salesforce),
    method: z.literal(SalesforceConnectionMethod.ClientCredentials),
    credentials: z.object({
      instanceUrl: z.string().trim().min(1, "Instance URL required"),
      consumerKey: z.string().trim().min(1, "Consumer Key required"),
      consumerSecret: z.string().trim().min(1, "Consumer Secret required")
    })
  })
]);
