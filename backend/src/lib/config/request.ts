import axios, { AxiosError, AxiosInstance, AxiosResponse, CreateAxiosDefaults } from "axios";
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

    customLogger.info(
      { url: `${response.config.method || "NO_METHOD"} ${response.config.url}`, responseSize },
      `Intercepted axios response ${megabyteSize}`
    );
  } catch (error) {
    customLogger.error(error, "Error intercepting axios response");
  }

  return response;
}

export const isRetryableRequestError = (error: AxiosError): boolean =>
  error.response?.status === 429 || axiosRetry.isNetworkError(error) || axiosRetry.isRetryableError(error);

export const REQUEST_RETRY_CONFIG = {
  retries: 3,
  // eslint-disable-next-line
  retryDelay: axiosRetry.exponentialDelay
};

export function createRequestClient(defaults: CreateAxiosDefaults = {}, retry: IAxiosRetryConfig = {}): AxiosInstance {
  const client = axios.create({ ...defaults, maxRedirects: 0 });

  client.interceptors.response.use((response) => axiosResponseInterceptor(response, logger));

  axiosRetry(client, {
    ...REQUEST_RETRY_CONFIG,
    retryCondition: isRetryableRequestError,
    ...retry
  });

  return client;
}

export const request = createRequestClient();
