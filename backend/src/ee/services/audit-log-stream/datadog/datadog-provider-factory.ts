import { RawAxiosRequestHeaders } from "axios";

import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator";

import { AUDIT_LOG_STREAM_TIMEOUT } from "../../audit-log/audit-log-queue";
import { TLogStreamFactoryStreamLog, TLogStreamFactoryValidateCredentials } from "../audit-log-stream-types";
import { TDatadogProviderCredentials } from "./datadog-provider-types";

export const DatadogProviderFactory = () => {
  const validateCredentials: TLogStreamFactoryValidateCredentials<TDatadogProviderCredentials> = async ({
    credentials
  }) => {
    const { url, token } = credentials;

    await blockLocalAndPrivateIpAddresses(url);

    const streamHeaders: RawAxiosRequestHeaders = { "Content-Type": "application/json", "DD-API-KEY": token };

    await request
      .post(
        url,
        { ping: "ok" },
        {
          headers: streamHeaders,
          timeout: AUDIT_LOG_STREAM_TIMEOUT,
          signal: AbortSignal.timeout(AUDIT_LOG_STREAM_TIMEOUT)
        }
      )
      .catch((err) => {
        throw new BadRequestError({ message: `Failed to connect with Datadog: ${(err as Error)?.message}` });
      });

    return credentials;
  };

  const streamLog: TLogStreamFactoryStreamLog<TDatadogProviderCredentials> = async ({ credentials, auditLog }) => {
    const { url, token } = credentials;

    await blockLocalAndPrivateIpAddresses(url);

    const streamHeaders: RawAxiosRequestHeaders = { "Content-Type": "application/json", "DD-API-KEY": token };

    await request.post(
      url,
      { ...auditLog, ddsource: "infisical", service: "audit-logs" },
      {
        headers: streamHeaders,
        timeout: AUDIT_LOG_STREAM_TIMEOUT,
        signal: AbortSignal.timeout(AUDIT_LOG_STREAM_TIMEOUT)
      }
    );
  };

  return {
    validateCredentials,
    streamLog
  };
};
