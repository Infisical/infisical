import * as RealConstants from "../../src/ee/services/audit-log-stream-outbox/audit-log-stream-outbox-constants";

// Replaces the outbox's debounce and retry limit so a spec can watch a stream fail without waiting
// out the real timings (a 5s debounce, then five attempts spread over backoff). Wired up by
// test.alias in vitest.e2e.config.mts; nothing under src/ references this file.
//
// Defaults are the real values, so specs that do not ask for anything else see production
// behavior. The values are live bindings: the service reads them at call time, so a change made
// through the handle below applies to the next flush.
//
// The handle hangs off globalThis for the reason given in aws-parameter-store-sync-fns.ts.
/* eslint-disable import/no-mutable-exports -- a live binding is what lets the service see a change */
export let FLUSH_DEBOUNCE_MS = RealConstants.FLUSH_DEBOUNCE_MS as number;
export let MAX_ATTEMPTS = RealConstants.MAX_ATTEMPTS as number;
/* eslint-enable import/no-mutable-exports */

const globalScope = globalThis as typeof globalThis & {
  infisicalAuditLogStreamOutboxTuning?: {
    set: (opts: { flushDebounceMs?: number; maxAttempts?: number }) => void;
    reset: () => void;
  };
};

const reset = () => {
  FLUSH_DEBOUNCE_MS = RealConstants.FLUSH_DEBOUNCE_MS;
  MAX_ATTEMPTS = RealConstants.MAX_ATTEMPTS;
};

globalScope.infisicalAuditLogStreamOutboxTuning ??= {
  set: (opts) => {
    FLUSH_DEBOUNCE_MS = opts.flushDebounceMs ?? FLUSH_DEBOUNCE_MS;
    MAX_ATTEMPTS = opts.maxAttempts ?? MAX_ATTEMPTS;
  },
  reset
};

export const auditLogStreamOutboxTuning = {
  set: (opts: { flushDebounceMs?: number; maxAttempts?: number }) => {
    globalScope.infisicalAuditLogStreamOutboxTuning?.set(opts);
  },
  reset: () => {
    globalScope.infisicalAuditLogStreamOutboxTuning?.reset();
  }
};
