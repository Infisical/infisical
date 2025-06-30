import { extractIPDetails, IPType, isValidCidr, isValidIp, isValidIpOrCidr } from "./index";

describe("IP Validation", () => {
  describe("isValidIp", () => {
    test("should validate IPv4 addresses with ports", () => {
      expect(isValidIp("192.168.1.1:8080")).toBe(true);
      expect(isValidIp("10.0.0.1:1234")).toBe(true);
      expect(isValidIp("172.16.0.1:80")).toBe(true);
    });

    test("should validate IPv6 addresses with ports", () => {
      expect(isValidIp("[2001:db8::1]:8080")).toBe(true);
      expect(isValidIp("[fe80::1ff:fe23:4567:890a]:1234")).toBe(true);
      expect(isValidIp("[::1]:80")).toBe(true);
    });

    test("should validate regular IPv4 addresses", () => {
      expect(isValidIp("192.168.1.1")).toBe(true);
      expect(isValidIp("10.0.0.1")).toBe(true);
      expect(isValidIp("172.16.0.1")).toBe(true);
    });

    test("should validate regular IPv6 addresses", () => {
      expect(isValidIp("2001:db8::1")).toBe(true);
      expect(isValidIp("fe80::1ff:fe23:4567:890a")).toBe(true);
      expect(isValidIp("::1")).toBe(true);
    });

    test("should reject invalid IP addresses", () => {
      expect(isValidIp("256.256.256.256")).toBe(false);
      expect(isValidIp("192.168.1")).toBe(false);
      expect(isValidIp("192.168.1.1.1")).toBe(false);
      expect(isValidIp("2001:db8::1::1")).toBe(false);
      expect(isValidIp("invalid")).toBe(false);
    });

    test("should reject malformed IP addresses with ports", () => {
      expect(isValidIp("192.168.1.1:")).toBe(false);
      expect(isValidIp("192.168.1.1:abc")).toBe(false);
      expect(isValidIp("[2001:db8::1]")).toBe(false);
      expect(isValidIp("[2001:db8::1]:")).toBe(false);
      expect(isValidIp("[2001:db8::1]:abc")).toBe(false);
    });
  });

  describe("isValidCidr", () => {
    test("should validate IPv4 CIDR blocks", () => {
      expect(isValidCidr("192.168.1.0/24")).toBe(true);
      expect(isValidCidr("10.0.0.0/8")).toBe(true);
      expect(isValidCidr("172.16.0.0/16")).toBe(true);
    });

    test("should validate IPv6 CIDR blocks", () => {
      expect(isValidCidr("2001:db8::/32")).toBe(true);
      expect(isValidCidr("fe80::/10")).toBe(true);
      expect(isValidCidr("::/0")).toBe(true);
    });

    test("should reject invalid CIDR blocks", () => {
      expect(isValidCidr("192.168.1.0/33")).toBe(false);
      expect(isValidCidr("2001:db8::/129")).toBe(false);
      expect(isValidCidr("192.168.1.0/abc")).toBe(false);
      expect(isValidCidr("invalid/24")).toBe(false);
    });
  });

  describe("isValidIpOrCidr", () => {
    test("should validate both IP addresses and CIDR blocks", () => {
      expect(isValidIpOrCidr("192.168.1.1")).toBe(true);
      expect(isValidIpOrCidr("2001:db8::1")).toBe(true);
      expect(isValidIpOrCidr("192.168.1.0/24")).toBe(true);
      expect(isValidIpOrCidr("2001:db8::/32")).toBe(true);
    });

    test("should reject invalid inputs", () => {
      expect(isValidIpOrCidr("invalid")).toBe(false);
      expect(isValidIpOrCidr("192.168.1.0/33")).toBe(false);
      expect(isValidIpOrCidr("2001:db8::/129")).toBe(false);
    });
  });

  describe("extractIPDetails", () => {
    test("should extract IPv4 address details", () => {
      const result = extractIPDetails("192.168.1.1");
      expect(result).toEqual({
        ipAddress: "192.168.1.1",
        type: IPType.IPV4
      });
    });

    test("should extract IPv6 address details", () => {
      const result = extractIPDetails("2001:db8::1");
      expect(result).toEqual({
        ipAddress: "2001:db8::1",
        type: IPType.IPV6
      });
    });

    test("should extract IPv4 CIDR details", () => {
      const result = extractIPDetails("192.168.1.0/24");
      expect(result).toEqual({
        ipAddress: "192.168.1.0",
        type: IPType.IPV4,
        prefix: 24
      });
    });

    test("should extract IPv6 CIDR details", () => {
      const result = extractIPDetails("2001:db8::/32");
      expect(result).toEqual({
        ipAddress: "2001:db8::",
        type: IPType.IPV6,
        prefix: 32
      });
    });

    test("should throw error for invalid IP", () => {
      expect(() => extractIPDetails("invalid")).toThrow("Failed to extract IP details");
    });
  });
});
