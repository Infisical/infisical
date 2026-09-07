import { HEARTBEAT_BUFFER_SECONDS, isTransportHealthy, resolveTransports } from "./gateway-v2-constants";

const secondsAgo = (seconds: number) => new Date(Date.now() - seconds * 1000);
const TTL = 180;
const fresh = secondsAgo(TTL - 60);
const stale = secondsAgo(TTL + HEARTBEAT_BUFFER_SECONDS + 60);

describe("isTransportHealthy", () => {
  test("a never-probed transport is usable, so a freshly registered gateway is not locked out", () => {
    expect(isTransportHealthy({ probedAt: null, heartbeatTTL: TTL })).toBe(true);
    expect(isTransportHealthy({ probedAt: undefined, heartbeatTTL: TTL })).toBe(true);
  });

  test("a probe inside the TTL window is usable", () => {
    expect(isTransportHealthy({ probedAt: fresh, heartbeatTTL: TTL })).toBe(true);
  });

  test("the buffer extends the window, so a probe that is barely late still counts", () => {
    expect(isTransportHealthy({ probedAt: secondsAgo(TTL + HEARTBEAT_BUFFER_SECONDS - 5), heartbeatTTL: TTL })).toBe(
      true
    );
  });

  test("a probe past the TTL plus buffer is stale", () => {
    expect(isTransportHealthy({ probedAt: stale, heartbeatTTL: TTL })).toBe(false);
  });

  test("TTL 0 is the kill switch set when every transport fails, so nothing is usable", () => {
    expect(isTransportHealthy({ probedAt: new Date(), heartbeatTTL: 0 })).toBe(false);
    expect(isTransportHealthy({ probedAt: null, heartbeatTTL: 0 })).toBe(false);
  });
});

describe("resolveTransports", () => {
  const direct = { directAddress: "gw.internal:8443", relayId: null, heartbeatTTL: TTL };
  const relay = { directAddress: null, relayId: "relay-1", heartbeatTTL: TTL };
  const dual = { directAddress: "gw.internal:8443", relayId: "relay-1", heartbeatTTL: TTL };

  test("a direct-only gateway dials direct", () => {
    expect(resolveTransports({ gateway: { ...direct, directHeartbeat: fresh } })).toEqual({
      useDirect: true,
      useRelay: false,
      hasTransport: true
    });
  });

  test("a direct-only gateway still dials direct on a stale probe, since there is nothing else", () => {
    expect(resolveTransports({ gateway: { ...direct, directHeartbeat: stale } })).toMatchObject({
      useDirect: true,
      hasTransport: true
    });
  });

  test("a relay-only gateway dials the relay", () => {
    expect(resolveTransports({ gateway: { ...relay, directHeartbeat: null } })).toEqual({
      useDirect: false,
      useRelay: true,
      hasTransport: true
    });
  });

  test("a gateway with neither transport has nothing to dial", () => {
    expect(
      resolveTransports({ gateway: { directAddress: null, relayId: null, heartbeatTTL: null, directHeartbeat: null } })
    ).toMatchObject({ hasTransport: false });
  });

  // The bug this covers: a dual gateway was handed direct with no relay credentials, so a broken
  // direct address failed every operation instead of falling back.
  test("a healthy dual gateway prefers direct but carries relay credentials for the fallback", () => {
    expect(resolveTransports({ gateway: { ...dual, directHeartbeat: fresh } })).toEqual({
      useDirect: true,
      useRelay: true,
      hasTransport: true
    });
  });

  test("a dual gateway whose direct probe went stale drops to the relay", () => {
    expect(resolveTransports({ gateway: { ...dual, directHeartbeat: stale } })).toEqual({
      useDirect: false,
      useRelay: true,
      hasTransport: true
    });
  });

  test("a dual gateway not yet probed on direct still tries it, and keeps the relay in reserve", () => {
    expect(resolveTransports({ gateway: { ...dual, directHeartbeat: null } })).toEqual({
      useDirect: true,
      useRelay: true,
      hasTransport: true
    });
  });

  describe("an explicit transport is honoured, because a health probe has to target one path", () => {
    test("direct is used even when its own probe is stale", () => {
      expect(resolveTransports({ gateway: { ...dual, directHeartbeat: stale }, transport: "direct" })).toEqual({
        useDirect: true,
        useRelay: false,
        hasTransport: true
      });
    });

    test("relay is used even when direct is healthy", () => {
      expect(resolveTransports({ gateway: { ...dual, directHeartbeat: fresh }, transport: "relay" })).toEqual({
        useDirect: false,
        useRelay: true,
        hasTransport: true
      });
    });

    test("asking for direct on a relay-only gateway leaves nothing to dial", () => {
      expect(
        resolveTransports({ gateway: { ...relay, directHeartbeat: null }, transport: "direct" })
      ).toMatchObject({ useDirect: false, hasTransport: false });
    });
  });

  test("the TTL kill switch drops a dual gateway to its relay", () => {
    expect(resolveTransports({ gateway: { ...dual, directHeartbeat: fresh, heartbeatTTL: 0 } })).toEqual({
      useDirect: false,
      useRelay: true,
      hasTransport: true
    });
  });
});
