/* eslint-disable no-await-in-loop */
/* eslint-disable class-methods-use-this */
import { AxiosRequestConfig, AxiosResponse, HttpStatusCode } from "axios";

import { delay } from "@app/lib/delay";
import { removeTrailingSlash } from "@app/lib/fn";
import { safeRequest } from "@app/lib/validator";

import { SupabaseConnectionMethod } from "./supabase-connection-constants";
import { TSupabaseConnectionConfig, TSupabaseProject, TSupabaseSecret } from "./supabase-connection-types";

export const getSupabaseInstanceUrl = (config: TSupabaseConnectionConfig): string => {
  return config.credentials.instanceUrl
    ? removeTrailingSlash(config.credentials.instanceUrl)
    : "https://api.supabase.com";
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
  // Route every Supabase API call through `safeRequest.request` so the
  // (potentially self-hosted) instance URL is SSRF-validated and DNS-pinned
  // per call. The headers/content-type are set per-request rather than
  // baked into a long-lived client.
  async send<T>(
    connection: TSupabaseConnectionConfig,
    config: AxiosRequestConfig,
    retryAttempt = 0
  ): Promise<T | undefined> {
    const response = await safeRequest.request<T>({
      ...config,
      baseURL: getSupabaseInstanceUrl(connection),
      url: config.url ?? "",
      validateStatus: (status) => (status >= 200 && status < 300) || status === HttpStatusCode.TooManyRequests,
      headers: {
        "Content-Type": "application/json",
        ...config.headers,
        ...getSupabaseAuthHeaders(connection)
      }
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
}

export const SupabasePublicAPI = new SupabasePublicClient();
