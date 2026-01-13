import axios, { AxiosInstance, AxiosResponse, CreateAxiosDefaults } from "axios";
import axiosRetry, { IAxiosRetryConfig } from "axios-retry";

import { CustomLogger, logger } from "../logger/logger";

export function axiosResponseInterceptor(response: AxiosResponse, customLogger: CustomLogger) {
  try {
    const contentLength = response.headers["content-length"] as string | undefined;
    const responseSize = contentLength ? parseInt(contentLength, 10) : 0;

    let megabyteSize = "";

    if (responseSize && responseSize > 1024 * 1024) {
      megabyteSize = `Large payload: ${(responseSize / 1024 / 1024).toFixed(2)} MB`;
    }

    customLogger.info({ url: response.config.url, responseSize }, `Intercepted axios response ${megabyteSize}`);
  } catch (error) {
    customLogger.error(error, "Error intercepting axios response");
  }

  return response;
}

export function createRequestClient(defaults: CreateAxiosDefaults = {}, retry: IAxiosRetryConfig = {}): AxiosInstance {
  const client = axios.create(defaults);

  client.interceptors.response.use((response) => axiosResponseInterceptor(response, logger));

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
