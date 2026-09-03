import { BadRequestError } from "@app/lib/errors";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { TAwsConnection } from "@app/services/app-connection/aws/aws-connection-types";
import { TAzureDnsConnection } from "@app/services/app-connection/azure-dns/azure-dns-connection-types";
import { TCloudflareConnection } from "@app/services/app-connection/cloudflare/cloudflare-connection-types";
import { TDNSMadeEasyConnection } from "@app/services/app-connection/dns-made-easy/dns-made-easy-connection-types";

import { azureDnsDeleteTxtRecord, azureDnsInsertTxtRecord } from "./azure-dns";
import { CaDnsProvider } from "./ca-dns-provider-enums";
import { cloudflareDeleteTxtRecord, cloudflareInsertTxtRecord } from "./cloudflare";
import { dnsMadeEasyDeleteTxtRecord, dnsMadeEasyInsertTxtRecord } from "./dns-made-easy";
import { route53DeleteRecord, route53UpsertRecord } from "./route53";

export type TDnsProviderConnection =
  | TAwsConnection
  | TCloudflareConnection
  | TDNSMadeEasyConnection
  | TAzureDnsConnection;

export const CA_DNS_PROVIDER_APP_CONNECTION: Record<CaDnsProvider, AppConnection> = {
  [CaDnsProvider.Route53]: AppConnection.AWS,
  [CaDnsProvider.Cloudflare]: AppConnection.Cloudflare,
  [CaDnsProvider.DNSMadeEasy]: AppConnection.DNSMadeEasy,
  [CaDnsProvider.AzureDNS]: AppConnection.AzureDNS
};

export const assertDnsProviderMatchesAppConnection = (
  provider: CaDnsProvider,
  appConnectionApp: AppConnection,
  dnsAppConnectionId: string
): void => {
  const expectedApp = CA_DNS_PROVIDER_APP_CONNECTION[provider];
  if (appConnectionApp !== expectedApp) {
    throw new BadRequestError({
      message: `App connection with ID '${dnsAppConnectionId}' is not a ${expectedApp} connection`
    });
  }
};

export const upsertDnsProviderTxtRecord = async (
  provider: CaDnsProvider,
  connection: TDnsProviderConnection,
  hostedZoneId: string,
  recordName: string,
  value: string,
  comment?: string
): Promise<void> => {
  switch (provider) {
    case CaDnsProvider.Route53: {
      await route53UpsertRecord(connection as TAwsConnection, hostedZoneId, {
        name: recordName,
        type: "TXT",
        value,
        ttl: 30,
        comment
      });
      return;
    }
    case CaDnsProvider.Cloudflare: {
      await cloudflareInsertTxtRecord(connection as TCloudflareConnection, hostedZoneId, recordName, value);
      return;
    }
    case CaDnsProvider.DNSMadeEasy: {
      await dnsMadeEasyInsertTxtRecord(connection as TDNSMadeEasyConnection, hostedZoneId, recordName, value);
      return;
    }
    case CaDnsProvider.AzureDNS: {
      await azureDnsInsertTxtRecord(connection as TAzureDnsConnection, hostedZoneId, recordName, value);
      return;
    }
    default:
      throw new Error(`Unsupported DNS provider: ${provider as string}`);
  }
};

export const deleteDnsProviderTxtRecord = async (
  provider: CaDnsProvider,
  connection: TDnsProviderConnection,
  hostedZoneId: string,
  recordName: string,
  value: string,
  comment?: string
): Promise<void> => {
  switch (provider) {
    case CaDnsProvider.Route53: {
      await route53DeleteRecord(connection as TAwsConnection, hostedZoneId, {
        name: recordName,
        type: "TXT",
        value,
        ttl: 30,
        comment
      });
      return;
    }
    case CaDnsProvider.Cloudflare: {
      await cloudflareDeleteTxtRecord(connection as TCloudflareConnection, hostedZoneId, recordName, value);
      return;
    }
    case CaDnsProvider.DNSMadeEasy: {
      await dnsMadeEasyDeleteTxtRecord(connection as TDNSMadeEasyConnection, hostedZoneId, recordName, value);
      return;
    }
    case CaDnsProvider.AzureDNS: {
      await azureDnsDeleteTxtRecord(connection as TAzureDnsConnection, hostedZoneId, recordName, value);
      return;
    }
    default:
      throw new Error(`Unsupported DNS provider: ${provider as string}`);
  }
};
