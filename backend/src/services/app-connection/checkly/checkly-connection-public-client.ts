/* eslint-disable no-await-in-loop */
/* eslint-disable class-methods-use-this */
import { AxiosInstance, AxiosRequestConfig, AxiosResponse, HttpStatusCode, isAxiosError } from "axios";

import { createRequestClient } from "@app/lib/config/request";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";

import { ChecklyConnectionMethod } from "./checkly-connection-constants";
import { TChecklyAccount, TChecklyConnectionConfig, TChecklyVariable } from "./checkly-connection-types";

export function getChecklyAuthHeaders(connection: TChecklyConnectionConfig): Record<string, string> {
  switch (connection.method) {
    case ChecklyConnectionMethod.ApiKey:
      return {
        Authorization: `Bearer ${connection.credentials.apiKey}`,
        "X-Checkly-Account": connection.credentials.accountId
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
    config: AxiosRequestConfig,
    retryAttempt = 0
  ): Promise<T | undefined> {
    const response = await this.client.request<T>({
      ...config,
      validateStatus: (status) => (status >= 200 && status < 300) || status === HttpStatusCode.TooManyRequests,
      headers: getChecklyAuthHeaders(connection)
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
        return this.getVariables(connection, 1, 1);
      default:
        throw new Error(`Unsupported Checkly connection method`);
    }
  }

  async getVariables(connection: TChecklyConnectionConfig, limit: number = 50, page: number = 1) {
    const res = await this.send<TChecklyVariable[]>(connection, {
      method: "GET",
      url: `/v1/variables`,
      params: {
        limit,
        page
      }
    });

    return res;
  }

  async createVariable(connection: TChecklyConnectionConfig, variable: TChecklyVariable) {
    const res = await this.send<TChecklyVariable>(connection, {
      method: "POST",
      url: `/v1/variables`,
      data: variable
    });

    return res;
  }

  async updateVariable(connection: TChecklyConnectionConfig, variable: TChecklyVariable) {
    const res = await this.send<TChecklyVariable>(connection, {
      method: "PUT",
      url: `/v1/variables`,
      data: variable
    });

    return res;
  }

  async getVariable(connection: TChecklyConnectionConfig, variable: Pick<TChecklyVariable, "key">) {
    try {
      const res = await this.send<TChecklyVariable>(connection, {
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

  async upsertVariable(connection: TChecklyConnectionConfig, variable: TChecklyVariable) {
    const res = await this.getVariable(connection, variable);

    if (!res) {
      return this.createVariable(connection, variable);
    }

    return res;
  }

  async deleteVariable(connection: TChecklyConnectionConfig, variable: Pick<TChecklyVariable, "key">) {
    try {
      const res = await this.send<TChecklyVariable>(connection, {
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
}

export const ChecklyPublicAPI = new ChecklyPublicClient();
