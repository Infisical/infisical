import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
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

const ACME_CHALLENGE_TTL_SECONDS = 60;
const RRSET_LOCK_TTL_MS = POWERDNS_REQUEST_TIMEOUT_MS * 2 + 30_000;
const RRSET_LOCK_RETRY = { retryCount: 50, retryDelay: 2_000, retryJitter: 300 };

export type TPowerDnsProviderDeps = TPowerDnsGatewayDeps & {
  keyStore?: Pick<TKeyStoreFactory, "acquireLock">;
};

const toFqdn = (name: string) => (name.endsWith(".") ? name : `${name}.`);

const toConnectionConfig = (connection: TPowerDnsConnection) => connection as unknown as TPowerDnsConnectionConfig;

const pendingRrsetOperations = new Map<string, Promise<void>>();

const withLocalRrsetLock = async <T>(key: string, operation: () => Promise<T>): Promise<T> => {
  const pending = pendingRrsetOperations.get(key) ?? Promise.resolve();
  const result = pending.then(operation, operation);
  const settled = result.then(
    () => undefined,
    () => undefined
  );

  pendingRrsetOperations.set(key, settled);
  void settled.then(() => {
    if (pendingRrsetOperations.get(key) === settled) pendingRrsetOperations.delete(key);
  });

  return result;
};

const withRrsetLock = async <T>(
  { connectionId, zoneId, name }: { connectionId: string; zoneId: string; name: string },
  keyStore: Pick<TKeyStoreFactory, "acquireLock"> | undefined,
  operation: () => Promise<T>
): Promise<T> =>
  withLocalRrsetLock(`${connectionId}|${zoneId}|${name}`, async () => {
    if (!keyStore) return operation();

    const lock = await keyStore
      .acquireLock(
        [KeyStorePrefixes.AcmeDnsRecordLock(connectionId, zoneId, name)],
        RRSET_LOCK_TTL_MS,
        RRSET_LOCK_RETRY
      )
      .catch(() => null);

    if (!lock) {
      throw new Error(
        `Timed out waiting to update the PowerDNS record '${name}'. Another certificate order is still using it.`
      );
    }

    try {
      return await operation();
    } finally {
      await lock.release().catch((error) => {
        logger.warn(error, `Failed to release PowerDNS record lock [zoneId=${zoneId}] [name=${name}]`);
      });
    }
  });

export const powerDnsInsertTxtRecord = async (
  connection: TPowerDnsConnection,
  hostedZoneId: string,
  domain: string,
  value: string,
  deps: TPowerDnsProviderDeps = {}
) => {
  const { keyStore, ...gatewayDeps } = deps;
  const config = toConnectionConfig(connection);
  const name = toFqdn(domain);
  const zoneId = toFqdn(hostedZoneId);

  logger.info({ zoneId, name }, `Inserting TXT record for PowerDNS [zoneId=${zoneId}] [name=${name}]`);

  await withRrsetLock({ connectionId: connection.id, zoneId, name }, keyStore, async () => {
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
  });
};

export const powerDnsDeleteTxtRecord = async (
  connection: TPowerDnsConnection,
  hostedZoneId: string,
  domain: string,
  value: string,
  deps: TPowerDnsProviderDeps = {}
) => {
  const { keyStore, ...gatewayDeps } = deps;
  const config = toConnectionConfig(connection);
  const name = toFqdn(domain);
  const zoneId = toFqdn(hostedZoneId);

  logger.info({ zoneId, name }, `Deleting TXT record for PowerDNS [zoneId=${zoneId}] [name=${name}]`);

  await withRrsetLock({ connectionId: connection.id, zoneId, name }, keyStore, async () => {
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
  });
};
