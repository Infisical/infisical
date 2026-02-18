import { RawAxiosRequestHeaders } from "axios";

import { getConfig } from "@app/lib/config/env";
import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator";

import { AUDIT_LOG_STREAM_TIMEOUT } from "../../audit-log/audit-log-queue";
import { TLogStreamFactoryStreamLog, TLogStreamFactoryValidateCredentials } from "../audit-log-stream-types";
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

    await blockLocalAndPrivateIpAddresses(url);

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

  const streamLog: TLogStreamFactoryStreamLog<TDatadogProviderCredentials> = async ({ credentials, auditLog }) => {
    const { url, token } = credentials;

    await blockLocalAndPrivateIpAddresses(url);

    const streamHeaders: RawAxiosRequestHeaders = { "Content-Type": "application/json", "DD-API-KEY": token };

    await request.post(url, createPayload(auditLog), {
      headers: streamHeaders,
      timeout: AUDIT_LOG_STREAM_TIMEOUT
    });
  };

  return {
    validateCredentials,
    streamLog
  };
};
