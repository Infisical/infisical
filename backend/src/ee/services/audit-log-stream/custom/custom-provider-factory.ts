import { RawAxiosRequestHeaders } from "axios";

import { BadRequestError } from "@app/lib/errors";
import { safeRequest } from "@app/lib/validator";

import { AUDIT_LOG_STREAM_TIMEOUT } from "../../audit-log/audit-log-queue";
import { TLogStreamFactoryStreamLog, TLogStreamFactoryValidateCredentials } from "../audit-log-stream-types";
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
          timeout: AUDIT_LOG_STREAM_TIMEOUT
        }
      )
      .catch((err) => {
        throw new BadRequestError({ message: `Failed to connect with upstream source: ${(err as Error)?.message}` });
      });

    return credentials;
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
      timeout: AUDIT_LOG_STREAM_TIMEOUT
    });
  };

  return {
    validateCredentials,
    streamLog
  };
};
