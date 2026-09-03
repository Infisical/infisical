import { describe, expect, it } from "vitest";

import { ForbiddenRequestError } from "../errors";
import { checkIPAgainstBlocklist, IPType, parseTrustedProxyCidrs } from "./index";

describe("parseTrustedProxyCidrs", () => {
  it("returns undefined for empty input", () => {
    expect(parseTrustedProxyCidrs(undefined)).toBeUndefined();
    expect(parseTrustedProxyCidrs("")).toBeUndefined();
    expect(parseTrustedProxyCidrs("  ,  ")).toBeUndefined();
  });

  it("trims entries and preserves aliases", () => {
    expect(parseTrustedProxyCidrs(" uniquelocal , loopback ")).toBe("uniquelocal,loopback");
  });

  it("accepts IPs and CIDRs", () => {
    expect(parseTrustedProxyCidrs("10.0.0.0/8,172.16.0.5")).toBe("10.0.0.0/8,172.16.0.5");
  });

  it("rejects invalid entries", () => {
    expect(() => parseTrustedProxyCidrs("not-a-cidr")).toThrow(/Invalid TRUSTED_PROXY_CIDRS entry 'not-a-cidr'/);
  });
});

describe("checkIPAgainstBlocklist", () => {
  it("allows matching IPs", () => {
    expect(() =>
      checkIPAgainstBlocklist({
        ipAddress: "192.168.100.20",
        trustedIps: [{ ipAddress: "192.168.100.0", prefix: 24, type: IPType.IPV4 }]
      })
    ).not.toThrow();
  });

  it("rejects non-matching IPs with the detected address and remediation hint", () => {
    expect(() =>
      checkIPAgainstBlocklist({
        ipAddress: "192.168.200.20",
        trustedIps: [{ ipAddress: "192.168.100.0", prefix: 24, type: IPType.IPV4 }]
      })
    ).toThrow(ForbiddenRequestError);

    try {
      checkIPAgainstBlocklist({
        ipAddress: "192.168.200.20",
        trustedIps: [{ ipAddress: "192.168.100.0", prefix: 24, type: IPType.IPV4 }]
      });
    } catch (err) {
      expect(err).toBeInstanceOf(ForbiddenRequestError);
      expect((err as ForbiddenRequestError).message).toContain("192.168.200.20");
      expect((err as ForbiddenRequestError).message).toContain("TRUSTED_PROXY_CIDRS");
      expect((err as ForbiddenRequestError).message).toContain("Client Secret Trusted IPs");
    }
  });
});
