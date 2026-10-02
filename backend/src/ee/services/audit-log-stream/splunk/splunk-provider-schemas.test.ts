import { SplunkProviderCredentialsSchema } from "./splunk-provider-schemas";

const parsePort = (port: unknown) =>
  SplunkProviderCredentialsSchema.safeParse({
    hostname: "hec.example.com",
    port,
    token: "6f1a3c52-8f2b-4a1d-9a5e-6c2b7d8e9f01"
  });

describe("SplunkProviderCredentialsSchema port validation", () => {
  test.each([[1], [443], [8088], [8089], [65535]])("accepts %o", (port) => {
    expect(parsePort(port).success).toBe(true);
  });

  // Streams created before the port existed have no port in their stored credentials, and the
  // factory resolves that to 8088.
  test("accepts an absent port", () => {
    expect(parsePort(undefined).success).toBe(true);
  });

  // The port arrives as JSON, so a quoted number must be rejected rather than coerced.
  test.each([["8088"], [null], [0], [-1], [65536], [8088.5], [true]])("rejects %o", (port) => {
    expect(parsePort(port).success).toBe(false);
  });
});
