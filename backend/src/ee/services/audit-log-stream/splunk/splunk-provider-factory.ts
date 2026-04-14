import { RawAxiosRequestHeaders } from "axios";

import { getConfig } from "@app/lib/config/env";
import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator";

import { AUDIT_LOG_STREAM_TIMEOUT } from "../../audit-log/audit-log-queue";
import { TLogStreamFactoryStreamLog, TLogStreamFactoryValidateCredentials } from "../audit-log-stream-types";
import { TSplunkProviderCredentials } from "./splunk-provider-types";

function createPayload(event: Record<string, unknown>) {
  const appCfg = getConfig();

  return {
    time: Math.floor(Date.now() / 1000),
    ...(appCfg.SITE_URL && { host: new URL(appCfg.SITE_URL).host }),
    source: "infisical",
    sourcetype: "_json",
    event
  };
}

async function createSplunkUrl(hostname: string) {
  let parsedHostname: string;
  try {
    parsedHostname = new URL(`https://${hostname}`).hostname;
  } catch (error) {
    throw new BadRequestError({ message: `Invalid Splunk hostname provided: ${(error as Error).message}` });
  }

  await blockLocalAndPrivateIpAddresses(`https://${parsedHostname}`);

  return `https://${parsedHostname}:8088/services/collector/event`;
}

export const SplunkProviderFactory = () => {
  const validateCredentials: TLogStreamFactoryValidateCredentials<TSplunkProviderCredentials> = async ({
    credentials
  }) => {
    const { hostname, token } = credentials;

    const url = await createSplunkUrl(hostname);

    const streamHeaders: RawAxiosRequestHeaders = {
      "Content-Type": "application/json",
      Authorization: `Splunk ${token}`
    };

    await request
      .post(url, createPayload({ ping: "ok" }), {
        headers: streamHeaders,
        timeout: AUDIT_LOG_STREAM_TIMEOUT
      })
      .catch((err) => {
        throw new BadRequestError({ message: `Failed to connect with Splunk: ${(err as Error)?.message}` });
      });

    return credentials;
  };

  const streamLog: TLogStreamFactoryStreamLog<TSplunkProviderCredentials> = async ({ credentials, auditLog }) => {
    const { hostname, token } = credentials;

    const url = await createSplunkUrl(hostname);

    const streamHeaders: RawAxiosRequestHeaders = {
      "Content-Type": "application/json",
      Authorization: `Splunk ${token}`
    };

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
