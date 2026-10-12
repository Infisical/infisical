import type { PeerCertificate } from "node:tls";

import { describe, expect, test } from "vitest";

import { getTlsServerNameOptions, stripIpv6Brackets } from "./index";

const certFor = (subjectaltname: string) => ({ subject: { CN: "test" }, subjectaltname }) as unknown as PeerCertificate;

describe("stripIpv6Brackets", () => {
  test("strips the brackets URL.hostname keeps around an IPv6 literal", () => {
    expect(stripIpv6Brackets("[2001:db8::1]")).toBe("2001:db8::1");
  });

  test.each(["10.0.0.5", "2001:db8::1", "vault.example.com", "localhost"])("leaves %s unchanged", (host) => {
    expect(stripIpv6Brackets(host)).toBe(host);
  });
});

describe("getTlsServerNameOptions", () => {
  test("passes a hostname through as servername", () => {
    expect(getTlsServerNameOptions("vault.example.com")).toEqual({ servername: "vault.example.com" });
  });

  test("returns an undefined servername when there is no host", () => {
    expect(getTlsServerNameOptions(undefined)).toEqual({ servername: undefined });
    expect(getTlsServerNameOptions("")).toEqual({ servername: "" });
  });

  test.each(["10.0.0.5", "2001:db8::1", "[2001:db8::1]"])("never sets servername for the IP %s", (host) => {
    const options = getTlsServerNameOptions(host);
    // Present but undefined, so a driver that defaults a missing servername to the host leaves it alone.
    expect(options).toHaveProperty("servername", undefined);
    expect(options.checkServerIdentity).toBeTypeOf("function");
  });

  test("verifies an IPv4 host against the certificate, ignoring the dialed hostname", () => {
    const { checkServerIdentity } = getTlsServerNameOptions("10.0.0.5");
    expect(checkServerIdentity?.("localhost", certFor("IP Address:10.0.0.5"))).toBeUndefined();
    expect(checkServerIdentity?.("localhost", certFor("IP Address:10.0.0.6"))).toBeInstanceOf(Error);
    expect(checkServerIdentity?.("localhost", certFor("DNS:localhost"))).toBeInstanceOf(Error);
  });

  test("verifies a bracketed IPv6 host against the bare address in the certificate", () => {
    const { checkServerIdentity } = getTlsServerNameOptions("[2001:db8::1]");
    expect(checkServerIdentity?.("localhost", certFor("IP Address:2001:db8::1"))).toBeUndefined();
    expect(checkServerIdentity?.("localhost", certFor("IP Address:2001:db8::2"))).toBeInstanceOf(Error);
  });
});
