/* eslint-disable no-await-in-loop */

import { describe, expect, it } from "vitest";

import { KeyStorePrefixes } from "@app/keystore/keystore";

import { releasePkiSyncConcurrency, tryAdmitPkiSyncConcurrency } from "./pki-sync-concurrency-fns";
import {
  PKI_SYNC_CONNECTION_AGGREGATE_CONCURRENCY_LIMIT,
  PKI_SYNC_CONNECTION_CONCURRENCY_LIMIT
} from "./pki-sync-enums";

const buildKeyStore = () => {
  const counts = new Map<string, number>();

  return {
    counts,
    incrementByAndRefreshExpiryIfUnderLimit: async (key: string, limit: number) => {
      const next = (counts.get(key) ?? 0) + 1;
      if (next > limit) return -1;
      counts.set(key, next);
      return next;
    },
    decrementByOrDelete: async (key: string) => {
      const next = (counts.get(key) ?? 0) - 1;
      if (next <= 0) counts.delete(key);
      else counts.set(key, next);
      return next;
    }
  };
};

const CONNECTION = "connection-1";
const aggregateKey = KeyStorePrefixes.AppConnectionConcurrentJobs(CONNECTION);

describe("pki sync connection concurrency", () => {
  it("caps a single host at the per-host limit", async () => {
    const keyStore = buildKeyStore();

    for (let i = 0; i < PKI_SYNC_CONNECTION_CONCURRENCY_LIMIT; i += 1) {
      expect(await tryAdmitPkiSyncConcurrency(keyStore, CONNECTION, "host-a")).toBe(true);
    }
    expect(await tryAdmitPkiSyncConcurrency(keyStore, CONNECTION, "host-a")).toBe(false);
  });

  it("caps the connection across every host it backs", async () => {
    const keyStore = buildKeyStore();
    let admitted = 0;

    for (let host = 0; host < 50; host += 1) {
      for (let job = 0; job < PKI_SYNC_CONNECTION_CONCURRENCY_LIMIT; job += 1) {
        if (await tryAdmitPkiSyncConcurrency(keyStore, CONNECTION, `host-${host}`)) admitted += 1;
      }
    }

    expect(admitted).toBe(PKI_SYNC_CONNECTION_AGGREGATE_CONCURRENCY_LIMIT);
  });

  it("does not consume an aggregate slot when the per-host limit refuses", async () => {
    const keyStore = buildKeyStore();

    for (let i = 0; i < PKI_SYNC_CONNECTION_CONCURRENCY_LIMIT; i += 1) {
      await tryAdmitPkiSyncConcurrency(keyStore, CONNECTION, "host-a");
    }
    const aggregateBefore = keyStore.counts.get(aggregateKey);

    expect(await tryAdmitPkiSyncConcurrency(keyStore, CONNECTION, "host-a")).toBe(false);
    expect(keyStore.counts.get(aggregateKey)).toBe(aggregateBefore);
  });

  it("releases both tiers so slots are reusable", async () => {
    const keyStore = buildKeyStore();

    await tryAdmitPkiSyncConcurrency(keyStore, CONNECTION, "host-a");
    await releasePkiSyncConcurrency(keyStore, CONNECTION, "host-a");

    expect(keyStore.counts.size).toBe(0);
  });

  it("keeps one tier for a hosted sync, where the connection key is the host key", async () => {
    const keyStore = buildKeyStore();

    for (let i = 0; i < PKI_SYNC_CONNECTION_CONCURRENCY_LIMIT; i += 1) {
      expect(await tryAdmitPkiSyncConcurrency(keyStore, CONNECTION)).toBe(true);
    }
    expect(await tryAdmitPkiSyncConcurrency(keyStore, CONNECTION)).toBe(false);
    expect(keyStore.counts.get(aggregateKey)).toBe(PKI_SYNC_CONNECTION_CONCURRENCY_LIMIT);
  });
});
