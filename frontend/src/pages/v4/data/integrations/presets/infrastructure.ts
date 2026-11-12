import type {
  AppConnectionFieldPreset,
  AppConnectionPreset
} from "@app/components/v4/patterns/app-connection-form";
import { APP_CONNECTION_MAP } from "@app/helpers/appConnections";
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
  VENAFI_REGION_LABELS,
  VenafiConnectionMethod,
  VenafiRegion
} from "@app/hooks/api/appConnections/types/venafi-connection";
import { VenafiTppConnectionMethod } from "@app/hooks/api/appConnections/types/venafi-tpp-connection";
import { ZabbixConnectionMethod } from "@app/hooks/api/appConnections/types/zabbix-connection";
import {
  auth0ConnectionFormSchema,
  digiCertConnectionFormSchema,
  dnsMadeEasyConnectionFormSchema,
  dopplerConnectionFormSchema,
  externalInfisicalConnectionFormSchema,
  f5BigIpConnectionFormSchema,
  goDaddyConnectionFormSchema,
  hpeIloRedFishConnectionFormSchema,
  impervaConnectionFormSchema,
  kempLoadMasterConnectionFormSchema,
  netScalerConnectionFormSchema,
  nutanixPrismCentralConnectionFormSchema,
  oktaConnectionFormSchema,
  onePassConnectionFormSchema,
  paloAltoNetworksConnectionFormSchema,
  portainerConnectionFormSchema,
  ultraDnsConnectionFormSchema,
  venafiConnectionFormSchema,
  venafiTppConnectionFormSchema,
  zabbixConnectionFormSchema
} from "@app/lib/schemas/app-connections";

import { methodLabel } from "./shared";

const gatewayValues = { gatewayId: null, gatewayPoolId: null };

const sslFields: AppConnectionFieldPreset[] = [
  {
    name: "credentials.sslCertificate",
    label: "CA certificate",
    kind: "textarea",
    optional: true,
    placeholder: "-----BEGIN CERTIFICATE-----"
  },
  {
    name: "credentials.sslRejectUnauthorized",
    label: "Reject unauthorized certificates",
    kind: "switch",
    description: "Turn off for self-signed certificates, or provide a CA certificate."
  }
];

const portField: AppConnectionFieldPreset = {
  name: "credentials.port",
  label: "Port",
  kind: "number",
  optional: true
};

export const INFRASTRUCTURE_PRESETS: Partial<Record<AppConnection, AppConnectionPreset>> = {
  [AppConnection.F5BigIp]: {
    app: AppConnection.F5BigIp,
    name: APP_CONNECTION_MAP[AppConnection.F5BigIp].name,
    schema: f5BigIpConnectionFormSchema,
    values: gatewayValues,
    methods: [
      {
        value: F5BigIpConnectionMethod.BasicAuth,
        label: methodLabel(F5BigIpConnectionMethod.BasicAuth),
        credentials: {
          hostname: "",
          port: "",
          username: "",
          password: "",
          sslRejectUnauthorized: true,
          sslCertificate: ""
        },
        fields: [
          {
            name: "credentials.hostname",
            label: "Hostname",
            mono: true,
            placeholder: "bigip.example.com"
          },
          { ...portField, placeholder: "443" },
          { name: "credentials.username", label: "Username", mono: true },
          { name: "credentials.password", label: "Password", kind: "secret" },
          ...sslFields
        ]
      }
    ]
  },
  [AppConnection.NetScaler]: {
    app: AppConnection.NetScaler,
    name: APP_CONNECTION_MAP[AppConnection.NetScaler].name,
    schema: netScalerConnectionFormSchema,
    values: gatewayValues,
    methods: [
      {
        value: NetScalerConnectionMethod.BasicAuth,
        label: methodLabel(NetScalerConnectionMethod.BasicAuth),
        credentials: {
          hostname: "",
          port: "",
          username: "",
          password: "",
          sslRejectUnauthorized: false,
          sslCertificate: ""
        },
        fields: [
          {
            name: "credentials.hostname",
            label: "Hostname",
            mono: true,
            placeholder: "ns.example.com"
          },
          { ...portField, placeholder: "443" },
          { name: "credentials.username", label: "Username", mono: true },
          { name: "credentials.password", label: "Password", kind: "secret" },
          ...sslFields
        ]
      }
    ]
  },
  [AppConnection.PaloAltoNetworks]: {
    app: AppConnection.PaloAltoNetworks,
    name: APP_CONNECTION_MAP[AppConnection.PaloAltoNetworks].name,
    schema: paloAltoNetworksConnectionFormSchema,
    values: gatewayValues,
    methods: [
      {
        value: PaloAltoNetworksConnectionMethod.BasicAuth,
        label: methodLabel(PaloAltoNetworksConnectionMethod.BasicAuth),
        credentials: {
          hostname: "",
          username: "",
          password: "",
          sslRejectUnauthorized: true,
          sslCertificate: ""
        },
        fields: [
          {
            name: "credentials.hostname",
            label: "Hostname",
            mono: true,
            placeholder: "firewall.example.com"
          },
          { ...portField, placeholder: "443" },
          { name: "credentials.username", label: "Username", mono: true },
          { name: "credentials.password", label: "Password", kind: "secret" },
          ...sslFields
        ]
      }
    ]
  },
  [AppConnection.KempLoadMaster]: {
    app: AppConnection.KempLoadMaster,
    name: APP_CONNECTION_MAP[AppConnection.KempLoadMaster].name,
    schema: kempLoadMasterConnectionFormSchema,
    values: gatewayValues,
    methods: [
      {
        value: KempLoadMasterConnectionMethod.BasicAuth,
        label: methodLabel(KempLoadMasterConnectionMethod.BasicAuth),
        credentials: {
          hostname: "",
          port: "",
          username: "",
          password: "",
          sslRejectUnauthorized: true,
          sslCertificate: ""
        },
        fields: [
          {
            name: "credentials.hostname",
            label: "Hostname",
            mono: true,
            placeholder: "lm.example.com"
          },
          { ...portField, placeholder: "8443" },
          { name: "credentials.username", label: "Username", mono: true },
          { name: "credentials.password", label: "Password", kind: "secret" },
          ...sslFields
        ]
      }
    ]
  },
  [AppConnection.Imperva]: {
    app: AppConnection.Imperva,
    name: APP_CONNECTION_MAP[AppConnection.Imperva].name,
    schema: impervaConnectionFormSchema,
    values: gatewayValues,
    methods: [
      {
        value: ImpervaConnectionMethod.ApiKey,
        label: methodLabel(ImpervaConnectionMethod.ApiKey),
        credentials: { apiId: "", apiKey: "", accountId: "" },
        fields: [
          {
            name: "credentials.apiId",
            label: "API ID",
            mono: true,
            description:
              "Found in the Imperva Cloud Security Console under Account Management > User Management > My Profile."
          },
          {
            name: "credentials.apiKey",
            label: "API key",
            kind: "secret",
            description:
              "Imperva creates keys disabled, so switch the key on after creating it. Its role also needs the Manage SSL Certificates permission."
          },
          {
            name: "credentials.accountId",
            label: "Account ID",
            mono: true,
            optional: true,
            description:
              "Set this to manage websites that belong to a sub-account. Defaults to the account the API key belongs to."
          }
        ]
      }
    ]
  },
  [AppConnection.HpeIloRedFish]: {
    app: AppConnection.HpeIloRedFish,
    name: APP_CONNECTION_MAP[AppConnection.HpeIloRedFish].name,
    schema: hpeIloRedFishConnectionFormSchema,
    values: gatewayValues,
    methods: [
      {
        value: HpeIloConnectionMethod.BasicAuth,
        label: methodLabel(HpeIloConnectionMethod.BasicAuth),
        credentials: {
          hostname: "",
          port: "",
          username: "",
          password: "",
          sslRejectUnauthorized: true,
          sslCertificate: ""
        },
        fields: [
          {
            name: "credentials.hostname",
            label: "Hostname",
            mono: true,
            placeholder: "ilo.example.com"
          },
          { ...portField, placeholder: "443" },
          { name: "credentials.username", label: "Username", mono: true },
          { name: "credentials.password", label: "Password", kind: "secret" },
          ...sslFields
        ]
      }
    ]
  },
  [AppConnection.NutanixPrismCentral]: {
    app: AppConnection.NutanixPrismCentral,
    name: APP_CONNECTION_MAP[AppConnection.NutanixPrismCentral].name,
    schema: nutanixPrismCentralConnectionFormSchema,
    values: gatewayValues,
    methods: [
      {
        value: NutanixPrismCentralConnectionMethod.BasicAuth,
        label: methodLabel(NutanixPrismCentralConnectionMethod.BasicAuth),
        credentials: {
          hostname: "",
          port: "",
          username: "",
          password: "",
          sslRejectUnauthorized: true,
          sslCertificate: ""
        },
        fields: [
          {
            name: "credentials.hostname",
            label: "Hostname",
            mono: true,
            placeholder: "prism.example.com"
          },
          { ...portField, placeholder: "9440" },
          { name: "credentials.username", label: "Username", mono: true },
          { name: "credentials.password", label: "Password", kind: "secret" },
          ...sslFields
        ]
      },
      {
        value: NutanixPrismCentralConnectionMethod.ApiKey,
        label: methodLabel(NutanixPrismCentralConnectionMethod.ApiKey),
        credentials: {
          hostname: "",
          port: "",
          apiKey: "",
          sslRejectUnauthorized: true,
          sslCertificate: ""
        },
        fields: [
          {
            name: "credentials.hostname",
            label: "Hostname",
            mono: true,
            placeholder: "prism.example.com"
          },
          { ...portField, placeholder: "9440" },
          {
            name: "credentials.apiKey",
            label: "API key",
            kind: "secret",
            description: "A 32-character lowercase hexadecimal string."
          },
          ...sslFields
        ]
      }
    ]
  },
  [AppConnection.Portainer]: {
    app: AppConnection.Portainer,
    name: APP_CONNECTION_MAP[AppConnection.Portainer].name,
    schema: portainerConnectionFormSchema,
    values: gatewayValues,
    methods: [
      {
        value: PortainerConnectionMethod.ApiToken,
        label: methodLabel(PortainerConnectionMethod.ApiToken),
        credentials: { instanceUrl: "", apiToken: "" },
        fields: [
          {
            name: "credentials.instanceUrl",
            label: "Instance URL",
            mono: true,
            placeholder: "https://portainer.example.com"
          },
          { name: "credentials.apiToken", label: "API token", kind: "secret" }
        ]
      }
    ]
  },
  [AppConnection.VenafiTpp]: {
    app: AppConnection.VenafiTpp,
    name: APP_CONNECTION_MAP[AppConnection.VenafiTpp].name,
    schema: venafiTppConnectionFormSchema,
    values: gatewayValues,
    methods: [
      {
        value: VenafiTppConnectionMethod.OAuth,
        label: methodLabel(VenafiTppConnectionMethod.OAuth),
        credentials: { tppUrl: "", clientId: "", username: "", password: "" },
        fields: [
          {
            name: "credentials.tppUrl",
            label: "TPP URL",
            mono: true,
            placeholder: "https://tpp.example.com"
          },
          {
            name: "credentials.clientId",
            label: "Client ID",
            mono: true,
            description: "The OAuth client ID registered in the Venafi TPP API integration."
          },
          { name: "credentials.username", label: "Username", mono: true },
          { name: "credentials.password", label: "Password", kind: "secret" }
        ]
      }
    ]
  },
  [AppConnection.Venafi]: {
    app: AppConnection.Venafi,
    name: APP_CONNECTION_MAP[AppConnection.Venafi].name,
    schema: venafiConnectionFormSchema,
    methods: [
      {
        value: VenafiConnectionMethod.ApiKey,
        label: methodLabel(VenafiConnectionMethod.ApiKey),
        credentials: { region: VenafiRegion.US, apiKey: "" },
        fields: [
          {
            name: "credentials.region",
            label: "Region",
            kind: "select",
            options: Object.values(VenafiRegion).map((region) => ({
              value: region,
              label: VENAFI_REGION_LABELS[region]
            }))
          },
          { name: "credentials.apiKey", label: "API key", kind: "secret" }
        ]
      }
    ]
  },
  [AppConnection.DigiCert]: {
    app: AppConnection.DigiCert,
    name: APP_CONNECTION_MAP[AppConnection.DigiCert].name,
    schema: digiCertConnectionFormSchema,
    methods: [
      {
        value: DigiCertConnectionMethod.ApiKey,
        label: methodLabel(DigiCertConnectionMethod.ApiKey),
        credentials: { region: DigiCertRegion.US, apiKey: "" },
        fields: [
          {
            name: "credentials.region",
            label: "Region",
            kind: "select",
            description:
              "The CertCentral tenant your API key was issued in. US and EU keys do not work across regions.",
            options: [
              { value: DigiCertRegion.US, label: "US" },
              { value: DigiCertRegion.EU, label: "EU" }
            ]
          },
          {
            name: "credentials.apiKey",
            label: "CertCentral API key",
            kind: "secret",
            description: "Generate one in CertCentral under Automation > API Keys."
          }
        ]
      }
    ]
  },
  [AppConnection.DNSMadeEasy]: {
    app: AppConnection.DNSMadeEasy,
    name: APP_CONNECTION_MAP[AppConnection.DNSMadeEasy].name,
    schema: dnsMadeEasyConnectionFormSchema,
    methods: [
      {
        value: DNSMadeEasyConnectionMethod.APIKeySecret,
        label: methodLabel(DNSMadeEasyConnectionMethod.APIKeySecret),
        credentials: { apiKey: "", secretKey: "" },
        fields: [
          {
            name: "credentials.apiKey",
            label: "API key",
            mono: true,
            placeholder: "af1b628f-3272-46aa-9cde-837d0c59155d"
          },
          { name: "credentials.secretKey", label: "Secret key", kind: "secret" }
        ]
      }
    ]
  },
  [AppConnection.UltraDNS]: {
    app: AppConnection.UltraDNS,
    name: APP_CONNECTION_MAP[AppConnection.UltraDNS].name,
    schema: ultraDnsConnectionFormSchema,
    methods: [
      {
        value: UltraDNSConnectionMethod.UsernamePassword,
        label: methodLabel(UltraDNSConnectionMethod.UsernamePassword),
        credentials: {
          username: "",
          password: "",
          environment: UltraDNSEnvironment.Production
        },
        fields: [
          { name: "credentials.username", label: "Username", mono: true },
          { name: "credentials.password", label: "Password", kind: "secret" },
          {
            name: "credentials.environment",
            label: "Environment",
            kind: "select",
            options: [
              { value: UltraDNSEnvironment.Production, label: "Production" },
              { value: UltraDNSEnvironment.Test, label: "Test" }
            ]
          }
        ]
      }
    ]
  },
  [AppConnection.GoDaddy]: {
    app: AppConnection.GoDaddy,
    name: APP_CONNECTION_MAP[AppConnection.GoDaddy].name,
    schema: goDaddyConnectionFormSchema,
    methods: [
      {
        value: GoDaddyConnectionMethod.ApiKey,
        label: methodLabel(GoDaddyConnectionMethod.ApiKey),
        credentials: { apiKey: "", apiSecret: "" },
        fields: [
          {
            name: "credentials.apiKey",
            label: "API key",
            mono: true,
            description: "Generate a key and secret at developer.godaddy.com under Keys."
          },
          { name: "credentials.apiSecret", label: "API secret", kind: "secret" }
        ]
      }
    ]
  },
  [AppConnection.Zabbix]: {
    app: AppConnection.Zabbix,
    name: APP_CONNECTION_MAP[AppConnection.Zabbix].name,
    schema: zabbixConnectionFormSchema,
    methods: [
      {
        value: ZabbixConnectionMethod.ApiToken,
        label: methodLabel(ZabbixConnectionMethod.ApiToken),
        credentials: { apiToken: "", instanceUrl: "" },
        fields: [
          { name: "credentials.apiToken", label: "API token", kind: "secret" },
          {
            name: "credentials.instanceUrl",
            label: "Instance URL",
            mono: true,
            placeholder: "https://zabbix.example.com"
          }
        ]
      }
    ]
  },
  [AppConnection.Okta]: {
    app: AppConnection.Okta,
    name: APP_CONNECTION_MAP[AppConnection.Okta].name,
    schema: oktaConnectionFormSchema,
    methods: [
      {
        value: OktaConnectionMethod.ApiToken,
        label: methodLabel(OktaConnectionMethod.ApiToken),
        credentials: { instanceUrl: "", apiToken: "" },
        fields: [
          {
            name: "credentials.instanceUrl",
            label: "Instance URL",
            mono: true,
            placeholder: "https://example.okta.com"
          },
          { name: "credentials.apiToken", label: "API token", kind: "secret" }
        ]
      }
    ]
  },
  [AppConnection.Auth0]: {
    app: AppConnection.Auth0,
    name: APP_CONNECTION_MAP[AppConnection.Auth0].name,
    schema: auth0ConnectionFormSchema,
    methods: [
      {
        value: Auth0ConnectionMethod.ClientCredentials,
        label: methodLabel(Auth0ConnectionMethod.ClientCredentials),
        credentials: { domain: "", clientId: "", clientSecret: "", audience: "" },
        fields: [
          {
            name: "credentials.domain",
            label: "Domain",
            mono: true,
            placeholder: "tenant.us.auth0.com"
          },
          { name: "credentials.clientId", label: "Client ID", mono: true },
          { name: "credentials.clientSecret", label: "Client secret", kind: "secret" },
          {
            name: "credentials.audience",
            label: "Audience",
            mono: true,
            description: "The identifier of your Auth0 API, as a URL."
          }
        ]
      }
    ]
  },
  [AppConnection.ExternalInfisical]: {
    app: AppConnection.ExternalInfisical,
    name: APP_CONNECTION_MAP[AppConnection.ExternalInfisical].name,
    schema: externalInfisicalConnectionFormSchema,
    methods: [
      {
        value: ExternalInfisicalConnectionMethod.MachineIdentityUniversalAuth,
        label: methodLabel(ExternalInfisicalConnectionMethod.MachineIdentityUniversalAuth),
        credentials: {
          instanceUrl: "",
          machineIdentityClientId: "",
          machineIdentityClientSecret: ""
        },
        fields: [
          {
            name: "credentials.instanceUrl",
            label: "Instance URL",
            mono: true,
            placeholder: "https://app.infisical.com"
          },
          {
            name: "credentials.machineIdentityClientId",
            label: "Machine identity client ID",
            mono: true
          },
          {
            name: "credentials.machineIdentityClientSecret",
            label: "Machine identity client secret",
            kind: "secret"
          }
        ]
      }
    ]
  },
  [AppConnection.Doppler]: {
    app: AppConnection.Doppler,
    name: APP_CONNECTION_MAP[AppConnection.Doppler].name,
    schema: dopplerConnectionFormSchema,
    methods: [
      {
        value: DopplerConnectionMethod.ApiToken,
        label: methodLabel(DopplerConnectionMethod.ApiToken),
        credentials: { apiToken: "" },
        fields: [{ name: "credentials.apiToken", label: "API token", kind: "secret" }]
      }
    ]
  },
  [AppConnection.OnePass]: {
    app: AppConnection.OnePass,
    name: APP_CONNECTION_MAP[AppConnection.OnePass].name,
    schema: onePassConnectionFormSchema,
    methods: [
      {
        value: OnePassConnectionMethod.ApiToken,
        label: methodLabel(OnePassConnectionMethod.ApiToken),
        credentials: { instanceUrl: "", apiToken: "" },
        fields: [
          {
            name: "credentials.instanceUrl",
            label: "Connect server URL",
            mono: true,
            placeholder: "https://1pass.example.com"
          },
          { name: "credentials.apiToken", label: "API token", kind: "secret" }
        ]
      }
    ]
  }
};
