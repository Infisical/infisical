import { KeyStorePrefixes, KeyStoreTtls, TKeyStoreFactory } from "@app/keystore/keystore";
import { logger } from "@app/lib/logger";

import { BACKFILL_STALE_AFTER_MS, isUsableRunState } from "./secret-value-tracking-fns";
import { TBackfillRunState } from "./secret-value-tracking-types";

type TSecretValueTrackingStateFactoryDep = {
  keyStore: Pick<TKeyStoreFactory, "getItemPrimary" | "setItemWithExpiry" | "setItemWithExpiryNX" | "deleteItem">;
};

export const secretValueTrackingStateFactory = ({ keyStore }: TSecretValueTrackingStateFactoryDep) => {
  // Reads the primary rather than a replica: a chunk writes its cursor immediately before queueing
  // its successor, so a replica read can hand the next chunk the cursor it already worked through.
  const read = async (scopeId: string): Promise<TBackfillRunState | null> => {
    const raw = await keyStore.getItemPrimary(KeyStorePrefixes.SecretValueTrackingBackfill(scopeId));
    if (!raw) return null;

    try {
      // An unreadable key means no run in progress, which the status endpoint can answer, rather
      // than an exception it cannot.
      const parsed: unknown = JSON.parse(raw);
      return isUsableRunState(parsed) ? parsed : null;
    } catch (error) {
      logger.warn(error, `Secret value tracking backfill state unreadable [scopeId=${scopeId}]`);
      return null;
    }
  };

  const write = async (scopeId: string, state: TBackfillRunState) => {
    await keyStore.setItemWithExpiry(
      KeyStorePrefixes.SecretValueTrackingBackfill(scopeId),
      KeyStoreTtls.SecretValueTrackingBackfillInSeconds,
      JSON.stringify(state)
    );
  };

  const clear = async (scopeId: string) => {
    await keyStore.deleteItem(KeyStorePrefixes.SecretValueTrackingBackfill(scopeId));
  };

  const isStalled = (state: TBackfillRunState) => {
    // A finished run holds the key only to keep its counters readable, so it never blocks a new one.
    if (state.status === "failed" || state.status === "completed") return true;
    const lastProgress = new Date(state.lastProgressAt).getTime();
    return Number.isNaN(lastProgress) || Date.now() - lastProgress > BACKFILL_STALE_AFTER_MS;
  };

  // Taking over a stalled run keeps its cursor, so retrying a backfill that died hours ago resumes
  // instead of walking the whole scope again.
  const claim = async (scopeId: string, projectsTotal: number) => {
    const fresh: TBackfillRunState = {
      status: "running",
      cursor: null,
      projectsTotal,
      projectsDone: 0,
      secretsProcessed: 0,
      lastProgressAt: new Date().toISOString()
    };

    const claimed = await keyStore.setItemWithExpiryNX(
      KeyStorePrefixes.SecretValueTrackingBackfill(scopeId),
      KeyStoreTtls.SecretValueTrackingBackfillInSeconds,
      JSON.stringify(fresh)
    );
    if (claimed) return true;

    const existing = await read(scopeId);
    if (!existing) {
      await write(scopeId, fresh);
      return true;
    }

    if (!isStalled(existing)) return false;

    await write(scopeId, {
      ...fresh,
      cursor: existing.cursor,
      projectsDone: existing.projectsDone,
      secretsProcessed: existing.secretsProcessed
    });
    return true;
  };

  return { read, write, clear, claim };
};

export type TSecretValueTrackingStateFactory = ReturnType<typeof secretValueTrackingStateFactory>;
