import { describe, expect, it } from "vitest";

import { TsigAlgorithm } from "@app/lib/dns-update";

import { Rfc2136ConnectionTsigKeyCredentialsSchema } from "./rfc2136-connection-schemas";

const SECRET = "q3ZkT8mPrX0wq1H7d2bE9yVfK4LsN6uA3cJ5gR8tWzo=";

const parse = (overrides: Record<string, unknown>) =>
  Rfc2136ConnectionTsigKeyCredentialsSchema.safeParse({
    host: "ns1.example.com",
    port: 53,
    tsigKeyName: "infisical-acme",
    tsigAlgorithm: TsigAlgorithm.HmacSha256,
    tsigSecret: SECRET,
    ...overrides
  });

describe("Rfc2136ConnectionTsigKeyCredentialsSchema", () => {
  it("accepts a complete TSIG key", () => {
    expect(parse({}).success).toBe(true);
  });

  it("accepts IP addresses and rejects hosts with a scheme or port", () => {
    expect(parse({ host: "10.0.0.53" }).success).toBe(true);
    expect(parse({ host: "2001:db8::53" }).success).toBe(true);
    expect(parse({ host: "ns1.example.com:53" }).success).toBe(false);
    expect(parse({ host: "dns://ns1.example.com" }).success).toBe(false);
  });

  it("rejects MD5 keys", () => {
    expect(parse({ tsigAlgorithm: "hmac-md5" }).success).toBe(false);
  });

  it("explains a secret that is not base64", () => {
    const result = parse({ tsigSecret: `${SECRET}"; };` });
    expect(result.error?.issues[0].message).toMatch(/must be base64/);
  });

  // a key made from a password can decode to base64-looking text and still be valid
  it("accepts a secret whose decoded text also looks like base64", () => {
    expect(parse({ tsigSecret: Buffer.from("mysecretpassword").toString("base64") }).success).toBe(true);
  });
});
