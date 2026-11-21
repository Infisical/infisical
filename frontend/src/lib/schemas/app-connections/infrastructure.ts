import { z } from "zod";

import { isIPv4, isIPv6 } from "@app/helpers/ip";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { OnePassConnectionMethod } from "@app/hooks/api/appConnections/types/1password-connection";
import { Auth0ConnectionMethod } from "@app/hooks/api/appConnections/types/auth0-connection";
import {
  DigiCertConnectionMethod,
  DigiCertRegion
} from "@app/hooks/api/appConnections/types/digicert-connection";
import { DNSMadeEasyConnectionMethod } from "@app/hooks/api/appConnections/types/dns-made-easy-connection";
import { DopplerConnectionMethod } from "@app/hooks/api/appConnections/types/doppler-connection";
import { ExternalInfisicalConnectionMethod } from "@app/hooks/api/appConnections/types/external-infisical-connection";
import { F5BigIpConnectionMethod } from "@app/hooks/api/appConnections/types/f5-big-ip-connection";
import { GoDaddyConnectionMethod } from "@app/hooks/api/appConnections/types/godaddy-connection";
import { HpeIloConnectionMethod } from "@app/hooks/api/appConnections/types/hpe-ilo-connection";
import { ImpervaConnectionMethod } from "@app/hooks/api/appConnections/types/imperva-connection";
import { KempLoadMasterConnectionMethod } from "@app/hooks/api/appConnections/types/kemp-loadmaster-connection";
import { NetScalerConnectionMethod } from "@app/hooks/api/appConnections/types/netscaler-connection";
import { NutanixPrismCentralConnectionMethod } from "@app/hooks/api/appConnections/types/nutanix-prism-central-connection";
import { OktaConnectionMethod } from "@app/hooks/api/appConnections/types/okta-connection";
import { PaloAltoNetworksConnectionMethod } from "@app/hooks/api/appConnections/types/palo-alto-networks-connection";
import { PortainerConnectionMethod } from "@app/hooks/api/appConnections/types/portainer-connection";
import {
  UltraDNSConnectionMethod,
  UltraDNSEnvironment
} from "@app/hooks/api/appConnections/types/ultradns-connection";
import {
  VenafiConnectionMethod,
  VenafiRegion
} from "@app/hooks/api/appConnections/types/venafi-connection";
import { VenafiTppConnectionMethod } from "@app/hooks/api/appConnections/types/venafi-tpp-connection";
import { ZabbixConnectionMethod } from "@app/hooks/api/appConnections/types/zabbix-connection";

import { genericAppConnectionFieldsSchema } from "./base";

const f5BigIpRootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.F5BigIp)
});

export const f5BigIpConnectionFormSchema = z.discriminatedUnion("method", [
  f5BigIpRootSchema.extend({
    method: z.literal(F5BigIpConnectionMethod.BasicAuth),
    credentials: z.object({
      hostname: z
        .string()
        .trim()
        .min(1, "Hostname is required")
        .max(512, "Hostname cannot exceed 512 characters"),
      port: z
        .union([z.coerce.number().int().min(1).max(65535), z.literal("")])
        .optional()
        .transform((val) => (val === "" ? undefined : val)),
      username: z
        .string()
        .trim()
        .min(1, "Username is required")
        .max(256, "Username cannot exceed 256 characters"),
      password: z
        .string()
        .trim()
        .min(1, "Password is required")
        .max(512, "Password cannot exceed 512 characters"),
      sslRejectUnauthorized: z.boolean(),
      sslCertificate: z
        .string()
        .trim()
        .transform((value) => value || undefined)
        .optional()
    })
  })
]);

const netScalerRootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.NetScaler)
});

export const netScalerConnectionFormSchema = z.discriminatedUnion("method", [
  netScalerRootSchema.extend({
    method: z.literal(NetScalerConnectionMethod.BasicAuth),
    credentials: z.object({
      hostname: z
        .string()
        .trim()
        .min(1, "Hostname is required")
        .max(512, "Hostname cannot exceed 512 characters"),
      port: z
        .union([z.coerce.number().int().min(1).max(65535), z.literal("")])
        .optional()
        .transform((val) => (val === "" ? undefined : val)),
      username: z
        .string()
        .trim()
        .min(1, "Username is required")
        .max(256, "Username cannot exceed 256 characters"),
      password: z
        .string()
        .trim()
        .min(1, "Password is required")
        .max(512, "Password cannot exceed 512 characters"),
      sslRejectUnauthorized: z.boolean(),
      sslCertificate: z
        .string()
        .trim()
        .transform((value) => value || undefined)
        .optional()
    })
  })
]);

const paloAltoNetworksRootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.PaloAltoNetworks)
});

export const paloAltoNetworksConnectionFormSchema = z.discriminatedUnion("method", [
  paloAltoNetworksRootSchema.extend({
    method: z.literal(PaloAltoNetworksConnectionMethod.BasicAuth),
    credentials: z.object({
      hostname: z
        .string()
        .trim()
        .min(1, "Hostname is required")
        .max(512, "Hostname cannot exceed 512 characters")
        .refine((val) => !val.includes("/") && !val.includes("@") && !val.includes("?"), {
          message: "Hostname must not contain /, @, or ? characters"
        }),
      port: z.coerce.number().int().min(1).max(65535).optional(),
      username: z
        .string()
        .trim()
        .min(1, "Username is required")
        .max(256, "Username cannot exceed 256 characters"),
      password: z
        .string()
        .min(1, "Password is required")
        .max(512, "Password cannot exceed 512 characters"),
      sslRejectUnauthorized: z.boolean(),
      sslCertificate: z
        .string()
        .trim()
        .transform((value) => value || undefined)
        .optional()
    })
  })
]);

const kempLoadMasterRootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.KempLoadMaster)
});

export const kempLoadMasterConnectionFormSchema = z.discriminatedUnion("method", [
  kempLoadMasterRootSchema.extend({
    method: z.literal(KempLoadMasterConnectionMethod.BasicAuth),
    credentials: z.object({
      hostname: z
        .string()
        .trim()
        .min(1, "Hostname is required")
        .max(512, "Hostname cannot exceed 512 characters"),
      port: z
        .union([z.coerce.number().int().min(1).max(65535), z.literal("")])
        .optional()
        .transform((val) => (val === "" ? undefined : val)),
      username: z
        .string()
        .trim()
        .min(1, "Username is required")
        .max(256, "Username cannot exceed 256 characters"),
      password: z
        .string()
        .trim()
        .min(1, "Password is required")
        .max(512, "Password cannot exceed 512 characters"),
      sslRejectUnauthorized: z.boolean(),
      sslCertificate: z
        .string()
        .trim()
        .transform((value) => value || undefined)
        .optional()
    })
  })
]);

const impervaRootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.Imperva)
});

export const impervaConnectionFormSchema = z.discriminatedUnion("method", [
  impervaRootSchema.extend({
    method: z.literal(ImpervaConnectionMethod.ApiKey),
    credentials: z.object({
      apiId: z
        .string()
        .trim()
        .min(1, "API ID is required")
        .max(256, "API ID cannot exceed 256 characters")
        .regex(/^[\x21-\x7e]+$/, "API ID cannot contain spaces or line breaks"),
      apiKey: z
        .string()
        .trim()
        .min(1, "API key is required")
        .max(512, "API key cannot exceed 512 characters")
        .regex(/^[\x21-\x7e]+$/, "API key cannot contain spaces or line breaks"),
      accountId: z
        .string()
        .trim()
        .max(32, "Account ID cannot exceed 32 characters")
        .regex(/^[0-9]*$/, "Account ID must be numeric")
        .optional()
        .transform((value) => value || undefined)
    })
  })
]);

const isValidHostname = (value: string) =>
  value.length <= 253 &&
  /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/.test(
    value
  );

const hpeIloRedFishRootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.HpeIloRedFish)
});

export const hpeIloRedFishConnectionFormSchema = z.discriminatedUnion("method", [
  hpeIloRedFishRootSchema.extend({
    method: z.literal(HpeIloConnectionMethod.BasicAuth),
    credentials: z.object({
      hostname: z
        .string()
        .trim()
        .min(1, "Hostname is required")
        .max(512, "Hostname cannot exceed 512 characters")
        .refine(
          (val) => isValidHostname(val) || isIPv4(val) || (isIPv6(val) && !val.includes("%")),
          {
            message: "Enter a hostname or IP address without a scheme, port, brackets, or path"
          }
        ),
      port: z
        .union([z.coerce.number().int().min(1).max(65535), z.literal("")])
        .optional()
        .transform((val) => (val === "" ? undefined : val)),
      username: z
        .string()
        .trim()
        .min(1, "Username is required")
        .max(256, "Username cannot exceed 256 characters"),
      password: z
        .string()
        .min(1, "Password is required")
        .max(512, "Password cannot exceed 512 characters"),
      sslRejectUnauthorized: z.boolean(),
      sslCertificate: z
        .string()
        .trim()
        .transform((value) => value || undefined)
        .optional()
    })
  })
]);

const nutanixPrismCentralRootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.NutanixPrismCentral)
});

const nutanixPrismCentralCredentialsBase = z.object({
  hostname: z
    .string()
    .trim()
    .min(1, "Hostname is required")
    .max(512, "Hostname cannot exceed 512 characters")
    .refine(
      (val) =>
        !val.includes("/") &&
        !val.includes("@") &&
        !val.includes("?") &&
        !val.includes(":") &&
        !val.includes("#"),
      { message: "Hostname must not contain /, @, ?, :, or # characters" }
    ),
  port: z
    .union([z.coerce.number().int().min(1).max(65535), z.literal("")])
    .optional()
    .transform((val) => (val === "" ? undefined : val)),
  sslRejectUnauthorized: z.boolean(),
  sslCertificate: z
    .string()
    .trim()
    .transform((value) => value || undefined)
    .optional()
});

export const nutanixPrismCentralConnectionFormSchema = z.discriminatedUnion("method", [
  nutanixPrismCentralRootSchema.extend({
    method: z.literal(NutanixPrismCentralConnectionMethod.ApiKey),
    credentials: nutanixPrismCentralCredentialsBase.extend({
      apiKey: z
        .string()
        .trim()
        .regex(/^[0-9a-f]{32}$/, "API key must be a 32-character lowercase hexadecimal string")
    })
  }),
  nutanixPrismCentralRootSchema.extend({
    method: z.literal(NutanixPrismCentralConnectionMethod.BasicAuth),
    credentials: nutanixPrismCentralCredentialsBase.extend({
      username: z
        .string()
        .trim()
        .min(1, "Username is required")
        .max(256, "Username cannot exceed 256 characters"),
      password: z
        .string()
        .trim()
        .min(1, "Password is required")
        .max(512, "Password cannot exceed 512 characters")
    })
  })
]);

const portainerRootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.Portainer)
});

export const portainerConnectionFormSchema = z.discriminatedUnion("method", [
  portainerRootSchema.extend({
    method: z.literal(PortainerConnectionMethod.ApiToken),
    credentials: z.object({
      instanceUrl: z
        .string()
        .trim()
        .url("Invalid Instance URL")
        .min(1, "Instance URL required")
        .max(255),
      apiToken: z.string().trim().min(1, "API Token required").max(255)
    })
  })
]);

const venafiTppRootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.VenafiTpp)
});

export const venafiTppConnectionFormSchema = z.discriminatedUnion("method", [
  venafiTppRootSchema.extend({
    method: z.literal(VenafiTppConnectionMethod.OAuth),
    credentials: z.object({
      tppUrl: z
        .string()
        .trim()
        .min(1, "TPP URL required")
        .refine((value) => value.startsWith("https://"), "TPP URL must use HTTPS"),
      clientId: z.string().trim().min(1, "Client ID required"),
      username: z.string().trim().min(1, "Username required"),
      password: z.string().trim().min(1, "Password required")
    })
  })
]);

const venafiRootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.Venafi)
});

export const venafiConnectionFormSchema = z.discriminatedUnion("method", [
  venafiRootSchema.extend({
    method: z.literal(VenafiConnectionMethod.ApiKey),
    credentials: z.object({
      apiKey: z.string().trim().min(1, "API Key required"),
      region: z.nativeEnum(VenafiRegion)
    })
  })
]);

const digiCertRootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.DigiCert)
});

export const digiCertConnectionFormSchema = z.discriminatedUnion("method", [
  digiCertRootSchema.extend({
    method: z.literal(DigiCertConnectionMethod.ApiKey),
    credentials: z.object({
      apiKey: z.string().trim().min(1, "API Key required"),
      region: z.nativeEnum(DigiCertRegion)
    })
  })
]);

const dnsMadeEasyRootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.DNSMadeEasy)
});

export const dnsMadeEasyConnectionFormSchema = z.discriminatedUnion("method", [
  dnsMadeEasyRootSchema.extend({
    method: z.literal(DNSMadeEasyConnectionMethod.APIKeySecret),
    credentials: z.object({
      apiKey: z.string().trim().min(1, "API Key required"),
      secretKey: z.string().trim().min(1, "Secret Key required")
    })
  })
]);

const ultraDnsRootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.UltraDNS)
});

export const ultraDnsConnectionFormSchema = z.discriminatedUnion("method", [
  ultraDnsRootSchema.extend({
    method: z.literal(UltraDNSConnectionMethod.UsernamePassword),
    credentials: z.object({
      username: z.string().trim().min(1, "Username required"),
      password: z.string().trim().min(1, "Password required"),
      environment: z.nativeEnum(UltraDNSEnvironment)
    })
  })
]);

const goDaddyRootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.GoDaddy)
});

export const goDaddyConnectionFormSchema = z.discriminatedUnion("method", [
  goDaddyRootSchema.extend({
    method: z.literal(GoDaddyConnectionMethod.ApiKey),
    credentials: z.object({
      apiKey: z.string().trim().min(1, "API Key required"),
      apiSecret: z.string().trim().min(1, "API Secret required")
    })
  })
]);

const zabbixRootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.Zabbix)
});

export const zabbixConnectionFormSchema = z.discriminatedUnion("method", [
  zabbixRootSchema.extend({
    method: z.literal(ZabbixConnectionMethod.ApiToken),
    credentials: z.object({
      apiToken: z.string().trim().min(1, "API Token required"),
      instanceUrl: z.string().trim().url("Invalid instance URL")
    })
  })
]);

const oktaRootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.Okta)
});

export const oktaConnectionFormSchema = z.discriminatedUnion("method", [
  oktaRootSchema.extend({
    method: z.literal(OktaConnectionMethod.ApiToken),
    credentials: z.object({
      instanceUrl: z
        .string()
        .trim()
        .url("Invalid Instance URL")
        .min(1, "Instance URL required")
        .max(255),
      apiToken: z
        .string()
        .trim()
        .min(1, "API Token required")
        .regex(/^00[a-zA-Z0-9_-]{40}$/, "Invalid Okta API Token format")
    })
  })
]);

const auth0RootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.Auth0)
});

export const auth0ConnectionFormSchema = z.discriminatedUnion("method", [
  auth0RootSchema.extend({
    method: z.literal(Auth0ConnectionMethod.ClientCredentials),
    credentials: z.object({
      domain: z.string().trim().min(1, "Domain required"),
      clientId: z.string().trim().min(1, "Client ID required"),
      clientSecret: z.string().trim().min(1, "Client Secret required"),
      audience: z.string().url().trim().min(1, "Audience required")
    })
  })
]);

const externalInfisicalRootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.ExternalInfisical)
});

export const externalInfisicalConnectionFormSchema = z.discriminatedUnion("method", [
  externalInfisicalRootSchema.extend({
    method: z.literal(ExternalInfisicalConnectionMethod.MachineIdentityUniversalAuth),
    credentials: z.object({
      instanceUrl: z.string().trim().url("Must be a valid URL").min(1, "Instance URL is required"),
      machineIdentityClientId: z
        .string()
        .trim()
        .uuid("Must be a valid UUID")
        .min(1, "Client ID is required"),
      machineIdentityClientSecret: z.string().trim().min(1, "Client Secret is required")
    })
  })
]);

const dopplerRootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.Doppler)
});

export const dopplerConnectionFormSchema = z.discriminatedUnion("method", [
  dopplerRootSchema.extend({
    method: z.literal(DopplerConnectionMethod.ApiToken),
    credentials: z.object({
      apiToken: z.string().trim().min(1, "API token required")
    })
  })
]);

const onePassRootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.OnePass)
});

export const onePassConnectionFormSchema = z.discriminatedUnion("method", [
  onePassRootSchema.extend({
    method: z.literal(OnePassConnectionMethod.ApiToken),
    credentials: z.object({
      apiToken: z.string().trim().min(1, "API Token required"),
      instanceUrl: z.string().trim().url("Invalid Connect Server instance URL")
    })
  })
]);
