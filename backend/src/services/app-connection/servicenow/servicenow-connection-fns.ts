import { AxiosError } from "axios";

import { BadRequestError } from "@app/lib/errors";
import { logger, sanitizeUrlForLog } from "@app/lib/logger";
import { safeRequest } from "@app/lib/validator/safe-request";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { ServiceNowConnectionMethod } from "./servicenow-connection-enums";
import { TServiceNowConnectionConfig } from "./servicenow-connection-types";

export const getServiceNowConnectionListItem = () => {
  return {
    name: "ServiceNow" as const,
    app: AppConnection.ServiceNow as const,
    methods: Object.values(ServiceNowConnectionMethod) as [ServiceNowConnectionMethod.BasicAuth]
  };
};

const getRedirectHost = (error: unknown, instanceUrl: string) => {
  const location = error instanceof AxiosError ? (error.response?.headers?.location as unknown) : undefined;
  if (typeof location !== "string") return undefined;

  try {
    return new URL(location, instanceUrl).host;
  } catch {
    return undefined;
  }
};

export const validateServiceNowConnectionCredentials = async (config: TServiceNowConnectionConfig) => {
  const { instanceUrl, username, password } = config.credentials;

  try {
    await safeRequest.get(`${instanceUrl}/api/now/ui/user/current_user`, {
      auth: { username, password },
      headers: { Accept: "application/json" }
    });
  } catch (error) {
    // safeRequest's own refusals (private IP, unresolvable host, credentials in the URL) already
    // name what is wrong, and are more useful than the generic fallback below.
    if (error instanceof BadRequestError) throw error;

    const status = error instanceof AxiosError ? error.response?.status : undefined;

    // The raw Axios error is deliberately not logged: it carries the password at
    // config.auth.password, which sits past the logger's depth-three redaction.
    logger.error(
      { status, instanceUrl: sanitizeUrlForLog(instanceUrl), message: (error as Error)?.message },
      `Failed to validate ServiceNow connection [instanceUrl=${sanitizeUrlForLog(instanceUrl)}] [status=${status ?? "none"}]`
    );

    if (status === 401 || status === 403) {
      throw new BadRequestError({
        message:
          "Unable to connect to ServiceNow: verify the username and password of the integration user, and that the account is active."
      });
    }

    // safeRequest does not follow redirects, so a moved, mistyped, or hibernating instance arrives here as a 3xx.
    if (status && status >= 300 && status < 400) {
      const redirectHost = getRedirectHost(error, instanceUrl);
      throw new BadRequestError({
        message: `Unable to connect to ServiceNow: the instance URL ${
          redirectHost ? `redirected to '${redirectHost}'` : "returned a redirect"
        }. Verify that the instance URL is the base URL of your ServiceNow instance, and that the instance is active and not hibernating.`
      });
    }

    throw new BadRequestError({
      message:
        "Unable to connect to ServiceNow: verify the instance URL is correct and that the instance is reachable from Infisical."
    });
  }

  return config.credentials;
};
