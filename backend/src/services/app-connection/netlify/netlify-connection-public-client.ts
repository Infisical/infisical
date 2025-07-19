/* eslint-disable no-await-in-loop */
/* eslint-disable class-methods-use-this */
import { AxiosInstance, AxiosRequestConfig, AxiosResponse, HttpStatusCode, isAxiosError } from "axios";

import { createRequestClient } from "@app/lib/config/request";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";

import { NetlifyConnectionMethod } from "./netlify-connection-constants";
import { TNetlifyAccount, TNetlifyConnectionConfig, TNetlifySite, TNetlifyVariable } from "./netlify-connection-types";

export function getNetlifyAuthHeaders(connection: TNetlifyConnectionConfig): Record<string, string> {
  switch (connection.method) {
    case NetlifyConnectionMethod.AccessToken:
      return {
        Authorization: `Bearer ${connection.credentials.accessToken}`
      };
    default:
      throw new Error(`Unsupported Netlify connection method`);
  }
}

export function getNetlifyRatelimiter(response: AxiosResponse): {
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

type NetlifyParams = {
  account_id: string;
  context_name?: string;
  site_id?: string;
};

class NetlifyPublicClient {
  private client: AxiosInstance;

  constructor() {
    this.client = createRequestClient({
      baseURL: `${IntegrationUrls.NETLIFY_API_URL}/api/v1`,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }

  async send<T>(
    connection: TNetlifyConnectionConfig,
    config: AxiosRequestConfig,
    retryAttempt = 0
  ): Promise<T | undefined> {
    const response = await this.client.request<T>({
      ...config,
      timeout: 1000 * 60, // 60 seconds timeout
      validateStatus: (status) => (status >= 200 && status < 300) || status === HttpStatusCode.TooManyRequests,
      headers: getNetlifyAuthHeaders(connection)
    });
    const limiter = getNetlifyRatelimiter(response);

    if (limiter.isRatelimited && retryAttempt <= limiter.maxAttempts) {
      await limiter.wait();
      return this.send(connection, config, retryAttempt + 1);
    }

    return response.data;
  }

  healthcheck(connection: TNetlifyConnectionConfig) {
    switch (connection.method) {
      case NetlifyConnectionMethod.AccessToken:
        return this.getNetlifyAccounts(connection);
      default:
        throw new Error(`Unsupported Netlify connection method`);
    }
  }

  async getVariables(
    connection: TNetlifyConnectionConfig,
    { account_id, ...params }: NetlifyParams,
    limit: number = 50,
    page: number = 1
  ) {
    const res = await this.send<TNetlifyVariable[]>(connection, {
      method: "GET",
      url: `/accounts/${account_id}/env`,
      params: {
        ...params,
        limit,
        page
      }
    });

    return res;
  }

  async createVariable(
    connection: TNetlifyConnectionConfig,
    { account_id, ...params }: NetlifyParams,
    variable: TNetlifyVariable
  ) {
    const res = await this.send<TNetlifyVariable>(connection, {
      method: "POST",
      url: `/accounts/${account_id}/env`,
      data: [variable],
      params
    });

    return res;
  }

  async updateVariableValue(
    connection: TNetlifyConnectionConfig,
    { account_id, ...params }: NetlifyParams,
    variable: TNetlifyVariable
  ) {
    const res = await this.send<TNetlifyVariable>(connection, {
      method: "PATCH",
      url: `/accounts/${account_id}/env/${variable.key}`,
      data: variable,
      params
    });

    return res;
  }

  async updateVariable(
    connection: TNetlifyConnectionConfig,
    { account_id, ...params }: NetlifyParams,
    variable: TNetlifyVariable
  ) {
    const res = await this.send<TNetlifyVariable>(connection, {
      method: "PUT",
      url: `/accounts/${account_id}/env/${variable.key}`,
      data: variable,
      params
    });

    return res;
  }

  async getVariable(
    connection: TNetlifyConnectionConfig,
    { account_id, ...params }: NetlifyParams,
    variable: Pick<TNetlifyVariable, "key">
  ) {
    try {
      const res = await this.send<TNetlifyVariable>(connection, {
        method: "GET",
        url: `/accounts/${account_id}/env/${variable.key}`,
        params
      });

      return res;
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === HttpStatusCode.NotFound) {
        return null;
      }

      throw error;
    }
  }

  async upsertVariable(connection: TNetlifyConnectionConfig, params: NetlifyParams, variable: TNetlifyVariable) {
    const res = await this.getVariable(connection, params, variable);
    console.log("HEREEE", variable, params, res);
    if (!res) {
      return this.createVariable(connection, params, variable);
    }

    await this.updateVariable(connection, params, variable);

    return res;
  }

  async deleteVariable(
    connection: TNetlifyConnectionConfig,
    { account_id, ...params }: NetlifyParams,
    variable: Pick<TNetlifyVariable, "key">
  ) {
    try {
      const res = await this.send<TNetlifyVariable>(connection, {
        method: "DELETE",
        url: `/accounts/${account_id}/env/${variable.key}`,
        params
      });

      return res;
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === HttpStatusCode.NotFound) {
        return null;
      }

      throw error;
    }
  }

  async deleteVariableValue(
    connection: TNetlifyConnectionConfig,
    { account_id, value_id, ...params }: NetlifyParams & { value_id: string },
    variable: Pick<TNetlifyVariable, "key" | "id">
  ) {
    try {
      const res = await this.send<TNetlifyVariable>(connection, {
        method: "DELETE",
        url: `/accounts/${account_id}/${variable.key}/value/${value_id}`,
        params
      });

      return res;
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === HttpStatusCode.NotFound) {
        return null;
      }

      throw error;
    }
  }

  async getSites(connection: TNetlifyConnectionConfig, accountId: string) {
    const res = await this.send<TNetlifySite[]>(connection, {
      method: "GET",
      url: `/${accountId}/sites`
    });

    return res;
  }

  async getNetlifyAccounts(connection: TNetlifyConnectionConfig) {
    const res = await this.send<TNetlifyAccount[]>(connection, {
      method: "GET",
      url: `/accounts`
    });

    return res;
  }
}

export const NetlifyPublicAPI = new NetlifyPublicClient();
