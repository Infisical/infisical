/**
 * Retry only when nothing can have reached the target. A half-applied change replayed on a second
 * member would apply twice.
 */

/** `relayError` is never cleared, so requiring that no channel established is what bounds it. */
export const isGatewayTransportFailure = ({
  relayError,
  establishedChannel
}: {
  relayError: string;
  establishedChannel: boolean;
}): boolean => Boolean(relayError) && !establishedChannel;

/** An early tunnel can fail while a later one reaches the target, so a transport failure alone is not enough. */
export const isAttemptRetryable = ({
  transportFailed,
  tunnelEstablished,
  isTransportError
}: {
  transportFailed: boolean;
  tunnelEstablished: boolean;
  isTransportError: boolean;
}): boolean => (transportFailed || isTransportError) && !tunnelEstablished;
