import { TKmsDataKeyService } from "@app/domains/platform/kms-core/ce/module";
import { KeyStorePrefixes } from "@app/keystore/keystore";
import { delay } from "@app/lib/delay";
import { logger } from "@app/lib/logger";
import { decryptAppConnection } from "@app/services/app-connection/app-connection-fns";

import { acquireDnsRecordLock } from "../acme/dns-providers/dns-record-lock";
import { DNS_TXT_RECORD_PROVIDERS, TDnsTxtRecordProviderDeps } from "../dns-providers/dns-txt-records";
import { TDigiCertApiClient } from "./digicert-api-client";
import {
  DIGICERT_EV_PRODUCT_NAME_IDS,
  DigiCertDomainValidationStatus,
  DigiCertDomainValidationType
} from "./digicert-certificate-authority-enums";
import {
  TDigiCertCertificateAuthority,
  TDigiCertDnsZone,
  TDigiCertDomain
} from "./digicert-certificate-authority-types";

const DOMAIN_VALIDATION_DEADLINE_MS = 2 * 60_000;
const DOMAIN_VALIDATION_LOCK_TTL_MS = 10 * 60_000;
const MAX_ZONES_VALIDATED_AT_ONCE = 3;
const DCV_CHECK_MAX_ATTEMPTS = 6;
const DCV_CHECK_INTERVAL_MS = 15_000;
const PERSISTENT_TXT_RECORD_LABEL = "_validation-persist";
const WILDCARD_PREFIX = "*.";

const isNameUnder = (name: string, domain: string) => name === domain || name.endsWith(`.${domain}`);

const HTTP_DCV_METHOD_PREFIX = "http";

const doesValidationCoverName = (domain: TDigiCertDomain, name: string) => {
  const domainName = domain.name.toLowerCase();
  if (name === domainName) return true;
  return !domain.dcv_approval_method?.startsWith(HTTP_DCV_METHOD_PREFIX) && isNameUnder(name, domainName);
};

const isNameCovered = (domains: TDigiCertDomain[], name: string, validationType: DigiCertDomainValidationType) =>
  domains.some(
    (domain) =>
      domain.is_active &&
      doesValidationCoverName(domain, name) &&
      domain.validations?.some(
        (validation) =>
          validation.type === validationType && validation.status === DigiCertDomainValidationStatus.Active
      )
  );

const findMostSpecificZone = (dnsZones: TDigiCertDnsZone[], name: string) =>
  dnsZones
    .filter((zone) => isNameUnder(name, zone.zoneName))
    .reduce<TDigiCertDnsZone | undefined>(
      (best, zone) => (!best || zone.zoneName.length > best.zoneName.length ? zone : best),
      undefined
    );

export const digiCertDomainValidationFactory = (
  deps: TDnsTxtRecordProviderDeps & { kmsDataKeyService: TKmsDataKeyService }
) => {
  const { appConnectionDAL, kmsDataKeyService, keyStore } = deps;

  const $writePersistentTxtRecord = async (zone: TDigiCertDnsZone, privacyUri: string) => {
    const appConnection = await appConnectionDAL.findById(zone.appConnectionId);
    if (!appConnection) {
      throw new Error(`the App Connection with ID '${zone.appConnectionId}' linked to this DNS zone no longer exists`);
    }
    const connection = await decryptAppConnection(appConnection, kmsDataKeyService);

    try {
      await DNS_TXT_RECORD_PROVIDERS[zone.provider].upsertTxtRecord(
        connection,
        {
          zoneId: zone.hostedZoneId,
          zoneName: zone.zoneName,
          fqdn: `${PERSISTENT_TXT_RECORD_LABEL}.${zone.zoneName}`,
          value: `"digicert.com; accounturi=${privacyUri}"`
        },
        deps
      );
    } catch (error) {
      throw new Error(`the DNS provider didn't accept the persistent DNS TXT record: ${(error as Error)?.message}`);
    }
  };

  const $validateZoneApex = async ({
    client,
    zone,
    names,
    organizationId,
    validationType,
    shouldStop
  }: {
    client: TDigiCertApiClient;
    zone: TDigiCertDnsZone;
    names: string[];
    organizationId: number;
    validationType: DigiCertDomainValidationType;
    shouldStop: () => Promise<boolean>;
  }) => {
    const lock = await acquireDnsRecordLock(
      keyStore,
      KeyStorePrefixes.DigiCertDomainValidationLock(organizationId, zone.zoneName),
      DOMAIN_VALIDATION_LOCK_TTL_MS,
      { isCancelled: shouldStop }
    );
    if (!lock) {
      throw new Error("another certificate request is still validating it");
    }

    try {
      const domains = await client.listDomains(organizationId);
      if (names.every((name) => isNameCovered(domains, name, validationType))) return true;

      const existingDomain = domains.find((domain) => domain.name.toLowerCase() === zone.zoneName);
      let domainId: number | undefined;
      let privacyUri: string | undefined;
      if (existingDomain) {
        domainId = existingDomain.id;
        if (!existingDomain.is_active) await client.activateDomain(existingDomain.id);
        if (
          !existingDomain.validations?.some(
            (validation) =>
              validation.type === validationType && validation.status === DigiCertDomainValidationStatus.Active
          )
        ) {
          await client.submitDomainValidation(existingDomain.id, validationType);
        }
        privacyUri = (await client.setDomainDcvMethod(existingDomain.id)).dcv_token?.privacy_uri;
      } else {
        const createdDomain = await client.addDomain({ name: zone.zoneName, organizationId, validationType });
        domainId = createdDomain.id;
        privacyUri = createdDomain.dcv_token?.privacy_uri;
      }

      if (!domainId || !privacyUri) {
        throw new Error("DigiCert didn't return the value for the persistent DNS TXT record");
      }

      await $writePersistentTxtRecord(zone, privacyUri);

      for (let attempt = 1; attempt <= DCV_CHECK_MAX_ATTEMPTS; attempt += 1) {
        if (attempt > 1) {
          // eslint-disable-next-line no-await-in-loop
          if (await shouldStop()) return false;
          // eslint-disable-next-line no-await-in-loop
          await delay(DCV_CHECK_INTERVAL_MS);
          // eslint-disable-next-line no-await-in-loop
          if (await shouldStop()) return false;
        }
        // eslint-disable-next-line no-await-in-loop
        if ((await client.validateDomainDcv(domainId)) === DigiCertDomainValidationStatus.Active) return true;
      }
      return false;
    } finally {
      await lock.release().catch((error: Error) => {
        logger.warn(
          `Failed to release DigiCert domain validation lock [organizationId=${organizationId}] [domain=${zone.zoneName}]: ${error.message}`
        );
      });
    }
  };

  const validateDomainsBeforeOrder = async ({
    digicertCa,
    client,
    dnsNames,
    onProgress,
    isCancelled
  }: {
    digicertCa: TDigiCertCertificateAuthority;
    client: TDigiCertApiClient;
    dnsNames: string[];
    onProgress: (message: string) => Promise<void>;
    isCancelled: () => Promise<boolean>;
  }): Promise<string[]> => {
    const { dnsZones, organizationId, productNameId } = digicertCa.configuration;
    if (!dnsZones?.length) return [];

    const namesByZone = new Map<string, { zone: TDigiCertDnsZone; names: string[] }>();
    new Set(dnsNames.map((name) => name.trim().toLowerCase())).forEach((dnsName) => {
      const name = dnsName.startsWith(WILDCARD_PREFIX) ? dnsName.slice(WILDCARD_PREFIX.length) : dnsName;
      const zone = findMostSpecificZone(dnsZones, name);
      if (!zone) return;
      const entry = namesByZone.get(zone.zoneName) ?? { zone, names: [] };
      entry.names.push(name);
      namesByZone.set(zone.zoneName, entry);
    });
    if (!namesByZone.size) return [];

    const validationType = DIGICERT_EV_PRODUCT_NAME_IDS.has(productNameId)
      ? DigiCertDomainValidationType.Ev
      : DigiCertDomainValidationType.Ov;

    let domains: TDigiCertDomain[];
    try {
      domains = await client.listDomains(organizationId);
    } catch (error) {
      logger.warn(
        `DigiCert domain listing failed, skipping automatic domain validation [caId=${digicertCa.id}]: ${(error as Error)?.message}`
      );
      return [
        `Couldn't check ${[...namesByZone.keys()].join(", ")} in DigiCert for automatic validation: ${(error as Error)?.message}`
      ];
    }

    const zonesToValidate = [...namesByZone.values()].filter(
      ({ names }) => !names.every((name) => isNameCovered(domains, name, validationType))
    );
    if (!zonesToValidate.length || (await isCancelled())) return [];

    const deadline = Date.now() + DOMAIN_VALIDATION_DEADLINE_MS;
    const shouldStop = async () => Date.now() >= deadline || isCancelled();

    await onProgress(
      `Validating ${zonesToValidate.map(({ zone }) => zone.zoneName).join(", ")} with DigiCert using a persistent DNS TXT record`
    );

    const validateZone = async ({ zone, names }: { zone: TDigiCertDnsZone; names: string[] }) => {
      try {
        const isValidated = await $validateZoneApex({
          client,
          zone,
          names,
          organizationId,
          validationType,
          shouldStop
        });
        if (isValidated) return undefined;
        logger.warn(
          `DigiCert automatic domain validation didn't finish, the order will wait for DigiCert's recheck [caId=${digicertCa.id}] [domain=${zone.zoneName}]`
        );
        return `Couldn't validate ${zone.zoneName} automatically: DigiCert didn't see the persistent DNS TXT record`;
      } catch (error) {
        logger.warn(
          `DigiCert automatic domain validation failed [caId=${digicertCa.id}] [domain=${zone.zoneName}]: ${(error as Error)?.message}`
        );
        const reason = (error as Error)?.message ?? "Unknown error";
        return `Couldn't validate ${zone.zoneName} automatically: ${reason.endsWith(".") ? reason.slice(0, -1) : reason}`;
      }
    };

    const results: (string | undefined)[] = [];
    for (let start = 0; start < zonesToValidate.length; start += MAX_ZONES_VALIDATED_AT_ONCE) {
      // eslint-disable-next-line no-await-in-loop
      if (await isCancelled()) break;
      if (Date.now() >= deadline) {
        results.push(
          ...zonesToValidate
            .slice(start)
            .map(
              ({ zone }) =>
                `Couldn't validate ${zone.zoneName} automatically: the time for automatic validation ran out before it started`
            )
        );
        break;
      }
      const batch = zonesToValidate.slice(start, start + MAX_ZONES_VALIDATED_AT_ONCE);
      // eslint-disable-next-line no-await-in-loop
      const batchResults = await Promise.all(batch.map(validateZone));
      results.push(...batchResults);
    }
    const failures = results.filter((failure): failure is string => Boolean(failure));

    return failures;
  };

  return { validateDomainsBeforeOrder };
};
