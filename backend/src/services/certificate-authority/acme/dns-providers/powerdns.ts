import { TKeyStoreFactory } from "@app/keystore/keystore";
import { logger } from "@app/lib/logger";
import {
  getPowerDnsZoneRrset,
  patchPowerDnsZoneRrsets,
  POWERDNS_REQUEST_TIMEOUT_MS,
  TPowerDnsGatewayDeps
} from "@app/services/app-connection/powerdns/powerdns-connection-fns";
import {
  TPowerDnsConnection,
  TPowerDnsConnectionConfig
} from "@app/services/app-connection/powerdns/powerdns-connection-types";

import { withDnsRecordLock } from "./dns-record-lock";

const ACME_CHALLENGE_TTL_SECONDS = 60;
const RRSET_LOCK_TTL_MS = POWERDNS_REQUEST_TIMEOUT_MS * 2 + 30_000;

export type TPowerDnsProviderDeps = TPowerDnsGatewayDeps & {
  keyStore: Pick<TKeyStoreFactory, "acquireLock">;
};

const toFqdn = (name: string) => (name.endsWith(".") ? name : `${name}.`);

const toConnectionConfig = (connection: TPowerDnsConnection) => connection as unknown as TPowerDnsConnectionConfig;

export const powerDnsInsertTxtRecord = async (
  connection: TPowerDnsConnection,
  hostedZoneId: string,
  domain: string,
  value: string,
  deps: TPowerDnsProviderDeps
) => {
  const { keyStore, ...gatewayDeps } = deps;
  const config = toConnectionConfig(connection);
  const name = toFqdn(domain);
  const zoneId = toFqdn(hostedZoneId);

  logger.info({ zoneId, name }, `Inserting TXT record for PowerDNS [zoneId=${zoneId}] [name=${name}]`);

  await withDnsRecordLock(
    { providerName: "PowerDNS", connectionId: connection.id, zoneId, name, lockTtlMs: RRSET_LOCK_TTL_MS },
    keyStore,
    async () => {
      const existing = await getPowerDnsZoneRrset(config, { zoneId, name, type: "TXT" }, gatewayDeps);
      const existingRecords = existing?.records ?? [];

      if (existingRecords.some((record) => record.content === value)) return;

      await patchPowerDnsZoneRrsets(
        config,
        {
          zoneId,
          rrsets: [
            {
              name,
              type: "TXT",
              ttl: ACME_CHALLENGE_TTL_SECONDS,
              changetype: "REPLACE",
              records: [...existingRecords, { content: value, disabled: false }]
            }
          ]
        },
        gatewayDeps
      );
    }
  );
};

export const powerDnsDeleteTxtRecord = async (
  connection: TPowerDnsConnection,
  hostedZoneId: string,
  domain: string,
  value: string,
  deps: TPowerDnsProviderDeps
) => {
  const { keyStore, ...gatewayDeps } = deps;
  const config = toConnectionConfig(connection);
  const name = toFqdn(domain);
  const zoneId = toFqdn(hostedZoneId);

  logger.info({ zoneId, name }, `Deleting TXT record for PowerDNS [zoneId=${zoneId}] [name=${name}]`);

  await withDnsRecordLock(
    { providerName: "PowerDNS", connectionId: connection.id, zoneId, name, lockTtlMs: RRSET_LOCK_TTL_MS },
    keyStore,
    async () => {
      const existing = await getPowerDnsZoneRrset(config, { zoneId, name, type: "TXT" }, gatewayDeps);
      const existingRecords = existing?.records ?? [];
      const remainingRecords = existingRecords.filter((record) => record.content !== value);

      if (remainingRecords.length === existingRecords.length) {
        logger.warn({ zoneId, name }, `PowerDNS TXT record to delete not found [zoneId=${zoneId}] [name=${name}]`);
        return;
      }

      await patchPowerDnsZoneRrsets(
        config,
        {
          zoneId,
          rrsets: remainingRecords.length
            ? [
                {
                  name,
                  type: "TXT",
                  ttl: existing?.ttl ?? ACME_CHALLENGE_TTL_SECONDS,
                  changetype: "REPLACE",
                  records: remainingRecords
                }
              ]
            : [{ name, type: "TXT", changetype: "DELETE" }]
        },
        gatewayDeps
      );
    }
  );
};
