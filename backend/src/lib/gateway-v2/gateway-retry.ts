/**
 * When a failed gateway operation may be replayed on another pool member.
 *
 * The rule both helpers enforce is the same: retry only when nothing can have reached the target.
 * A half-applied change (a password rotation, a write) replayed on a second member would apply
 * twice, so anything that might have got through is not retryable no matter what it looks like.
 */

/**
 * Per proxy. `relayError` is non-empty once any channel this proxy served failed to come up, and it
 * is never cleared, so on its own it stays true for the rest of the proxy's life. Requiring that no
 * channel ever established is what stops a single transient setup failure from marking every later
 * target-side error as safe to replay.
 */
export const isGatewayTransportFailure = ({
  relayError,
  establishedChannel
}: {
  relayError: string;
  establishedChannel: boolean;
}): boolean => Boolean(relayError) && !establishedChannel;

/**
 * Per attempt, across however many tunnels the caller's operation opened. An early tunnel can fail
 * and be swallowed by provider code while a later one reaches the target, so a transport failure
 * alone is not enough: no tunnel in the attempt may have come up.
 */
export const isAttemptRetryable = ({
  transportFailed,
  tunnelEstablished,
  isTransportError
}: {
  transportFailed: boolean;
  tunnelEstablished: boolean;
  isTransportError: boolean;
}): boolean => (transportFailed || isTransportError) && !tunnelEstablished;
