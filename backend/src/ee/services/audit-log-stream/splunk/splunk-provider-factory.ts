import { RawAxiosRequestHeaders } from "axios";

import { getConfig } from "@app/lib/config/env";
import { BadRequestError } from "@app/lib/errors";
import { safeRequest } from "@app/lib/validator";

import { AUDIT_LOG_STREAM_BATCH_TIMEOUT, AUDIT_LOG_STREAM_TIMEOUT } from "../../audit-log/audit-log-queue";
import { resolveEventTimestamp } from "../audit-log-stream-fns";
import {
  TLogStreamFactoryBatchStreamLog,
  TLogStreamFactoryGetProviderBatchLimit,
  TLogStreamFactoryValidateCredentials
} from "../audit-log-stream-types";
import { SPLUNK_DEFAULT_HEC_PORT } from "./splunk-provider-schemas";
import { TSplunkProviderCredentials } from "./splunk-provider-types";

function createPayload(event: Record<string, unknown> & { createdAt?: Date | string }) {
  const appCfg = getConfig();

  return {
    time: resolveEventTimestamp(event).getTime() / 1000,
    ...(appCfg.SITE_URL && { host: new URL(appCfg.SITE_URL).host }),
    source: "infisical",
    sourcetype: "_json",
    event
  };
}

function createSplunkUrl(hostname: string, port?: number) {
  let parsedHostname: string;
  try {
    parsedHostname = new URL(`https://${hostname}`).hostname;
  } catch (error) {
    throw new BadRequestError({ message: `Invalid Splunk hostname provided: ${(error as Error).message}` });
  }

  return `https://${parsedHostname}:${port ?? SPLUNK_DEFAULT_HEC_PORT}/services/collector/event`;
}

export const SplunkProviderFactory = () => {
  const validateCredentials: TLogStreamFactoryValidateCredentials<TSplunkProviderCredentials> = async ({
    credentials
  }) => {
    const { hostname, port, token } = credentials;

    const url = createSplunkUrl(hostname, port);

    const streamHeaders: RawAxiosRequestHeaders = {
      "Content-Type": "application/json",
      Authorization: `Splunk ${token}`
    };

    await safeRequest
      .post(url, createPayload({ ping: "ok" }), {
        headers: streamHeaders,
        timeout: AUDIT_LOG_STREAM_TIMEOUT,
        allowPrivateIps: getConfig().AUDIT_LOG_STREAM_ALLOW_INTERNAL_IP
      })
      .catch((err) => {
        throw new BadRequestError({ message: `Failed to connect with Splunk: ${(err as Error)?.message}` });
      });

    return credentials;
  };

  const batchStreamLog: TLogStreamFactoryBatchStreamLog<TSplunkProviderCredentials> = async ({
    credentials,
    auditLogs
  }) => {
    if (auditLogs.length === 0) return;

    const { hostname, port, token } = credentials;

    const url = createSplunkUrl(hostname, port);

    const streamHeaders: RawAxiosRequestHeaders = {
      "Content-Type": "application/json",
      Authorization: `Splunk ${token}`
    };

    // HEC takes multiple events as concatenated JSON objects, which is not itself valid JSON.
    // Axios' default transform re-runs JSON.stringify over any string body it cannot JSON.parse
    // when the content type is JSON, which would wrap the whole batch in one quoted, escaped
    // string that HEC rejects with a 400. Send the bytes we built, untransformed.
    const body = auditLogs.map((auditLog) => JSON.stringify(createPayload(auditLog))).join("");

    await safeRequest.post(url, body, {
      headers: streamHeaders,
      timeout: AUDIT_LOG_STREAM_BATCH_TIMEOUT,
      allowPrivateIps: getConfig().AUDIT_LOG_STREAM_ALLOW_INTERNAL_IP,
      transformRequest: [(data: unknown) => data]
    });
  };

  const getProviderBatchLimit: TLogStreamFactoryGetProviderBatchLimit = () => ({
    maxLogs: 400,
    maxBytes: 700 * 1024
  });

  return {
    validateCredentials,
    batchStreamLog,
    getProviderBatchLimit
  };
};
