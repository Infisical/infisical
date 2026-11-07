import {
  buildWebAppPolicySnapshot,
  normalizeWebAppConnectionDetails,
  WebAppConnectionDetailsSchema,
  WebAppCredentialsSchema
} from "./pam-web-app-config";

describe("Web App configuration", () => {
  test.each([
    "file:///etc/passwd",
    "ftp://app.internal",
    "https://user:password@app.internal",
    "https://user@app.internal"
  ])("refuses an unsafe start URL: %s", (startUrl) => {
    expect(WebAppConnectionDetailsSchema.safeParse({ startUrl }).success).toBe(false);
  });
  test("normalizes and includes the start origin with an explicit port", () => {
    const details = normalizeWebAppConnectionDetails({
      startUrl: "https://APP.internal/path?state=private",
      allowedDestinations: "https://app.internal\nhttps://*.assets.internal:8443"
    });
    expect(details.allowedDestinations).toEqual(["https://app.internal:443", "https://*.assets.internal:8443"]);
    const snapshot = buildWebAppPolicySnapshot(details, "none", { reconnectGraceSeconds: 60 });
    expect(snapshot.startOrigin).toBe("https://app.internal:443");
    expect(snapshot.allowedDestinations[1]).toEqual({ scheme: "https", host: "*.assets.internal", port: 8443 });
  });
  test.each([
    "https://example.com/path",
    "https://[not-ipv6]:443",
    "https://user@example.com",
    "https://app.internal:0",
    "https://app.internal:65536",
    "https://app.internal?token=x"
  ])("bounds a destination: %s", (destination) => {
    expect(
      WebAppConnectionDetailsSchema.safeParse({ startUrl: "https://app.internal", allowedDestinations: [destination] })
        .success
    ).toBe(false);
  });
  test("round-trips bracketed IPv6 origins and sends unbracketed gateway hosts", () => {
    const details = normalizeWebAppConnectionDetails({
      startUrl: "https://[2001:db8::1]/login",
      allowedDestinations: ["https://[2001:db8::1]:443", "http://[2001:db8::2]:8080"]
    });
    expect(normalizeWebAppConnectionDetails(details)).toEqual(details);
    const snapshot = buildWebAppPolicySnapshot(details, "none", { reconnectGraceSeconds: 60 });
    expect(snapshot.startOrigin).toBe("https://[2001:db8::1]:443");
    expect(snapshot.allowedDestinations).toEqual([
      { scheme: "https", host: "2001:db8::1", port: 443 },
      { scheme: "http", host: "2001:db8::2", port: 8080 }
    ]);
  });
  test("normalizes duplicates before bounding fifty destinations and remains launchable", () => {
    const allowedDestinations = Array.from({ length: 49 }, (_, index) => `https://app${index}.internal`);
    const details = normalizeWebAppConnectionDetails({
      startUrl: "https://app.internal/login",
      allowedDestinations: ["https://APP.internal:443", ...allowedDestinations, "https://app0.internal:443"]
    });
    expect(details.allowedDestinations).toHaveLength(50);
    expect(normalizeWebAppConnectionDetails(details)).toEqual(details);
    expect(buildWebAppPolicySnapshot(details, "none", { reconnectGraceSeconds: 60 }).allowedDestinations).toHaveLength(
      50
    );
    expect(() =>
      normalizeWebAppConnectionDetails({
        startUrl: "https://app.internal/login",
        allowedDestinations: [...allowedDestinations, "https://one-more.internal"]
      })
    ).toThrow();
  });
  test("validates denied CIDRs and supported sign-in methods", () => {
    expect(
      WebAppConnectionDetailsSchema.safeParse({ startUrl: "https://app.internal", extraDenyCidrs: ["10.0.0.0/33"] })
        .success
    ).toBe(false);
    expect(
      WebAppConnectionDetailsSchema.safeParse({
        startUrl: "https://app.internal",
        extraDenyCidrs: ["fc00::/7", "10.0.0.0/8"]
      }).success
    ).toBe(true);
    expect(WebAppCredentialsSchema.safeParse({ authMethod: "none" }).success).toBe(true);
    expect(
      WebAppCredentialsSchema.safeParse({ authMethod: "basic-auth", username: "admin", password: "secret" }).success
    ).toBe(true);
    expect(WebAppCredentialsSchema.safeParse({ authMethod: "basic-auth", username: "admin" }).success).toBe(false);
  });
});
