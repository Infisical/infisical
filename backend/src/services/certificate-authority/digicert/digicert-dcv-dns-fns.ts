import { logger } from "@app/lib/logger";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { decryptAppConnection } from "@app/services/app-connection/app-connection-fns";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";

import { CaDnsProvider } from "../dns-providers/ca-dns-provider-enums";
import { waitForTxtRecordPropagation } from "../dns-providers/dns-propagation";
import {
  deleteDnsProviderTxtRecord,
  TDnsProviderConnection,
  upsertDnsProviderTxtRecord
} from "../dns-providers/dns-txt-record-fns";
import { TDigiCertApiClient } from "./digicert-api-client";
import { TPlaceOrderResponse } from "./digicert-certificate-authority-types";

export type TDigiCertDcvDnsRecord = { domain: string; value: string };

export type TDigiCertDcvSnapshot = {
  dnsAppConnectionId: string;
  provider: CaDnsProvider;
  hostedZoneId: string;
  records: TDigiCertDcvDnsRecord[];
  cleanedUpAt?: string;
};

type TDigiCertDnsAutomationDeps = {
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
};

/**
 * Creates the DCV TXT record DigiCert expects for every domain on the order, using
 * a single order-level random value (the same value validates every domain on the
 * order — see DigiCert's `dcv_random_value`). Falls back to fetching the value via
 * the dedicated DCV endpoint when the order response doesn't already include one
 * (e.g. because the order's product/DCV method didn't return it inline).
 *
 * Returns an empty array (a no-op) when DigiCert doesn't return a random value at
 * all — this happens when the domain is already validated in CertCentral, in which
 * case there's nothing to automate and the order proceeds as it always has.
 */
export const createDigiCertDcvDnsRecords = async ({
  orderResponse,
  orderedDomains,
  dnsAppConnectionId,
  dnsProviderConfig,
  client,
  deps
}: {
  orderResponse: TPlaceOrderResponse;
  orderedDomains: string[];
  dnsAppConnectionId: string;
  dnsProviderConfig: { provider: CaDnsProvider; hostedZoneId: string };
  client: TDigiCertApiClient;
  deps: TDigiCertDnsAutomationDeps;
}): Promise<TDigiCertDcvSnapshot | undefined> => {
  let dcvRandomValue = orderResponse.dcv_random_value;

  if (!dcvRandomValue) {
    try {
      const dcvToken = await client.getDcvRandomValue(orderResponse.id);
      dcvRandomValue = dcvToken.dcv_random_value;
    } catch (err) {
      // Most commonly: the domain(s) are already validated in CertCentral, so DigiCert
      // has nothing to hand out. Treat as a no-op and let the order proceed as usual.
      logger.info(
        err,
        `DigiCert did not return a DCV random value — leaving DCV to CertCentral [orderId=${orderResponse.id}]`
      );
      return undefined;
    }
  }

  if (!dcvRandomValue) return undefined;

  const dnsAppConnection = await deps.appConnectionDAL.findById(dnsAppConnectionId);
  if (!dnsAppConnection) {
    logger.warn(
      `DNS app connection '${dnsAppConnectionId}' not found — skipping DCV automation [orderId=${orderResponse.id}]`
    );
    return undefined;
  }
  const dnsConnection = (await decryptAppConnection(
    dnsAppConnection,
    deps.kmsService
  )) as unknown as TDnsProviderConnection;

  const records: TDigiCertDcvDnsRecord[] = [];
  await Promise.all(
    orderedDomains.map(async (domain) => {
      try {
        await upsertDnsProviderTxtRecord(
          dnsProviderConfig.provider,
          dnsConnection,
          dnsProviderConfig.hostedZoneId,
          domain,
          dcvRandomValue as string,
          `Set DigiCert DCV TXT record for order ${orderResponse.id}`
        );
        records.push({ domain, value: dcvRandomValue as string });
      } catch (err) {
        logger.warn(err, `Failed to create DigiCert DCV TXT record [orderId=${orderResponse.id}] [domain=${domain}]`);
      }
    })
  );

  if (records.length === 0) return undefined;

  // Best-effort: give DigiCert a head start on validation instead of waiting for the
  // next scheduled poll. Neither the propagation check nor the check-dcv call is
  // required for correctness — the poller retries check-dcv on every cycle regardless.
  await Promise.all(records.map((record) => waitForTxtRecordPropagation(record.domain, record.value)));
  try {
    await client.checkValidation(orderResponse.id);
  } catch (err) {
    logger.info(err, `Post-creation DigiCert DCV check did not pass yet [orderId=${orderResponse.id}]`);
  }

  return {
    dnsAppConnectionId,
    provider: dnsProviderConfig.provider,
    hostedZoneId: dnsProviderConfig.hostedZoneId,
    records
  };
};

/**
 * Removes the DCV TXT records created by `createDigiCertDcvDnsRecords` once an order
 * reaches a final state (issued, failed, or timed out). Best-effort — a cleanup
 * failure must never block reporting the certificate request's outcome.
 */
export const cleanupDigiCertDcvDnsRecords = async ({
  orderId,
  dcv,
  deps
}: {
  orderId: number;
  dcv: TDigiCertDcvSnapshot;
  deps: TDigiCertDnsAutomationDeps;
}): Promise<void> => {
  const dnsAppConnection = await deps.appConnectionDAL.findById(dcv.dnsAppConnectionId);
  if (!dnsAppConnection) {
    logger.warn(
      `DNS app connection '${dcv.dnsAppConnectionId}' not found — skipping DCV TXT cleanup [orderId=${orderId}]`
    );
    return;
  }
  const dnsConnection = (await decryptAppConnection(
    dnsAppConnection,
    deps.kmsService
  )) as unknown as TDnsProviderConnection;

  await Promise.all(
    dcv.records.map(async (record) => {
      try {
        await deleteDnsProviderTxtRecord(
          dcv.provider,
          dnsConnection,
          dcv.hostedZoneId,
          record.domain,
          record.value,
          `Delete DigiCert DCV TXT record for order ${orderId}`
        );
      } catch (err) {
        logger.warn(err, `Failed to delete DigiCert DCV TXT record [orderId=${orderId}] [domain=${record.domain}]`);
      }
    })
  );
};
