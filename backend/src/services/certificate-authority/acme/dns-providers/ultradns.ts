/* eslint-disable no-await-in-loop */

import { isAxiosError } from "axios";

import { TKeyStoreFactory } from "@app/keystore/keystore";
import { delay } from "@app/lib/delay";
import { logger } from "@app/lib/logger";
import { UltraDNSEnvironment } from "@app/services/app-connection/ultradns/ultradns-connection-enum";
import {
  getUltraDNSAccessToken,
  getUltraDNSErrorMessage,
  getUltraDNSUrl,
  ULTRADNS_REQUEST_TIMEOUT_MS,
  ultraDNSSingleAttemptRequest
} from "@app/services/app-connection/ultradns/ultradns-connection-fns";
import { TUltraDNSConnection } from "@app/services/app-connection/ultradns/ultradns-connection-types";

import { withDnsRecordLock } from "./dns-record-lock";

const TXT_RECORD_TTL = 60;
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 3000;
const APPLY_PENDING_STATUS = 202;
const NON_RETRYABLE_STATUSES = [401, 403, 404];
const REQUESTS_PER_ATTEMPT = 3;
const RECORD_LOCK_TTL_MS = ULTRADNS_REQUEST_TIMEOUT_MS * (MAX_ATTEMPTS * REQUESTS_PER_ATTEMPT + 1) + 30_000;

export type TUltraDNSProviderDeps = {
  keyStore: Pick<TKeyStoreFactory, "acquireLock">;
};

const toFullyQualifiedName = (name: string) => (name.endsWith(".") ? name : `${name}.`);

const unquote = (value: string) => (value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value);

const getTxtRrSetUrl = (environment: UltraDNSEnvironment, zoneName: string, recordName: string) =>
  getUltraDNSUrl(
    environment,
    `/v1/zones/${encodeURIComponent(toFullyQualifiedName(zoneName))}/rrsets/TXT/${encodeURIComponent(
      toFullyQualifiedName(recordName)
    )}`
  );

const getTxtRecordValues = async (url: string, accessToken: string) => {
  try {
    const { data } = await ultraDNSSingleAttemptRequest.get<{ rrSets?: { rdata?: string[] }[] }>(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json"
      }
    });

    return data.rrSets?.[0]?.rdata ?? [];
  } catch (error) {
    if (isAxiosError(error) && error.response?.status === 404) return [];
    throw error;
  }
};

const writeTxtRecordValues = async (url: string, accessToken: string, values: string[], isNewRrSet: boolean) => {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    Accept: "application/json"
  };

  if (!values.length) {
    const { status } = await ultraDNSSingleAttemptRequest.delete(url, { headers });
    return status;
  }

  const body = { ttl: TXT_RECORD_TTL, rdata: values };
  const { status } = await (isNewRrSet
    ? ultraDNSSingleAttemptRequest.post(url, body, { headers })
    : ultraDNSSingleAttemptRequest.put(url, body, { headers }));
  return status;
};

const toError = (error: unknown) => (error instanceof Error ? error : new Error(String(error)));

const isNonRetryableError = (error: unknown) =>
  isAxiosError(error) && NON_RETRYABLE_STATUSES.includes(error.response?.status ?? 0);

const applyToTxtRecordSet = async (
  connection: TUltraDNSConnection,
  url: string,
  nextValuesFor: (currentValues: string[]) => string[] | null
) => {
  const { username, password, environment } = connection.credentials;
  let accessToken: string | undefined;
  let lastError: Error | undefined;
  let shouldWaitBeforeRetry = false;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    if (shouldWaitBeforeRetry) await delay(RETRY_DELAY_MS * 2 ** (attempt - 2));

    try {
      accessToken ??= await getUltraDNSAccessToken(environment, username, password, ultraDNSSingleAttemptRequest);
      const currentValues = await getTxtRecordValues(url, accessToken);
      const nextValues = nextValuesFor(currentValues);

      if (!nextValues) return { isConfirmed: true, lastError };

      const status = await writeTxtRecordValues(url, accessToken, nextValues, currentValues.length === 0);
      shouldWaitBeforeRetry = status === APPLY_PENDING_STATUS;
    } catch (error) {
      if (isNonRetryableError(error)) throw error;
      lastError = toError(error);
      shouldWaitBeforeRetry = true;
    }
  }

  if (!accessToken) return { isConfirmed: false, lastError };

  try {
    const finalValues = await getTxtRecordValues(url, accessToken);
    return { isConfirmed: !nextValuesFor(finalValues), lastError };
  } catch (error) {
    return { isConfirmed: false, lastError: toError(error) };
  }
};

export const ultraDNSInsertTxtRecord = async (
  connection: TUltraDNSConnection,
  zoneName: string,
  recordName: string,
  value: string,
  { keyStore }: TUltraDNSProviderDeps
) => {
  const { environment } = connection.credentials;
  const zoneId = toFullyQualifiedName(zoneName);
  const name = toFullyQualifiedName(recordName);

  try {
    await withDnsRecordLock(
      { providerName: "UltraDNS", connectionId: connection.id, zoneId, name, lockTtlMs: RECORD_LOCK_TTL_MS },
      keyStore,
      async () => {
        const { isConfirmed, lastError } = await applyToTxtRecordSet(
          connection,
          getTxtRrSetUrl(environment, zoneId, name),
          (currentValues) =>
            currentValues.some((current) => unquote(current) === unquote(value)) ? null : [...currentValues, value]
        );

        if (!isConfirmed) {
          throw new Error(
            `UltraDNS did not confirm the challenge record after ${MAX_ATTEMPTS} attempts${
              lastError ? `: ${getUltraDNSErrorMessage(lastError)}` : ""
            }`
          );
        }
      }
    );
  } catch (error) {
    throw new Error(
      `Failed to create UltraDNS TXT record '${name}' in zone '${zoneId}': ${getUltraDNSErrorMessage(error)}`,
      { cause: error }
    );
  }
};

export const ultraDNSDeleteTxtRecord = async (
  connection: TUltraDNSConnection,
  zoneName: string,
  recordName: string,
  value: string,
  { keyStore }: TUltraDNSProviderDeps
) => {
  const { environment } = connection.credentials;
  const zoneId = toFullyQualifiedName(zoneName);
  const name = toFullyQualifiedName(recordName);

  try {
    await withDnsRecordLock(
      { providerName: "UltraDNS", connectionId: connection.id, zoneId, name, lockTtlMs: RECORD_LOCK_TTL_MS },
      keyStore,
      async () => {
        const { isConfirmed, lastError } = await applyToTxtRecordSet(
          connection,
          getTxtRrSetUrl(environment, zoneId, name),
          (currentValues) => {
            const remainingValues = currentValues.filter((current) => unquote(current) !== unquote(value));
            return remainingValues.length === currentValues.length ? null : remainingValues;
          }
        );

        if (!isConfirmed) {
          logger.warn(
            { zoneName: zoneId, recordName: name, err: lastError },
            "Could not remove the UltraDNS TXT record for the ACME challenge"
          );
        }
      }
    );
  } catch (error) {
    throw new Error(
      `Failed to delete UltraDNS TXT record '${name}' in zone '${zoneId}': ${getUltraDNSErrorMessage(error)}`,
      { cause: error }
    );
  }
};
