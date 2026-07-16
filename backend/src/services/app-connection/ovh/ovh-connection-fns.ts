import https from "https";

import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { removeTrailingSlash } from "@app/lib/fn";
import { DiscriminativePick } from "@app/lib/types";
import { validateSsrfUrl } from "@app/lib/validator";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { OVHConnectionMethod } from "./ovh-connection-enums";
import { TOvhConnection, TOvhConnectionConfig } from "./ovh-connection-types";

export const getOvhConnectionListItem = () => {
  return {
    name: "OVHcloud" as const,
    app: AppConnection.OVH as const,
    methods: Object.values(OVHConnectionMethod) as [OVHConnectionMethod.Certificate, OVHConnectionMethod.Token]
  };
};

export type TOvhRequestOptions = {
  httpsAgent?: https.Agent;
  headers?: Record<string, string>;
};

export const getOvhRequestOptions = (
  connection: DiscriminativePick<TOvhConnection, "method" | "credentials"> | TOvhConnectionConfig
): TOvhRequestOptions => {
  switch (connection.method) {
    case OVHConnectionMethod.Certificate: {
      const { privateKey, certificate } = connection.credentials;

      return {
        httpsAgent: new https.Agent({
          key: privateKey,
          cert: certificate
        })
      };
    }
    case OVHConnectionMethod.Token: {
      const { token } = connection.credentials;

      return {
        headers: {
          Authorization: `Bearer ${token}`
        }
      };
    }
    default:
      throw new BadRequestError({
        message: `Unhandled OVHcloud connection method: ${(connection as { method: string }).method}`
      });
  }
};

const normalizeOvhOkmsDomain = (okmsDomain: string) => {
  const normalized = removeTrailingSlash(okmsDomain.trim());

  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new BadRequestError({
      message: "OVHcloud KMS domain must be a valid URL "
    });
  }

  if (url.protocol !== "https:") {
    throw new BadRequestError({ message: "OVHcloud KMS domain must be a valid URL (e.g. https://eu-west-rbx.okms.ovh.net)" });
  }

  return normalized;
};

export const validateOvhConnectionCredentials = async (config: TOvhConnectionConfig) => {
  const okmsDomain = normalizeOvhOkmsDomain(config.credentials.okmsDomain);
  const { okmsId } = config.credentials;

  await validateSsrfUrl(okmsDomain);

  const { httpsAgent, headers } = getOvhRequestOptions(config);

  try {
    await request.get(`${okmsDomain}/api/${encodeURIComponent(okmsId)}/v1/servicekey`, {
      httpsAgent,
      headers,
      timeout: 15000,
      validateStatus: (status) => status === 200
    });
  } catch (err) {
    throw new BadRequestError({
      message: `Unable to validate OVH connection: ${err instanceof Error ? err.message : "unknown error"}`
    });
  }

  return {
    ...config.credentials,
    okmsDomain
  };
};
