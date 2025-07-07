import { AxiosError } from "axios";
import RE2 from "re2";

import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { ZabbixConnectionMethod } from "./zabbix-connection-enums";
import {
  TZabbixConnection,
  TZabbixConnectionConfig,
  TZabbixHost,
  TZabbixHostListResponse
} from "./zabbix-connection-types";

const TRAILING_SLASH_REGEX = new RE2("/+$");

export const getZabbixConnectionListItem = () => {
  return {
    name: "Zabbix" as const,
    app: AppConnection.Zabbix as const,
    methods: Object.values(ZabbixConnectionMethod) as [ZabbixConnectionMethod.ApiToken]
  };
};

export const validateZabbixConnectionCredentials = async (config: TZabbixConnectionConfig) => {
  const { apiToken, instanceUrl } = config.credentials;
  await blockLocalAndPrivateIpAddresses(instanceUrl);

  try {
    const apiUrl = `${instanceUrl.replace(TRAILING_SLASH_REGEX, "")}/api_jsonrpc.php`;

    const payload = {
      jsonrpc: "2.0",
      method: "authentication.get",
      params: {
        output: "extend"
      },
      id: 1
    };

    const response: { data: { error?: { message: string }; result?: string } } = await request.post(apiUrl, payload, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiToken}`
      }
    });

    if (response.data.error) {
      throw new BadRequestError({
        message: response.data.error.message
      });
    }

    return config.credentials;
  } catch (error) {
    if (error instanceof AxiosError) {
      throw new BadRequestError({
        message: `Failed to connect to Zabbix instance: ${error.message}`
      });
    }
    throw error;
  }
};

export const listZabbixHosts = async (appConnection: TZabbixConnection): Promise<TZabbixHost[]> => {
  const { apiToken, instanceUrl } = appConnection.credentials;
  await blockLocalAndPrivateIpAddresses(instanceUrl);

  try {
    const apiUrl = `${instanceUrl.replace(TRAILING_SLASH_REGEX, "")}/api_jsonrpc.php`;

    const payload = {
      jsonrpc: "2.0",
      method: "host.get",
      params: {
        output: ["hostid", "host"],
        sortfield: "host",
        sortorder: "ASC"
      },
      id: 1
    };

    const response: { data: TZabbixHostListResponse } = await request.post(apiUrl, payload, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiToken}`
      }
    });

    return response.data.result
      ? response.data.result.map((host) => ({
          hostId: host.hostid,
          host: host.host
        }))
      : [];
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
      throw new BadRequestError({
        message: `Failed to validate credentials: ${error.message || "Unknown error"}`
      });
    }
    throw new BadRequestError({
      message: "Unable to validate connection: verify credentials"
    });
  }
};
