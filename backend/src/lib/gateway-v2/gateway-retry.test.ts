import { isAttemptRetryable, isGatewayTransportFailure } from "./gateway-retry";

const RELAY_ERR = "TLS connection error: ECONNREFUSED";

describe("isGatewayTransportFailure", () => {
  test("retryable when a channel failed to come up and none ever did", () => {
    expect(isGatewayTransportFailure({ relayError: RELAY_ERR, establishedChannel: false })).toBe(true);
  });

  test("not retryable once a channel came up, even with a relay error recorded", () => {
    // The bug this guards: relayError accumulates across every channel a proxy serves and is never
    // cleared, so one transient setup blip would otherwise mark a later target-side failure (a
    // half-applied rotation) as safe to replay on another member.
    expect(isGatewayTransportFailure({ relayError: RELAY_ERR, establishedChannel: true })).toBe(false);
  });

  test("not retryable with no relay error at all", () => {
    expect(isGatewayTransportFailure({ relayError: "", establishedChannel: false })).toBe(false);
    expect(isGatewayTransportFailure({ relayError: "", establishedChannel: true })).toBe(false);
  });

  test("several accumulated relay errors are still only retryable if nothing established", () => {
    const many = [RELAY_ERR, RELAY_ERR].join(",");
    expect(isGatewayTransportFailure({ relayError: many, establishedChannel: false })).toBe(true);
    expect(isGatewayTransportFailure({ relayError: many, establishedChannel: true })).toBe(false);
  });
});

describe("isAttemptRetryable", () => {
  const attempt = (o: Partial<Parameters<typeof isAttemptRetryable>[0]>) =>
    isAttemptRetryable({ transportFailed: false, tunnelEstablished: false, isTransportError: false, ...o });

  test("retryable when the async-local flag says no tunnel came up", () => {
    expect(attempt({ transportFailed: true })).toBe(true);
  });

  test("retryable when the error type says so, for callers that do not rewrap", () => {
    expect(attempt({ isTransportError: true })).toBe(true);
  });

  test("not retryable once any tunnel in the attempt came up", () => {
    // The sticky-flag bug: an early tunnel fails and is swallowed by provider code, a later one
    // reaches the target and fails there. Replaying would apply the change twice.
    expect(attempt({ transportFailed: true, tunnelEstablished: true })).toBe(false);
    expect(attempt({ isTransportError: true, tunnelEstablished: true })).toBe(false);
    expect(attempt({ transportFailed: true, isTransportError: true, tunnelEstablished: true })).toBe(false);
  });

  test("not retryable for a plain target-side failure", () => {
    // e.g. "password authentication failed" wrapped in a provider's own BadRequestError
    expect(attempt({})).toBe(false);
    expect(attempt({ tunnelEstablished: true })).toBe(false);
  });

  test("tunnelEstablished overrides every retryable signal", () => {
    for (const transportFailed of [true, false]) {
      for (const isTransportError of [true, false]) {
        expect(attempt({ transportFailed, isTransportError, tunnelEstablished: true })).toBe(false);
      }
    }
  });
});
