/* eslint-disable no-await-in-loop */
/* eslint-disable class-methods-use-this */
import { AxiosInstance, AxiosRequestConfig, AxiosResponse, HttpStatusCode, isAxiosError } from "axios";

import { createRequestClient } from "@app/lib/config/request";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";
import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";

import { ChecklyConnectionMethod } from "./checkly-connection-constants";
import { TChecklyAccount, TChecklyConnectionConfig, TChecklyVariable } from "./checkly-connection-types";

export function getChecklyAuthHeaders(
  connection: TChecklyConnectionConfig,
  accountId?: string
): Record<string, string> {
  switch (connection.method) {
    case ChecklyConnectionMethod.ApiKey:
      return {
        Authorization: `Bearer ${connection.credentials.apiKey}`,
        ...(accountId && { "X-Checkly-Account": accountId })
      };
    default:
      throw new Error(`Unsupported Checkly connection method`);
  }
}

export function getChecklyRatelimiter(response: AxiosResponse): {
  maxAttempts: number;
  isRatelimited: boolean;
  wait: () => Promise<void>;
} {
  const wait = () => {
    return new Promise<void>((res) => {
      setTimeout(res, 60 * 1000); // Wait for 60 seconds
    });
  };

  return {
    isRatelimited: response.status === HttpStatusCode.TooManyRequests,
    wait,
    maxAttempts: 3
  };
}

class ChecklyPublicClient {
  private client: AxiosInstance;

  constructor() {
    this.client = createRequestClient({
      baseURL: IntegrationUrls.CHECKLY_API_URL,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }

  async send<T>(
    connection: TChecklyConnectionConfig,
    config: AxiosRequestConfig & { accountId?: string },
    retryAttempt = 0
  ): Promise<T | undefined> {
    const response = await this.client.request<T>({
      ...config,
      timeout: 1000 * 60, // 60 seconds timeout
      validateStatus: (status) => (status >= 200 && status < 300) || status === HttpStatusCode.TooManyRequests,
      headers: getChecklyAuthHeaders(connection, config.accountId)
    });
    const limiter = getChecklyRatelimiter(response);

    if (limiter.isRatelimited && retryAttempt <= limiter.maxAttempts) {
      await limiter.wait();
      return this.send(connection, config, retryAttempt + 1);
    }

    return response.data;
  }

  healthcheck(connection: TChecklyConnectionConfig) {
    switch (connection.method) {
      case ChecklyConnectionMethod.ApiKey:
        return this.getChecklyAccounts(connection);
      default:
        throw new Error(`Unsupported Checkly connection method`);
    }
  }

  async getVariables(connection: TChecklyConnectionConfig, accountId: string, limit: number = 50, page: number = 1) {
    const res = await this.send<TChecklyVariable[]>(connection, {
      accountId,
      method: "GET",
      url: `/v1/variables`,
      params: {
        limit,
        page
      }
    });

    return res;
  }

  async createVariable(connection: TChecklyConnectionConfig, accountId: string, variable: TChecklyVariable) {
    const res = await this.send<TChecklyVariable>(connection, {
      accountId,
      method: "POST",
      url: `/v1/variables`,
      data: variable
    });

    return res;
  }

  async updateVariable(connection: TChecklyConnectionConfig, accountId: string, variable: TChecklyVariable) {
    const res = await this.send<TChecklyVariable>(connection, {
      accountId,
      method: "PUT",
      url: `/v1/variables/${variable.key}`,
      data: variable
    });

    return res;
  }

  async getVariable(connection: TChecklyConnectionConfig, accountId: string, variable: Pick<TChecklyVariable, "key">) {
    try {
      const res = await this.send<TChecklyVariable>(connection, {
        accountId,
        method: "GET",
        url: `/v1/variables/${variable.key}`
      });

      return res;
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === HttpStatusCode.NotFound) {
        return null;
      }

      throw error;
    }
  }

  async upsertVariable(connection: TChecklyConnectionConfig, accountId: string, variable: TChecklyVariable) {
    const res = await this.getVariable(connection, accountId, variable);

    if (!res) {
      return this.createVariable(connection, accountId, variable);
    }

    await this.updateVariable(connection, accountId, variable);

    return res;
  }

  async deleteVariable(
    connection: TChecklyConnectionConfig,
    accountId: string,
    variable: Pick<TChecklyVariable, "key">
  ) {
    try {
      const res = await this.send<TChecklyVariable>(connection, {
        accountId,
        method: "DELETE",
        url: `/v1/variables/${variable.key}`
      });

      return res;
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === HttpStatusCode.NotFound) {
        return null;
      }

      throw error;
    }
  }

  async getChecklyAccounts(connection: TChecklyConnectionConfig) {
    // This endpoint is in beta and might be subject to changes
    // Refer: https://developers.checklyhq.com/reference/getv1accounts
    const res = await this.send<TChecklyAccount[]>(connection, {
      method: "GET",
      url: `/v1/accounts`
    });

    return res;
  }

  async getCheckGroups(connection: TChecklyConnectionConfig, accountId: string, limit = 50, page = 1) {
    const res = await this.send<{ id: number; name: string }[]>(connection, {
      accountId,
      method: "GET",
      url: `/v1/check-groups`,
      params: { limit, page }
    });

    return res?.map((group) => ({
      id: group.id.toString(),
      name: group.name
    }));
  }

  async getCheckGroup(connection: TChecklyConnectionConfig, accountId: string, groupId: string) {
    try {
      type ChecklyGroupResponse = {
        id: number;
        name: string;
        environmentVariables: Array<{
          key: string;
          value: string;
          locked: boolean;
        }>;
      };

      const res = await this.send<ChecklyGroupResponse>(connection, {
        accountId,
        method: "GET",
        url: `/v1/check-groups/${groupId}`
      });

      if (!res) return null;

      return {
        id: res.id.toString(),
        name: res.name,
        environmentVariables: res.environmentVariables
      };
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === HttpStatusCode.NotFound) {
        return null;
      }
      throw error;
    }
  }

  async updateCheckGroupEnvironmentVariables(
    connection: TChecklyConnectionConfig,
    accountId: string,
    groupId: string,
    environmentVariables: Array<{ key: string; value: string; locked?: boolean }>
  ) {
    if (environmentVariables.length > 50) {
      throw new SecretSyncError({
        message: "Checkly does not support syncing more than 50 variables to Check Group",
        shouldRetry: false
      });
    }

    const apiVariables = environmentVariables.map((v) => ({
      key: v.key,
      value: v.value,
      locked: v.locked ?? false,
      secret: true
    }));

    const group = await this.getCheckGroup(connection, accountId, groupId);

    await this.send(connection, {
      accountId,
      method: "PUT",
      url: `/v2/check-groups/${groupId}`,
      data: { name: group?.name, environmentVariables: apiVariables }
    });

    return this.getCheckGroup(connection, accountId, groupId);
  }

  async getCheckGroupEnvironmentVariables(connection: TChecklyConnectionConfig, accountId: string, groupId: string) {
    const group = await this.getCheckGroup(connection, accountId, groupId);
    return group?.environmentVariables || [];
  }

  async upsertCheckGroupEnvironmentVariables(
    connection: TChecklyConnectionConfig,
    accountId: string,
    groupId: string,
    variables: Array<{ key: string; value: string; locked?: boolean }>
  ) {
    const existingVars = await this.getCheckGroupEnvironmentVariables(connection, accountId, groupId);
    const varMap = new Map(existingVars.map((v) => [v.key, v]));

    for (const newVar of variables) {
      varMap.set(newVar.key, {
        key: newVar.key,
        value: newVar.value,
        locked: newVar.locked ?? false
      });
    }

    return this.updateCheckGroupEnvironmentVariables(connection, accountId, groupId, Array.from(varMap.values()));
  }

  async deleteCheckGroupEnvironmentVariable(
    connection: TChecklyConnectionConfig,
    accountId: string,
    groupId: string,
    variableKey: string
  ) {
    const existingVars = await this.getCheckGroupEnvironmentVariables(connection, accountId, groupId);
    const filteredVars = existingVars.filter((v) => v.key !== variableKey);

    return this.updateCheckGroupEnvironmentVariables(connection, accountId, groupId, filteredVars);
  }
}

export const ChecklyPublicAPI = new ChecklyPublicClient();
