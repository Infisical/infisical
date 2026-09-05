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
  fetchPage: (cursor: string | undefined, limit: number) => Promise<TSecretMetadataPage>,
  signal?: AbortSignal
) => {
  const secrets = new Map<string, CopySecretsSource>();
  const loadPage = async (
    cursor: string | undefined,
    attempt = 0
  ): Promise<TSecretMetadataPage> => {
    signal?.throwIfAborted();
    try {
      return await fetchPage(cursor, 500);
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
      return loadPage(cursor, attempt + 1);
    }
  };

  let cursor: string | undefined;
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const page = await loadPage(cursor);
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
    if (page.nextCursor === null) return [...secrets.values()];
    if (
      typeof page.nextCursor !== "string" ||
      !page.nextCursor ||
      (cursor && page.nextCursor <= cursor)
    ) {
      throw new Error("Couldn't finish loading secrets. Please try again.");
    }
    cursor = page.nextCursor;
  }
};
