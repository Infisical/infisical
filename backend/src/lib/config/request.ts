import axios, { AxiosError, AxiosInstance, AxiosResponse, CreateAxiosDefaults, isAxiosError } from "axios";
import axiosRetry, { IAxiosRetryConfig } from "axios-retry";
import RE2 from "re2";

import { CustomLogger, logger } from "../logger/logger";
import { sanitizeUrlForLog } from "../logger/sanitize-url";

export function axiosResponseInterceptor(response: AxiosResponse, customLogger: CustomLogger) {
  try {
    const contentLength = response.headers["content-length"] as string | undefined;
    const responseSize = contentLength ? parseInt(contentLength, 10) : 0;

    let megabyteSize = "";

    if (responseSize && responseSize > 1024 * 1024) {
      megabyteSize = `Large payload: ${(responseSize / 1024 / 1024).toFixed(2)} MB`;
    }

    const url = sanitizeUrlForLog(response.config.url, response.config.baseURL);

    customLogger.info(
      { url: `${response.config.method || "NO_METHOD"} ${url}`, responseSize },
      `Intercepted axios response ${megabyteSize}`
    );
  } catch (error) {
    customLogger.error(error, "Error intercepting axios response");
  }

  return response;
}

// Axios quotes the requested URL, path included, in its "missing //" error message, and a
// path can carry a token (webhook URLs). Drop the quoted URL from the message; config still has it.
const QUOTED_INVALID_URL = new RE2('^Invalid URL "(?:[^"\\\\]|\\\\.)*"');

const withoutUrlInMessage = (err: unknown): unknown => {
  if (isAxiosError(err) && err.code === AxiosError.ERR_INVALID_URL && QUOTED_INVALID_URL.test(err.message)) {
    const message = err.message.replace(QUOTED_INVALID_URL, "Invalid URL");
    return new AxiosError(message, err.code, err.config, err.request, err.response);
  }
  return err;
};

export const isRetryableRequestError = (error: AxiosError): boolean =>
  error.response?.status === 429 || axiosRetry.isNetworkError(error) || axiosRetry.isRetryableError(error);

const REQUEST_RETRY_CONFIG = {
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

  client.interceptors.response.use(undefined, (err: unknown) => {
    throw withoutUrlInMessage(err);
  });

  return client;
}

export const request = createRequestClient();
