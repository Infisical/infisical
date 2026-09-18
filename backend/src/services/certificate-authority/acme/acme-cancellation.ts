import { AsyncLocalStorage } from "node:async_hooks";

import acme from "acme-client";

import { logger } from "@app/lib/logger";

const acmeCancellationStorage = new AsyncLocalStorage<{ signal: AbortSignal }>();

let interceptorInstalled = false;

const installInterceptor = () => {
  if (interceptorInstalled) return;
  interceptorInstalled = true;
  acme.axios.interceptors.request.use((config) => {
    const store = acmeCancellationStorage.getStore();
    if (store?.signal && !config.signal) {
      // eslint-disable-next-line no-param-reassign
      config.signal = store.signal;
    }
    return config;
  });
  logger.info("ACME axios cancellation interceptor installed");
};

export const runWithAcmeCancellation = <T>(signal: AbortSignal | undefined, fn: () => Promise<T>): Promise<T> => {
  if (!signal) return fn();
  installInterceptor();
  return acmeCancellationStorage.run({ signal }, fn);
};
