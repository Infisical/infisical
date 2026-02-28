import { RawAxiosRequestHeaders } from "axios";

import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator";

import { AUDIT_LOG_STREAM_TIMEOUT } from "../../audit-log/audit-log-queue";
import { TLogStreamFactoryStreamLog, TLogStreamFactoryValidateCredentials } from "../audit-log-stream-types";
import { TAzureProviderCredentials } from "./azure-provider-types";

function createPayload(event: { createdAt?: Date | string } & Record<string, unknown>) {
  return [
    {
      ...event,
      TimeGenerated: (event.createdAt ? new Date(event.createdAt) : new Date()).toISOString()
    }
  ];
}

async function getAzureToken(tenantId: string, clientId: string, clientSecret: string) {
  const { data } = await request.post<{ access_token: string }>(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope: "https://monitor.azure.com/.default"
    }),
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      }
    }
  );

  return data.access_token;
}

export const AzureProviderFactory = () => {
  const validateCredentials: TLogStreamFactoryValidateCredentials<TAzureProviderCredentials> = async ({
    credentials
  }) => {
    const { tenantId, clientId, clientSecret, dceUrl, dcrId, cltName } = credentials;

    await blockLocalAndPrivateIpAddresses(dceUrl);

    const token = await getAzureToken(tenantId, clientId, clientSecret);

    const streamHeaders: RawAxiosRequestHeaders = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    };

    await request
      .post(
        `${dceUrl}/dataCollectionRules/${dcrId}/streams/Custom-${cltName}_CL?api-version=2023-01-01`,
        createPayload({ ping: "ok" }),
        {
          headers: streamHeaders,
          timeout: AUDIT_LOG_STREAM_TIMEOUT
        }
      )
      .catch((err) => {
        throw new BadRequestError({ message: `Failed to connect with Azure: ${(err as Error)?.message}` });
      });

    return credentials;
  };

  const streamLog: TLogStreamFactoryStreamLog<TAzureProviderCredentials> = async ({ credentials, auditLog }) => {
    const { tenantId, clientId, clientSecret, dceUrl, dcrId, cltName } = credentials;

    await blockLocalAndPrivateIpAddresses(dceUrl);

    const token = await getAzureToken(tenantId, clientId, clientSecret);

    const streamHeaders: RawAxiosRequestHeaders = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    };

    await request.post(
      `${dceUrl}/dataCollectionRules/${dcrId}/streams/Custom-${cltName}_CL?api-version=2023-01-01`,
      createPayload(auditLog),
      {
        headers: streamHeaders,
        timeout: AUDIT_LOG_STREAM_TIMEOUT
      }
    );
  };

  return {
    validateCredentials,
    streamLog
  };
};
