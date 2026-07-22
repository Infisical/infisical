import { getIpRange, isPrivateIp } from "./ipRange";

describe("isPrivateIp", () => {
  describe("IPv4-compatible IPv6 (::/96)", () => {
    // Deprecated ::a.b.c.d form (RFC 4291 2.5.5.1) embeds IPv4 in the low 32 bits.
    // These must not be treated as public, otherwise they bypass SSRF checks.
    test("blocks ::127.0.0.1 (loopback)", () => {
      expect(isPrivateIp("::7f00:1")).toBe(true);
    });

    test("blocks ::169.254.169.254 (cloud metadata)", () => {
      expect(isPrivateIp("::a9fe:a9fe")).toBe(true);
    });

    test("blocks ::10.0.0.1 (private)", () => {
      expect(isPrivateIp("::a00:1")).toBe(true);
    });
  });

  describe("other IPv4-in-IPv6 embeddings remain blocked", () => {
    test("IPv4-mapped ::ffff:127.0.0.1", () => {
      expect(isPrivateIp("::ffff:7f00:1")).toBe(true);
    });

    test("6to4 2002:7f00:1::", () => {
      expect(isPrivateIp("2002:7f00:1::")).toBe(true);
    });

    test("NAT64 64:ff9b::7f00:1", () => {
      expect(isPrivateIp("64:ff9b::7f00:1")).toBe(true);
    });
  });

  describe("IPv4 ranges", () => {
    test("loopback, link-local, private, unspecified are blocked", () => {
      expect(isPrivateIp("127.0.0.1")).toBe(true);
      expect(isPrivateIp("169.254.169.254")).toBe(true);
      expect(isPrivateIp("10.1.2.3")).toBe(true);
      expect(isPrivateIp("0.0.0.0")).toBe(true);
    });
  });

  describe("public addresses stay public", () => {
    test("public IPv4 and IPv6 are not private", () => {
      expect(isPrivateIp("8.8.8.8")).toBe(false);
      expect(isPrivateIp("2606:4700::1")).toBe(false);
    });

    test("the ::/96 rule does not swallow IPv4-mapped addresses", () => {
      // ::ffff:8.8.8.8 is outside ::/96, so the new rule leaves it to the
      // pre-existing ::ffff:0:0/96 (IPv4-mapped) classification.
      expect(getIpRange("::ffff:8.8.8.8")).toBe("ipv4Mapped");
    });
  });

  describe("range names", () => {
    test("public address resolves to unicast", () => {
      expect(getIpRange("1.1.1.1")).toBe("unicast");
    });

    test("::/96 does not shadow :: (unspecified) or ::1 (loopback)", () => {
      expect(getIpRange("::")).toBe("unspecified");
      expect(getIpRange("::1")).toBe("loopback");
    });
  });
});
