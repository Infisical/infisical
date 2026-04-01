import { AxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { PowerDNSConnectionMethod } from "./powerdns-connection-enum";
import { TPowerDNSConnectionConfig } from "./powerdns-connection-types";

export const getPowerDNSConnectionListItem = () => {
  return {
    name: "PowerDNS" as const,
    app: AppConnection.PowerDNS as const,
    methods: Object.values(PowerDNSConnectionMethod) as [PowerDNSConnectionMethod.APIKey]
  };
};

export const validatePowerDNSConnectionCredentials = async (config: TPowerDNSConnectionConfig) => {
  if (config.method !== PowerDNSConnectionMethod.APIKey) {
    throw new BadRequestError({ message: "Unsupported PowerDNS connection method" });
  }

  const { apiKey, baseUrl } = config.credentials;

  try {
    // Use /servers/localhost/zones as the validation endpoint — it is supported by both
    // direct PowerDNS Server and PowerDNS-Admin proxy configurations.
    const resp = await request.get(`${baseUrl}/servers/localhost/zones`, {
      headers: {
        "x-api-key": apiKey,
        Accept: "application/json"
      }
    });

    if (resp.status !== 200) {
      throw new BadRequestError({
        message: "Unable to validate connection: Invalid API credentials provided."
      });
    }
  } catch (error: unknown) {
    if (error instanceof BadRequestError) {
      throw error;
    }
    if (error instanceof AxiosError) {
      throw new BadRequestError({
        message: `Failed to validate credentials: ${
          (error.response?.data as { error?: string })?.error || error.message || "Unknown error"
        }`
      });
    }
    logger.error(error, "Error validating PowerDNS connection credentials");
    throw new BadRequestError({
      message: "Unable to validate connection: verify credentials and base URL"
    });
  }

  return config.credentials;
};
