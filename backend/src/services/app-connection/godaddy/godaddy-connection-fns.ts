import { AxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";

import { buildGoDaddySsoKeyHeader } from "./godaddy-connection-constants";
import { GoDaddyConnectionMethod } from "./godaddy-connection-enums";
import { TGoDaddyConnectionConfig } from "./godaddy-connection-types";

export const getGoDaddyConnectionListItem = () => {
  return {
    name: "GoDaddy" as const,
    app: AppConnection.GoDaddy as const,
    methods: Object.values(GoDaddyConnectionMethod) as [GoDaddyConnectionMethod.ApiKey]
  };
};

export const getGoDaddyApiBaseUrl = (): string => IntegrationUrls.GODADDY_API_URL;

export const validateGoDaddyConnectionCredentials = async (config: TGoDaddyConnectionConfig) => {
  const { credentials } = config;
  const baseUrl = getGoDaddyApiBaseUrl();

  try {
    // GoDaddy's Certificates API has no list/whoami endpoint, so probe a non-existent certificate:
    // valid credentials return 404, only auth failures return 401/403. (/v1/domains can't be used —
    // it's gated behind a minimum-domains/reseller check and returns ACCESS_DENIED for most accounts.)
    await request.get(`${baseUrl}/v1/certificates/infisical-connection-validation`, {
      headers: {
        Authorization: buildGoDaddySsoKeyHeader(credentials.apiKey, credentials.apiSecret),
        "Content-Type": "application/json"
      }
    });
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
      const status = error.response?.status;
      if (status === 401 || status === 403) {
        // GoDaddy's 401 body is typically empty, so don't surface the bare axios "Request failed with
        // status code 401" — give a clear reason and append GoDaddy's message only when it provides one.
        const data = error.response?.data as { message?: string; fields?: { message?: string }[] } | undefined;
        const detail = data?.fields?.[0]?.message || data?.message;
        const reason =
          status === 401
            ? "GoDaddy rejected the credentials (401 Unauthorized) — verify the API key and secret"
            : "GoDaddy denied access (403 Forbidden) — the credentials lack access to the Certificates API";
        throw new BadRequestError({ message: detail ? `${reason}: ${detail}` : reason });
      }
      // 404 = authenticated, the probe certificate just doesn't exist (expected for valid credentials).
      if (status === 404) {
        return credentials;
      }
      // Anything else (5xx, 429, etc.) means we couldn't confirm the credentials — surface it rather
      // than treating a transient or server error as a successful validation.
      const data = error.response?.data as { message?: string; fields?: { message?: string }[] } | undefined;
      const detail = data?.fields?.[0]?.message || data?.message || error.message;
      throw new BadRequestError({
        message: `Unable to validate GoDaddy connection${status ? ` (GoDaddy returned ${status})` : ""}: ${detail}`
      });
    }
    throw new BadRequestError({
      message: `Unable to validate connection: ${(error as Error).message || "Verify credentials"}`
    });
  }

  return credentials;
};
