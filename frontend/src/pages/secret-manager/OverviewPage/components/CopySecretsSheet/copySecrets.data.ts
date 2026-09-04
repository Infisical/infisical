import { isAxiosError } from "axios";

import type { TSecretMetadataPage } from "@app/hooks/api/dashboard/types";

import type { CopySecretsSource } from "./copySecrets.types";

export const getCopySecretsRetryDelay = (error: unknown, now = Date.now()) => {
  if (!isAxiosError(error) || error.response?.status !== 429) return null;
  const retryAfter = error.response.headers["retry-after"];
  if (typeof retryAfter === "string" && retryAfter.trim()) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) return Math.max(0, date - now);
  }
  // The API's default rate-limit window is one minute.
  return 60_000;
};

const waitForRetry = (delay: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    signal?.throwIfAborted();
    let timer: ReturnType<typeof setTimeout>;
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, delay);
    signal?.addEventListener("abort", onAbort, { once: true });
  });

export const fetchCopySecrets = async (
  fetchPage: (offset: number, limit: number) => Promise<TSecretMetadataPage>,
  signal?: AbortSignal
) => {
  const secrets = new Map<string, CopySecretsSource>();
  const loadPage = async (offset: number, attempt = 0): Promise<TSecretMetadataPage> => {
    signal?.throwIfAborted();
    try {
      return await fetchPage(offset, 500);
    } catch (error) {
      signal?.throwIfAborted();
      const rateLimitDelay = getCopySecretsRetryDelay(error);
      const status = isAxiosError(error) ? error.response?.status : undefined;
      if (rateLimitDelay !== null && attempt < 3) {
        await waitForRetry(rateLimitDelay, signal);
      } else if (rateLimitDelay === null && (!status || status >= 500) && attempt < 1) {
        await waitForRetry(1000, signal);
      } else {
        throw error;
      }
      return loadPage(offset, attempt + 1);
    }
  };

  let offset = 0;
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const page = await loadPage(offset);
    signal?.throwIfAborted();
    page.secrets.forEach((secret) => {
      secrets.set(secret.id, {
        id: secret.id,
        name: secret.secretKey,
        path: secret.secretPath,
        isValueHidden: secret.secretValueHidden,
        isHoneyToken: secret.isHoneyTokenSecret,
        isRotated: secret.isRotatedSecret
      });
    });
    if (page.nextOffset === null) return [...secrets.values()];
    if (!Number.isSafeInteger(page.nextOffset) || page.nextOffset <= offset) {
      throw new Error("Couldn't finish loading secrets. Please try again.");
    }
    // An empty page can still have a successor when its rows were restricted.
    offset = page.nextOffset;
  }
};
