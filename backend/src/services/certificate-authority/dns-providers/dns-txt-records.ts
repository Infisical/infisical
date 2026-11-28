import RE2 from "re2";

import { TInstanceConfigService } from "@app/domains/platform/instance-config-core/ce/module";
import { TKeyStoreFactory } from "@app/keystore/keystore";
import { isValidDnsName } from "@app/lib/dns-update";
import { TAppConnection } from "@app/services/app-connection/app-connection-types";
import { TAwsConnection } from "@app/services/app-connection/aws/aws-connection-types";
import { listAzureDnsZones } from "@app/services/app-connection/azure-dns/azure-dns-connection-fns";
import { TAzureDnsConnection } from "@app/services/app-connection/azure-dns/azure-dns-connection-types";
import {
  getCloudflareErrorMessage,
  listCloudflareZones,
  paginateCloudflare
} from "@app/services/app-connection/cloudflare/cloudflare-connection-fns";
import { TCloudflareConnection } from "@app/services/app-connection/cloudflare/cloudflare-connection-types";
import {
  listDNSMadeEasyRecords,
  listDNSMadeEasyZones
} from "@app/services/app-connection/dns-made-easy/dns-made-easy-connection-fns";
import { TDNSMadeEasyConnection } from "@app/services/app-connection/dns-made-easy/dns-made-easy-connection-types";
import { getGcpCloudDnsZones } from "@app/services/app-connection/gcp/gcp-connection-fns";
import { TGcpConnection, TGcpConnectionAuthDeps } from "@app/services/app-connection/gcp/gcp-connection-types";
import { listPowerDnsZones, TPowerDnsGatewayDeps } from "@app/services/app-connection/powerdns/powerdns-connection-fns";
import {
  TPowerDnsConnection,
  TPowerDnsConnectionConfig
} from "@app/services/app-connection/powerdns/powerdns-connection-types";
import { TRfc2136Connection } from "@app/services/app-connection/rfc2136/rfc2136-connection-types";
import { listUltraDNSZones } from "@app/services/app-connection/ultradns/ultradns-connection-fns";
import { TUltraDNSConnection } from "@app/services/app-connection/ultradns/ultradns-connection-types";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";

import { AcmeDnsProvider } from "../acme/acme-certificate-authority-enums";
import { azureDnsAppendTxtRecord } from "../acme/dns-providers/azure-dns";
import { cloudflareInsertTxtRecord } from "../acme/dns-providers/cloudflare";
import { dnsMadeEasyInsertTxtRecord } from "../acme/dns-providers/dns-made-easy";
import { gcpCloudDnsInsertTxtRecord, validateGcpCloudDnsZone } from "../acme/dns-providers/gcp-cloud-dns";
import { powerDnsInsertTxtRecord } from "../acme/dns-providers/powerdns";
import { rfc2136InsertTxtRecord } from "../acme/dns-providers/rfc2136";
import { ultraDNSInsertTxtRecord } from "../acme/dns-providers/ultradns";
import { route53AppendTxtRecord, route53GetHostedZone } from "./route53";

const TXT_RECORD_TTL_SECONDS = 60;
const TRAILING_DOT_REGEX = new RE2("\\.$");

export type TDnsZoneLookupDeps = TGcpConnectionAuthDeps &
  TPowerDnsGatewayDeps & { instanceConfigService: TInstanceConfigService };

export type TDnsTxtRecordProviderDeps = TDnsZoneLookupDeps & { keyStore: Pick<TKeyStoreFactory, "acquireLock"> };

type TDnsTxtRecordWriteDeps = TDnsTxtRecordProviderDeps & { abortSignal?: AbortSignal };

type TDnsZone = { id: string; name: string };

type TDnsTxtRecord = { zoneId: string; zoneName: string; fqdn: string; value: string };

type TDnsTxtRecordProvider = {
  getZone: (connection: TAppConnection, zoneId: string, deps: TDnsZoneLookupDeps) => Promise<TDnsZone | undefined>;
  upsertTxtRecord: (connection: TAppConnection, record: TDnsTxtRecord, deps: TDnsTxtRecordWriteDeps) => Promise<void>;
};

const toZoneName = (name: string) => name.replace(TRAILING_DOT_REGEX, "").toLowerCase();

const unquote = (value: string) => value.replaceAll('"', "");

const toRelativeName = ({ fqdn, zoneName }: TDnsTxtRecord) => fqdn.slice(0, -(zoneName.length + 1));

const findZone = (zones: TDnsZone[], zoneId: string) => {
  const zone = zones.find(({ id }) => id.toLowerCase() === zoneId.toLowerCase());
  return zone ? { id: zone.id, name: toZoneName(zone.name) } : undefined;
};

export const DNS_TXT_RECORD_PROVIDERS: Record<AcmeDnsProvider, TDnsTxtRecordProvider> = {
  [AcmeDnsProvider.Route53]: {
    getZone: async (connection, zoneId, { instanceConfigService }) => {
      const { HostedZone } = await route53GetHostedZone(connection as TAwsConnection, zoneId, instanceConfigService);
      if (HostedZone?.Config?.PrivateZone) throw new Error("it's a private hosted zone. Link a public hosted zone.");
      if (!HostedZone?.Id || !HostedZone.Name) return undefined;
      return { id: HostedZone.Id.replace("/hostedzone/", ""), name: toZoneName(HostedZone.Name) };
    },
    upsertTxtRecord: (connection, { zoneId, fqdn, value }, { instanceConfigService, abortSignal }) =>
      route53AppendTxtRecord(
        connection as TAwsConnection,
        zoneId,
        { name: fqdn, value, ttl: TXT_RECORD_TTL_SECONDS },
        instanceConfigService,
        abortSignal
      )
  },
  [AcmeDnsProvider.Cloudflare]: {
    getZone: async (connection, zoneId) =>
      findZone(await listCloudflareZones(connection as TCloudflareConnection), zoneId),
    upsertTxtRecord: async (connection, { zoneId, fqdn, value }) => {
      const cloudflareConnection = connection as TCloudflareConnection;
      try {
        const existingRecords = await paginateCloudflare<{ content: string }>(
          `${IntegrationUrls.CLOUDFLARE_API_URL}/client/v4/zones/${encodeURIComponent(zoneId)}/dns_records`,
          { apiToken: cloudflareConnection.credentials.apiToken, params: { type: "TXT", name: fqdn } }
        );
        if (existingRecords.some(({ content }) => unquote(content) === unquote(value))) return;

        await cloudflareInsertTxtRecord(cloudflareConnection, zoneId, fqdn, value);
      } catch (error) {
        throw new Error(getCloudflareErrorMessage(error));
      }
    }
  },
  [AcmeDnsProvider.DNSMadeEasy]: {
    getZone: async (connection, zoneId) =>
      findZone(await listDNSMadeEasyZones(connection as TDNSMadeEasyConnection), zoneId),
    upsertTxtRecord: async (connection, record) => {
      const dnsMadeEasyConnection = connection as TDNSMadeEasyConnection;
      const name = toRelativeName(record);
      const existingRecords = await listDNSMadeEasyRecords(dnsMadeEasyConnection, {
        zoneId: record.zoneId,
        type: "TXT",
        name
      });
      if (existingRecords.some(({ value }) => unquote(value) === unquote(record.value))) return;

      await dnsMadeEasyInsertTxtRecord(dnsMadeEasyConnection, record.zoneId, name, record.value);
    }
  },
  [AcmeDnsProvider.AzureDNS]: {
    getZone: async (connection, zoneId, { oidcIssuerService }) =>
      findZone(await listAzureDnsZones(connection as TAzureDnsConnection, oidcIssuerService), zoneId),
    upsertTxtRecord: (connection, record, { oidcIssuerService, abortSignal }) =>
      azureDnsAppendTxtRecord(
        connection as TAzureDnsConnection,
        record.zoneId,
        toRelativeName(record),
        record.value,
        oidcIssuerService,
        abortSignal
      )
  },
  [AcmeDnsProvider.PowerDns]: {
    getZone: async (connection, zoneId, { gatewayV2Service, gatewayPoolService }) =>
      findZone(
        await listPowerDnsZones(connection as unknown as TPowerDnsConnectionConfig, {
          gatewayV2Service,
          gatewayPoolService
        }),
        zoneId
      ),
    upsertTxtRecord: (connection, { zoneId, fqdn, value }, { gatewayV2Service, gatewayPoolService, keyStore }) =>
      powerDnsInsertTxtRecord(connection as TPowerDnsConnection, zoneId, fqdn, value, {
        gatewayV2Service,
        gatewayPoolService,
        keyStore
      })
  },
  [AcmeDnsProvider.GcpCloudDns]: {
    getZone: async (connection, zoneId, deps) => {
      validateGcpCloudDnsZone(zoneId);
      const [, gcpProjectId] = zoneId.split("/");
      const zones = await getGcpCloudDnsZones(gcpProjectId, connection as TGcpConnection, deps);
      const zone = zones.find(({ id }) => id === zoneId);
      return zone ? { id: zone.id, name: toZoneName(zone.dnsName) } : undefined;
    },
    upsertTxtRecord: (connection, { zoneId, fqdn, value }, deps) =>
      gcpCloudDnsInsertTxtRecord(
        connection as TGcpConnection,
        deps,
        zoneId,
        fqdn,
        value,
        deps.keyStore,
        deps.abortSignal
      )
  },
  [AcmeDnsProvider.Rfc2136]: {
    getZone: async (_connection, zoneId) => {
      const trimmedZone = zoneId.trim();
      if (!trimmedZone || !isValidDnsName(trimmedZone) || toZoneName(trimmedZone).split(".").length < 2) {
        throw new Error("enter a valid zone name with at least two labels, such as example.com.");
      }
      const zoneName = toZoneName(zoneId.trim());
      return { id: zoneName, name: zoneName };
    },
    upsertTxtRecord: (connection, { zoneId, fqdn, value }, { gatewayV2Service, gatewayPoolService, abortSignal }) =>
      rfc2136InsertTxtRecord(connection as TRfc2136Connection, zoneId, fqdn, value, {
        gatewayV2Service,
        gatewayPoolService,
        abortSignal
      })
  },
  [AcmeDnsProvider.UltraDNS]: {
    getZone: async (connection, zoneId) => findZone(await listUltraDNSZones(connection as TUltraDNSConnection), zoneId),
    upsertTxtRecord: (connection, { zoneId, fqdn, value }, { keyStore }) =>
      ultraDNSInsertTxtRecord(connection as TUltraDNSConnection, zoneId, fqdn, value, { keyStore })
  }
};
