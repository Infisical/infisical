import { RawAxiosRequestHeaders } from "axios";

import { getConfig } from "@app/lib/config/env";
import { BadRequestError } from "@app/lib/errors";
import { safeRequest } from "@app/lib/validator";

import { AUDIT_LOG_STREAM_BATCH_TIMEOUT, AUDIT_LOG_STREAM_TIMEOUT } from "../../audit-log/audit-log-queue";
import {
  TLogStreamFactoryBatchStreamLog,
  TLogStreamFactoryGetProviderBatchLimit,
  TLogStreamFactoryValidateCredentials
} from "../audit-log-stream-types";
import { TDatadogProviderCredentials } from "./datadog-provider-types";

function createPayload(event: Record<string, unknown>) {
  const appCfg = getConfig();

  const ddtags = [`env:${appCfg.NODE_ENV || "unknown"}`].join(",");

  return {
    ...event,
    hostname: new URL(appCfg.SITE_URL || "http://infisical").hostname,
    ddsource: "infisical",
    service: "infisical",
    ddtags
  };
}

export const DatadogProviderFactory = () => {
  const validateCredentials: TLogStreamFactoryValidateCredentials<TDatadogProviderCredentials> = async ({
    credentials
  }) => {
    const { url, token } = credentials;

    const streamHeaders: RawAxiosRequestHeaders = { "Content-Type": "application/json", "DD-API-KEY": token };

    await safeRequest
      .post(url, createPayload({ ping: "ok" }), {
        headers: streamHeaders,
        timeout: AUDIT_LOG_STREAM_TIMEOUT,
        allowPrivateIps: getConfig().AUDIT_LOG_STREAM_ALLOW_INTERNAL_IP
      })
      .catch((err) => {
        throw new BadRequestError({ message: `Failed to connect with Datadog: ${(err as Error)?.message}` });
      });

    return credentials;
  };

  const batchStreamLog: TLogStreamFactoryBatchStreamLog<TDatadogProviderCredentials> = async ({
    credentials,
    auditLogs
  }) => {
    if (auditLogs.length === 0) return;

    const { url, token } = credentials;

    const streamHeaders: RawAxiosRequestHeaders = { "Content-Type": "application/json", "DD-API-KEY": token };

    await safeRequest.post(url, auditLogs.map(createPayload), {
      headers: streamHeaders,
      timeout: AUDIT_LOG_STREAM_BATCH_TIMEOUT,
      allowPrivateIps: getConfig().AUDIT_LOG_STREAM_ALLOW_INTERNAL_IP
    });
  };

  const getProviderBatchLimit: TLogStreamFactoryGetProviderBatchLimit = () => ({
    maxLogs: 900,
    maxBytes: 4 * 1024 * 1024
  });

  return {
    validateCredentials,
    batchStreamLog,
    getProviderBatchLimit
  };
};
