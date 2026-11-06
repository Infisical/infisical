import { isAxiosError } from "axios";
import RE2 from "re2";

import { request } from "@app/lib/config/request";
import { delay } from "@app/lib/delay";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { GCP_CLOUD_DNS_ZONE_RESOURCE_PATTERN } from "@app/services/app-connection/gcp/gcp-connection-constants";
import { isGcpServiceDisabledError, TGoogleApiError } from "@app/services/app-connection/gcp/gcp-connection-errors";
import { getGcpConnectionAuthToken } from "@app/services/app-connection/gcp/gcp-connection-fns";
import { TGcpConnection } from "@app/services/app-connection/gcp/gcp-connection-types";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";

import { TDnsRecordLockKeyStore, withDnsRecordLock } from "./dns-record-lock";

type TGcpResourceRecordSet = {
  name: string;
  type: string;
  ttl: number;
  rrdatas: string[];
};

type TRecordSetChange = { additions?: TGcpResourceRecordSet[]; deletions?: TGcpResourceRecordSet[] };

type TBuildChange = (fqdn: string, existing: TGcpResourceRecordSet | null) => TRecordSetChange | null;

const TXT_RECORD_TTL_SECONDS = 60;
const MAX_CHANGE_ATTEMPTS = 5;
const CHANGE_RETRY_DELAY_MS = 1000;
const REQUEST_TIMEOUT_MS = 30_000;
const RECORD_LOCK_TTL_MS = MAX_CHANGE_ATTEMPTS * (REQUEST_TIMEOUT_MS * 2 + CHANGE_RETRY_DELAY_MS) + 30_000;
const QUOTES_REGEX = new RE2('"', "g");

export const validateGcpCloudDnsZone = (hostedZoneId: string) => {
  if (!GCP_CLOUD_DNS_ZONE_RESOURCE_PATTERN.test(hostedZoneId)) {
    throw new BadRequestError({
      message: `Invalid Google Cloud DNS zone '${hostedZoneId}'. Expected format: projects/{projectId}/managedZones/{zoneName}`
    });
  }
};

const getZoneUrl = (hostedZoneId: string) => {
  validateGcpCloudDnsZone(hostedZoneId);
  return `${IntegrationUrls.GCP_CLOUD_DNS_URL}/dns/v1/${hostedZoneId}`;
};

const toFqdn = (recordName: string) => (recordName.endsWith(".") ? recordName : `${recordName}.`);

const normalizeTxtValue = (value: string) => value.replace(QUOTES_REGEX, "");

const toGcpDnsError = (error: unknown, hostedZoneId: string, fqdn: string) => {
  if (isAxiosError(error)) {
    const body = error.response?.data as TGoogleApiError | undefined;
    const message = body?.error?.message || error.message || "Unknown error";

    if (error.response?.status === 403) {
      const [, gcpProjectId, , zoneName] = hostedZoneId.split("/");
      if (isGcpServiceDisabledError(body, message)) {
        return new Error(
          `The Cloud DNS API is not enabled on GCP project '${gcpProjectId}'. Enable dns.googleapis.com in the Google Cloud console and try again.`
        );
      }
      return new Error(
        `The GCP connection's service account can't manage records in Google Cloud DNS zone '${zoneName}'. Grant it the DNS Administrator role (roles/dns.admin) on GCP project '${gcpProjectId}' and try again.`
      );
    }

    const [, , , zoneName] = hostedZoneId.split("/");
    return new Error(`Failed to update Google Cloud DNS TXT record '${fqdn}' in zone '${zoneName}': ${message}`);
  }
  return error;
};

// 409 = created concurrently, 412 = changed since read, 404 on a deletion = removed since read
const isConflictError = (error: unknown, changeHadDeletions: boolean) =>
  isAxiosError(error) &&
  (error.response?.status === 409 ||
    error.response?.status === 412 ||
    (error.response?.status === 404 && changeHadDeletions));

const getTxtRecordSet = async (zoneUrl: string, accessToken: string, fqdn: string) => {
  try {
    const { data } = await request.get<TGcpResourceRecordSet>(`${zoneUrl}/rrsets/${encodeURIComponent(fqdn)}/TXT`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      timeout: REQUEST_TIMEOUT_MS
    });
    return data;
  } catch (error) {
    if (isAxiosError(error) && error.response?.status === 404) return null;
    throw error;
  }
};

const submitChange = async (zoneUrl: string, accessToken: string, change: TRecordSetChange) => {
  await request.post(`${zoneUrl}/changes`, change, {
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", Accept: "application/json" },
    timeout: REQUEST_TIMEOUT_MS
  });
};

const submitWithRetry = async (
  connection: TGcpConnection,
  hostedZoneId: string,
  zoneUrl: string,
  fqdn: string,
  buildChange: TBuildChange
) => {
  const accessToken = await getGcpConnectionAuthToken(connection);

  for (let attempt = 1; attempt <= MAX_CHANGE_ATTEMPTS; attempt += 1) {
    let changeHadDeletions = false;
    try {
      // eslint-disable-next-line no-await-in-loop
      const existing = await getTxtRecordSet(zoneUrl, accessToken, fqdn);
      const change = buildChange(fqdn, existing);
      if (!change) return;
      changeHadDeletions = Boolean(change.deletions?.length);

      // eslint-disable-next-line no-await-in-loop
      await submitChange(zoneUrl, accessToken, change);
      return;
    } catch (error) {
      if (!isConflictError(error, changeHadDeletions) || attempt === MAX_CHANGE_ATTEMPTS) {
        throw toGcpDnsError(error, hostedZoneId, fqdn);
      }
      // eslint-disable-next-line no-await-in-loop
      await delay(CHANGE_RETRY_DELAY_MS);
    }
  }
};

const applyTxtRecordChange = async (
  connection: TGcpConnection,
  hostedZoneId: string,
  recordName: string,
  buildChange: TBuildChange,
  keyStore: TDnsRecordLockKeyStore,
  abortSignal?: AbortSignal
) => {
  const zoneUrl = getZoneUrl(hostedZoneId);
  const fqdn = toFqdn(recordName);

  await withDnsRecordLock(
    {
      connectionId: connection.id,
      zoneId: hostedZoneId,
      name: fqdn,
      providerName: "Google Cloud DNS",
      lockTtlMs: RECORD_LOCK_TTL_MS,
      abortSignal
    },
    keyStore,
    () => submitWithRetry(connection, hostedZoneId, zoneUrl, fqdn, buildChange)
  );
};

export const gcpCloudDnsInsertTxtRecord = async (
  connection: TGcpConnection,
  hostedZoneId: string,
  recordName: string,
  value: string,
  keyStore: TDnsRecordLockKeyStore,
  abortSignal?: AbortSignal
) => {
  await applyTxtRecordChange(
    connection,
    hostedZoneId,
    recordName,
    (fqdn, existing) => {
      if (!existing) {
        return { additions: [{ name: fqdn, type: "TXT", ttl: TXT_RECORD_TTL_SECONDS, rrdatas: [value] }] };
      }

      if (existing.rrdatas.some((rrdata) => normalizeTxtValue(rrdata) === normalizeTxtValue(value))) {
        return null;
      }

      return {
        deletions: [existing],
        additions: [{ ...existing, rrdatas: [...existing.rrdatas, value] }]
      };
    },
    keyStore,
    abortSignal
  );
};

export const gcpCloudDnsDeleteTxtRecord = async (
  connection: TGcpConnection,
  hostedZoneId: string,
  recordName: string,
  value: string,
  keyStore: TDnsRecordLockKeyStore
) => {
  await applyTxtRecordChange(
    connection,
    hostedZoneId,
    recordName,
    (fqdn, existing) => {
      const remaining = existing?.rrdatas.filter((rrdata) => normalizeTxtValue(rrdata) !== normalizeTxtValue(value));

      if (!existing || !remaining || remaining.length === existing.rrdatas.length) {
        logger.warn(
          { hostedZoneId, recordName: fqdn },
          `Google Cloud DNS TXT record not found for deletion [hostedZoneId=${hostedZoneId}] [recordName=${fqdn}]`
        );
        return null;
      }

      return {
        deletions: [existing],
        ...(remaining.length ? { additions: [{ ...existing, rrdatas: remaining }] } : {})
      };
    },
    keyStore
  );
};
