import { SplunkProviderCredentialsSchema } from "./splunk-provider-schemas";

const parsePort = (port: unknown) =>
  SplunkProviderCredentialsSchema.safeParse({
    hostname: "hec.example.com",
    port,
    token: "6f1a3c52-8f2b-4a1d-9a5e-6c2b7d8e9f01"
  });

describe("SplunkProviderCredentialsSchema port validation", () => {
  test("accepts the two ports Splunk serves HEC on", () => {
    expect(parsePort(8088).success).toBe(true);
    expect(parsePort(443).success).toBe(true);
  });

  // Streams created before the port existed have no port in their stored credentials, and the
  // factory resolves that to 8088.
  test("accepts an absent port", () => {
    expect(parsePort(undefined).success).toBe(true);
  });

  test("rejects any other port with a message naming both valid options", () => {
    const result = parsePort(8089);

    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe("Port must be 8088 or 443");
  });

  // The port arrives as JSON, so a quoted number must be rejected rather than coerced.
  test.each([["443"], [null], [0], [65536], [true]])("rejects %o", (port) => {
    expect(parsePort(port).success).toBe(false);
  });
});
