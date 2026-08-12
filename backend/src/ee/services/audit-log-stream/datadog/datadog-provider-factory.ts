import { RawAxiosRequestHeaders } from "axios";

import { getConfig } from "@app/lib/config/env";
import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";

import { AUDIT_LOG_STREAM_BATCH_TIMEOUT, AUDIT_LOG_STREAM_TIMEOUT } from "../../audit-log/audit-log-queue";
import { blockAuditLogStreamInternalIps } from "../audit-log-stream-fns";
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

    await blockAuditLogStreamInternalIps(url);

    const streamHeaders: RawAxiosRequestHeaders = { "Content-Type": "application/json", "DD-API-KEY": token };

    await request
      .post(url, createPayload({ ping: "ok" }), {
        headers: streamHeaders,
        timeout: AUDIT_LOG_STREAM_TIMEOUT
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

    await blockAuditLogStreamInternalIps(url);

    const streamHeaders: RawAxiosRequestHeaders = { "Content-Type": "application/json", "DD-API-KEY": token };

    await request.post(url, auditLogs.map(createPayload), {
      headers: streamHeaders,
      timeout: AUDIT_LOG_STREAM_BATCH_TIMEOUT
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
