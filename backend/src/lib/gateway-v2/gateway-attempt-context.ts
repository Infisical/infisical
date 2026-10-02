import { AsyncLocalStorage } from "node:async_hooks";

export type TGatewayAttempt = {
  transportFailed: boolean;
  tunnelEstablished: boolean;
};

const storage = new AsyncLocalStorage<TGatewayAttempt>();

/**
 * A side channel rather than an error type, because providers rewrap whatever the gateway layer
 * throws and destroy any marker on the exception. Async-local so one attempt cannot see another's.
 */
export const runGatewayAttempt = async <T>(attempt: TGatewayAttempt, fn: () => Promise<T>): Promise<T> =>
  storage.run(attempt, fn);

export const markAttemptTransportFailure = () => {
  const attempt = storage.getStore();
  if (attempt) attempt.transportFailed = true;
};

/** Once any tunnel comes up the target may have been reached, so the attempt is not replayable. */
export const markAttemptTunnelEstablished = () => {
  const attempt = storage.getStore();
  if (attempt) attempt.tunnelEstablished = true;
};
