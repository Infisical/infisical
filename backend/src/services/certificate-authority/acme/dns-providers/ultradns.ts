/* eslint-disable no-await-in-loop */

import { isAxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { delay } from "@app/lib/delay";
import { logger } from "@app/lib/logger";
import { UltraDNSEnvironment } from "@app/services/app-connection/ultradns/ultradns-connection-enum";
import {
  getUltraDNSAccessToken,
  getUltraDNSErrorMessage,
  getUltraDNSUrl
} from "@app/services/app-connection/ultradns/ultradns-connection-fns";
import { TUltraDNSConnection } from "@app/services/app-connection/ultradns/ultradns-connection-types";

const TXT_RECORD_TTL = 60;
const MAX_WRITE_ATTEMPTS = 3;
const WRITE_RETRY_DELAY_MS = 3000;
const APPLY_PENDING_STATUS = 202;

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
    const { data } = await request.get<{ rrSets?: { rdata?: string[] }[] }>(url, {
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
    const { status } = await request.delete(url, { headers });
    return status;
  }

  const body = { ttl: TXT_RECORD_TTL, rdata: values };
  const { status } = await (isNewRrSet ? request.post(url, body, { headers }) : request.put(url, body, { headers }));
  return status;
};

const applyToTxtRecordSet = async (
  url: string,
  accessToken: string,
  nextValuesFor: (currentValues: string[]) => string[] | null
) => {
  let lastWriteError: Error | undefined;
  let hasWritten = false;
  let shouldWaitBeforeRetry = false;

  for (let attempt = 1; attempt <= MAX_WRITE_ATTEMPTS; attempt += 1) {
    if (shouldWaitBeforeRetry) await delay(WRITE_RETRY_DELAY_MS * 2 ** (attempt - 2));

    const currentValues = await getTxtRecordValues(url, accessToken);
    const nextValues = nextValuesFor(currentValues);

    if (!nextValues) return { isConfirmed: true, lastWriteError };

    try {
      const status = await writeTxtRecordValues(url, accessToken, nextValues, currentValues.length === 0);
      hasWritten = true;
      shouldWaitBeforeRetry = status === APPLY_PENDING_STATUS;
    } catch (error) {
      lastWriteError = error instanceof Error ? error : new Error(String(error));
      shouldWaitBeforeRetry = true;
    }
  }

  if (!hasWritten && lastWriteError) throw lastWriteError;

  const finalValues = await getTxtRecordValues(url, accessToken);
  return { isConfirmed: !nextValuesFor(finalValues), lastWriteError };
};

export const ultraDNSInsertTxtRecord = async (
  connection: TUltraDNSConnection,
  zoneName: string,
  recordName: string,
  value: string
) => {
  const {
    credentials: { username, password, environment }
  } = connection;

  try {
    const accessToken = await getUltraDNSAccessToken(environment, username, password);
    const { isConfirmed, lastWriteError } = await applyToTxtRecordSet(
      getTxtRrSetUrl(environment, zoneName, recordName),
      accessToken,
      (currentValues) =>
        currentValues.some((current) => unquote(current) === unquote(value)) ? null : [...currentValues, value]
    );

    if (!isConfirmed) {
      logger.warn(
        { zoneName, recordName, err: lastWriteError },
        "UltraDNS has not confirmed the ACME challenge TXT record as published"
      );
    }
  } catch (error) {
    throw new Error(getUltraDNSErrorMessage(error));
  }
};

export const ultraDNSDeleteTxtRecord = async (
  connection: TUltraDNSConnection,
  zoneName: string,
  recordName: string,
  value: string
) => {
  const {
    credentials: { username, password, environment }
  } = connection;

  try {
    const accessToken = await getUltraDNSAccessToken(environment, username, password);
    const { isConfirmed, lastWriteError } = await applyToTxtRecordSet(
      getTxtRrSetUrl(environment, zoneName, recordName),
      accessToken,
      (currentValues) => {
        const remainingValues = currentValues.filter((current) => unquote(current) !== unquote(value));
        return remainingValues.length === currentValues.length ? null : remainingValues;
      }
    );

    if (!isConfirmed) {
      logger.warn(
        { zoneName, recordName, err: lastWriteError },
        "Could not remove the UltraDNS TXT record for the ACME challenge"
      );
    }
  } catch (error) {
    throw new Error(getUltraDNSErrorMessage(error));
  }
};
