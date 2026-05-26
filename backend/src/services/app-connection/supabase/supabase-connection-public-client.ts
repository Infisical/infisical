/* eslint-disable no-await-in-loop */
/* eslint-disable class-methods-use-this */
import { AxiosInstance, AxiosRequestConfig, AxiosResponse, HttpStatusCode } from "axios";

import { createRequestClient } from "@app/lib/config/request";
import { delay } from "@app/lib/delay";
import { removeTrailingSlash } from "@app/lib/fn";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator";

import { SupabaseConnectionMethod } from "./supabase-connection-constants";
import { TSupabaseConnectionConfig, TSupabaseProject, TSupabaseSecret } from "./supabase-connection-types";

export const getSupabaseInstanceUrl = async (config: TSupabaseConnectionConfig) => {
  const instanceUrl = config.credentials.instanceUrl
    ? removeTrailingSlash(config.credentials.instanceUrl)
    : "https://api.supabase.com";

  await blockLocalAndPrivateIpAddresses(instanceUrl);

  return instanceUrl;
};

export function getSupabaseAuthHeaders(connection: TSupabaseConnectionConfig): Record<string, string> {
  switch (connection.method) {
    case SupabaseConnectionMethod.AccessToken:
      return {
        Authorization: `Bearer ${connection.credentials.accessKey}`
      };
    default:
      throw new Error(`Unsupported Supabase connection method`);
  }
}

export function getSupabaseRatelimiter(response: AxiosResponse): {
  maxAttempts: number;
  isRatelimited: boolean;
  wait: () => Promise<void>;
} {
  const wait = () => {
    return delay(60 * 1000);
  };

  return {
    isRatelimited: response.status === HttpStatusCode.TooManyRequests,
    wait,
    maxAttempts: 3
  };
}

class SupabasePublicClient {
  private client: AxiosInstance;

  constructor() {
    this.client = createRequestClient({
      headers: {
        "Content-Type": "application/json"
      }
    });
  }

  async send<T>(
    connection: TSupabaseConnectionConfig,
    config: AxiosRequestConfig,
    retryAttempt = 0
  ): Promise<T | undefined> {
    const response = await this.client.request<T>({
      ...config,
      baseURL: await getSupabaseInstanceUrl(connection),
      validateStatus: (status) => (status >= 200 && status < 300) || status === HttpStatusCode.TooManyRequests,
      headers: getSupabaseAuthHeaders(connection)
    });

    const limiter = getSupabaseRatelimiter(response);

    if (limiter.isRatelimited && retryAttempt <= limiter.maxAttempts) {
      await limiter.wait();
      return this.send(connection, config, retryAttempt + 1);
    }

    return response.data;
  }

  async healthcheck(connection: TSupabaseConnectionConfig) {
    switch (connection.method) {
      case SupabaseConnectionMethod.AccessToken:
        return void (await this.getProjects(connection));
      default:
        throw new Error(`Unsupported Supabase connection method`);
    }
  }

  async getVariables(connection: TSupabaseConnectionConfig, projectRef: string) {
    const res = await this.send<TSupabaseSecret[]>(connection, {
      method: "GET",
      url: `/v1/projects/${projectRef}/secrets`
    });

    return res;
  }

  // Supabase does not support updating variables directly
  // Instead, just call create again with the same key and it will overwrite the existing variable
  async createVariables(connection: TSupabaseConnectionConfig, projectRef: string, ...variables: TSupabaseSecret[]) {
    const res = await this.send<TSupabaseSecret>(connection, {
      method: "POST",
      url: `/v1/projects/${projectRef}/secrets`,
      data: variables
    });

    return res;
  }

  async deleteVariables(connection: TSupabaseConnectionConfig, projectRef: string, ...variables: string[]) {
    const res = await this.send(connection, {
      method: "DELETE",
      url: `/v1/projects/${projectRef}/secrets`,
      data: variables
    });

    return res;
  }

  async getProjects(connection: TSupabaseConnectionConfig) {
    const res = await this.send<TSupabaseProject[]>(connection, {
      method: "GET",
      url: `/v1/projects`
    });

    return res;
  }

  async getProjectBranches(connection: TSupabaseConnectionConfig, projectId: string) {
    const res = await this.send<{ branches: string[] }>(connection, {
      method: "GET",
      url: `/v1/projects/${projectId}/branches`
    });

    return res;
  }
}

export const SupabasePublicAPI = new SupabasePublicClient();
