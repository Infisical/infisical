import https from "https";

import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { removeTrailingSlash } from "@app/lib/fn";
import { validateSsrfUrl } from "@app/lib/validator";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { OVHConnectionMethod } from "./ovh-connection-enums";
import { TOvhConnection, TOvhConnectionConfig } from "./ovh-connection-types";

export const getOvhConnectionListItem = () => {
  return {
    name: "OVH" as const,
    app: AppConnection.OVH as const,
    methods: Object.values(OVHConnectionMethod) as [OVHConnectionMethod.Certificate]
  };
};

export const getOvhHttpsAgent = (connection: Pick<TOvhConnection, "credentials"> | TOvhConnectionConfig) => {
  const { privateKey, certificate } = connection.credentials;

  return new https.Agent({
    key: privateKey,
    cert: certificate
  });
};

const normalizeOvhOkmsDomain = (okmsDomain: string) => {
  const normalized = removeTrailingSlash(okmsDomain.trim());

  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new BadRequestError({
      message: "OKMS domain must be a valid URL "
    });
  }

  if (url.protocol !== "https:") {
    throw new BadRequestError({ message: "OKMS domain must use https" });
  }

  return normalized;
};

export const validateOvhConnectionCredentials = async (config: TOvhConnectionConfig) => {
  const okmsDomain = normalizeOvhOkmsDomain(config.credentials.okmsDomain);
  const { okmsId } = config.credentials;

  await validateSsrfUrl(okmsDomain);

  const httpsAgent = getOvhHttpsAgent(config);

  try {
    await request.get(`${okmsDomain}/api/${encodeURIComponent(okmsId)}/v1/servicekey`, {
      httpsAgent,
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
