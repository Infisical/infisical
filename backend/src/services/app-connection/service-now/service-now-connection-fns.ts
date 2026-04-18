import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { ServiceNowConnectionMethod } from "./service-now-connection-enums";
import { TServiceNowConnectionConfig } from "./service-now-connection-types";

export const getServiceNowConnectionListItem = () => {
  return {
    name: "ServiceNow" as const,
    app: AppConnection.ServiceNow as const,
    methods: Object.values(ServiceNowConnectionMethod) as [ServiceNowConnectionMethod.BasicAuth]
  };
};

export const validateServiceNowConnectionCredentials = async (config: TServiceNowConnectionConfig) => {
  const { credentials } = config;
  const { instanceUrl, username, password } = credentials;

  const baseUrl = instanceUrl.endsWith("/") ? instanceUrl.slice(0, -1) : instanceUrl;

  try {
    await request.get(`${baseUrl}/api/now/table/sys_user?sysparm_limit=1`, {
      auth: {
        username,
        password
      },
      headers: {
        Accept: "application/json"
      },
      validateStatus: (status) => status === 200
    });
  } catch {
    throw new BadRequestError({
      message: "Unable to validate connection: verify credentials and that the ServiceNow instance is reachable"
    });
  }

  return config.credentials;
};
