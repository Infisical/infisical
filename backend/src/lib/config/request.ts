import axios, { AxiosInstance, CreateAxiosDefaults } from "axios";
import axiosRetry, { IAxiosRetryConfig } from "axios-retry";

export function createRequestClient(defaults: CreateAxiosDefaults = {}, retry: IAxiosRetryConfig = {}): AxiosInstance {
  const client = axios.create(defaults);

  axiosRetry(client, {
    retries: 3,
    // eslint-disable-next-line
    retryDelay: axiosRetry.exponentialDelay,
    retryCondition: (err) => axiosRetry.isNetworkError(err) || axiosRetry.isRetryableError(err),
    ...retry
  });

  return client;
}

export const request = createRequestClient();
