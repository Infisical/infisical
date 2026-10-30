import { RawAxiosRequestHeaders } from "axios";

import { getConfig } from "@app/lib/config/env";
import { BadRequestError } from "@app/lib/errors";
import { safeRequest } from "@app/lib/validator";

import { AUDIT_LOG_STREAM_BATCH_TIMEOUT, AUDIT_LOG_STREAM_TIMEOUT } from "../../audit-log/audit-log-queue";
import {
  TLogStreamFactoryBatchStreamLog,
  TLogStreamFactoryGetProviderBatchLimit,
  TLogStreamFactoryStreamLog,
  TLogStreamFactoryValidateCredentials
} from "../audit-log-stream-types";
import { TCustomProviderCredentials } from "./custom-provider-types";

export const CustomProviderFactory = () => {
  const validateCredentials: TLogStreamFactoryValidateCredentials<TCustomProviderCredentials> = async ({
    credentials
  }) => {
    const { url, headers } = credentials;

    const streamHeaders: RawAxiosRequestHeaders = { "Content-Type": "application/json" };
    if (headers.length) {
      headers.forEach(({ key, value }) => {
        streamHeaders[key] = value;
      });
    }

    await safeRequest
      .post(
        url,
        { ping: "ok" },
        {
          headers: streamHeaders,
          timeout: AUDIT_LOG_STREAM_TIMEOUT,
          allowPrivateIps: getConfig().AUDIT_LOG_STREAM_ALLOW_INTERNAL_IP
        }
      )
      .catch((err) => {
        throw new BadRequestError({ message: `Failed to connect with upstream source: ${(err as Error)?.message}` });
      });

    return credentials;
  };

  const batchStreamLog: TLogStreamFactoryBatchStreamLog<TCustomProviderCredentials> = async ({
    credentials,
    auditLogs
  }) => {
    if (auditLogs.length === 0) return;

    const { url, headers } = credentials;

    const streamHeaders: RawAxiosRequestHeaders = { "Content-Type": "application/json" };

    if (headers.length) {
      headers.forEach(({ key, value }) => {
        streamHeaders[key] = value;
      });
    }

    await safeRequest.post(url, auditLogs, {
      headers: streamHeaders,
      timeout: AUDIT_LOG_STREAM_BATCH_TIMEOUT,
      allowPrivateIps: getConfig().AUDIT_LOG_STREAM_ALLOW_INTERNAL_IP
    });
  };

  const streamLog: TLogStreamFactoryStreamLog<TCustomProviderCredentials> = async ({ credentials, auditLog }) => {
    const { url, headers } = credentials;

    const streamHeaders: RawAxiosRequestHeaders = { "Content-Type": "application/json" };

    if (headers.length) {
      headers.forEach(({ key, value }) => {
        streamHeaders[key] = value;
      });
    }

    await safeRequest.post(url, auditLog, {
      headers: streamHeaders,
      timeout: AUDIT_LOG_STREAM_TIMEOUT,
      allowPrivateIps: getConfig().AUDIT_LOG_STREAM_ALLOW_INTERNAL_IP
    });
  };

  const getProviderBatchLimit: TLogStreamFactoryGetProviderBatchLimit = () => ({
    maxLogs: 400,
    maxBytes: 700 * 1024
  });

  return {
    validateCredentials,
    batchStreamLog,
    streamLog,
    getProviderBatchLimit
  };
};
