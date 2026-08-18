import { AsyncLocalStorage } from "node:async_hooks";

export type TGatewayAttempt = {
  transportFailed: boolean;
  tunnelEstablished: boolean;
};

const storage = new AsyncLocalStorage<TGatewayAttempt>();

/**
 * Records that the tunnel to a gateway could never be established, so the target saw nothing and
 * the work can safely move to another pool member.
 *
 * This is a side channel rather than an error type because nearly every app-connection provider
 * catches whatever the gateway layer throws and rewraps it in its own BadRequestError ("Unable to
 * validate connection: ..."), which destroys any marker carried on the exception. The flag lives in
 * async-local storage so it stays scoped to one attempt and concurrent requests to the same gateway
 * cannot see each other's failures, which would otherwise let a target-side error trigger a retry.
 */
export const runGatewayAttempt = async <T>(attempt: TGatewayAttempt, fn: () => Promise<T>): Promise<T> =>
  storage.run(attempt, fn);

export const markAttemptTransportFailure = () => {
  const attempt = storage.getStore();
  if (attempt) attempt.transportFailed = true;
};

/**
 * Once any tunnel in this attempt comes up, the target may have been reached, so the attempt is no
 * longer safe to replay even if an earlier tunnel in the same attempt failed and was swallowed.
 */
export const markAttemptTunnelEstablished = () => {
  const attempt = storage.getStore();
  if (attempt) attempt.tunnelEstablished = true;
};
