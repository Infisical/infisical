import { describe, expect, test, vi } from "vitest";

vi.mock("@app/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}));

vi.mock("@app/lib/validator", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/lib/validator")>()),
  safeRequest: { request: vi.fn() }
}));

// eslint-disable-next-line import/first
import { safeRequest } from "@app/lib/validator";
// eslint-disable-next-line import/first
import { TSshConnectionConfig } from "@app/services/app-connection/ssh";

// eslint-disable-next-line import/first
import { HpIloAccountUnchangedError, HpIloFallbackNotAllowedError } from "./hp-ilo-rotation-errors";
// eslint-disable-next-line import/first
import {
  hpIloApiClientFactory,
  hpIloFallbackClientFactory,
  isIloPrompt,
  THpIloClient,
  THpIloClientFactory
} from "./hp-ilo-rotation-fns";

describe("isIloPrompt", () => {
  test("matches the iLO 5/6 prompt", () => {
    expect(isIloPrompt("</>hpiLO-> ")).toBe(true);
  });

  test("matches the iLO 7 prompt", () => {
    expect(isIloPrompt("</>hpeiLO-> ")).toBe(true);
  });

  test("does not match banner or password prompt output", () => {
    expect(isIloPrompt("Integrated Lights-Out 7\n")).toBe(false);
    expect(isIloPrompt("Password: ")).toBe(false);
  });
});

describe("hpIloFallbackClientFactory", () => {
  const config = { credentials: { host: "ilo.example.com", port: 22 } } as TSshConnectionConfig;
  const gatewayV2Service = { getPlatformConnectionDetailsByGatewayId: vi.fn() };
  const options = { sslRejectUnauthorized: true };

  const createMockClient = (enabled = true) => ({
    isEnabled: vi.fn<THpIloClient["isEnabled"]>(async () => enabled),
    changePasswordAsAdmin: vi.fn<THpIloClient["changePasswordAsAdmin"]>(async () => {}),
    changePasswordAsTarget: vi.fn<THpIloClient["changePasswordAsTarget"]>(async () => {}),
    verifyPassword: vi.fn<THpIloClient["verifyPassword"]>(async () => {})
  });

  type TMockClient = ReturnType<typeof createMockClient>;

  const buildClient = (...clients: TMockClient[]) =>
    hpIloFallbackClientFactory(
      ...clients.map(
        (client): THpIloClientFactory =>
          () =>
            client
      )
    )(config, gatewayV2Service, options);

  const operations = [
    {
      method: "changePasswordAsAdmin" as const,
      run: (client: THpIloClient) => client.changePasswordAsAdmin("target", "new-pass"),
      args: ["target", "new-pass"]
    },
    {
      method: "changePasswordAsTarget" as const,
      run: (client: THpIloClient) => client.changePasswordAsTarget("target", "old-pass", "new-pass"),
      args: ["target", "old-pass", "new-pass"]
    },
    {
      method: "verifyPassword" as const,
      run: (client: THpIloClient) => client.verifyPassword("target", "pass"),
      args: ["target", "pass"]
    }
  ];

  test("passes the connection config, gateway service and options to every factory", () => {
    const primaryFactory = vi.fn<THpIloClientFactory>(() => createMockClient());
    const fallbackFactory = vi.fn<THpIloClientFactory>(() => createMockClient());

    hpIloFallbackClientFactory(primaryFactory, fallbackFactory)(config, gatewayV2Service, options);

    expect(primaryFactory).toHaveBeenCalledWith(config, gatewayV2Service, options);
    expect(fallbackFactory).toHaveBeenCalledWith(config, gatewayV2Service, options);
  });

  describe.each(operations)("$method", ({ method, run, args }) => {
    test("uses only the first client when it succeeds", async () => {
      const primary = createMockClient();
      const fallback = createMockClient();

      await run(buildClient(primary, fallback));

      expect(primary[method]).toHaveBeenCalledWith(...args);
      expect(fallback.isEnabled).not.toHaveBeenCalled();
      expect(fallback[method]).not.toHaveBeenCalled();
    });

    test("skips a client that is not enabled", async () => {
      const primary = createMockClient(false);
      const fallback = createMockClient();

      await run(buildClient(primary, fallback));

      expect(primary[method]).not.toHaveBeenCalled();
      expect(fallback[method]).toHaveBeenCalledWith(...args);
    });

    test("treats a failing enabled check as not enabled", async () => {
      const primary = createMockClient();
      const fallback = createMockClient();
      primary.isEnabled.mockRejectedValueOnce(new Error("probe failed"));

      await run(buildClient(primary, fallback));

      expect(primary[method]).not.toHaveBeenCalled();
      expect(fallback[method]).toHaveBeenCalledWith(...args);
    });

    test("falls back when the first client reports the account unchanged", async () => {
      const primary = createMockClient();
      const fallback = createMockClient();
      primary[method].mockRejectedValueOnce(new HpIloAccountUnchangedError("rejected by iLO"));

      await run(buildClient(primary, fallback));

      expect(primary[method]).toHaveBeenCalledWith(...args);
      expect(fallback[method]).toHaveBeenCalledWith(...args);
    });

    test("does not fall back when the first client's outcome is unknown", async () => {
      const primary = createMockClient();
      const fallback = createMockClient();
      primary[method].mockRejectedValueOnce(new Error("response lost"));

      await expect(run(buildClient(primary, fallback))).rejects.toThrow("response lost");
      expect(fallback[method]).not.toHaveBeenCalled();
    });

    test("fails with every client's error when all of them fail", async () => {
      const primary = createMockClient();
      const fallback = createMockClient();
      primary[method].mockRejectedValueOnce(new HpIloAccountUnchangedError("api rejected"));
      fallback[method].mockRejectedValueOnce(new Error("ssh refused"));

      await expect(run(buildClient(primary, fallback))).rejects.toThrow("api rejected; ssh refused");
    });

    test("fails when no client is enabled", async () => {
      const primary = createMockClient(false);
      const fallback = createMockClient(false);

      await expect(run(buildClient(primary, fallback))).rejects.toThrow(
        "No HP iLO client is available for host 'ilo.example.com'"
      );
      expect(primary[method]).not.toHaveBeenCalled();
      expect(fallback[method]).not.toHaveBeenCalled();
    });
  });

  test("does not fall back when the first client rules out a fallback", async () => {
    const primary = createMockClient();
    const fallback = createMockClient();
    primary.isEnabled.mockRejectedValueOnce(new HpIloFallbackNotAllowedError("certificate rejected"));
    const client = buildClient(primary, fallback);

    await expect(client.changePasswordAsAdmin("target", "new-pass")).rejects.toThrow("certificate rejected");
    await expect(client.verifyPassword("target", "new-pass")).rejects.toThrow("certificate rejected");
    await expect(client.isEnabled()).rejects.toThrow("certificate rejected");
    expect(fallback.isEnabled).not.toHaveBeenCalled();
    expect(fallback.changePasswordAsAdmin).not.toHaveBeenCalled();
    expect(fallback.verifyPassword).not.toHaveBeenCalled();
  });

  test("checks whether each client is enabled only once across calls", async () => {
    const primary = createMockClient(false);
    const fallback = createMockClient();
    const client = buildClient(primary, fallback);

    await client.changePasswordAsAdmin("target", "new-pass");
    await client.verifyPassword("target", "new-pass");

    expect(primary.isEnabled).toHaveBeenCalledTimes(1);
    expect(fallback.isEnabled).toHaveBeenCalledTimes(1);
  });

  test("reports enabled when any client is enabled", async () => {
    await expect(buildClient(createMockClient(false), createMockClient()).isEnabled()).resolves.toBe(true);
    await expect(buildClient(createMockClient(false), createMockClient(false)).isEnabled()).resolves.toBe(false);
  });
});

describe("hpIloApiClientFactory isEnabled", () => {
  const config = {
    method: "password",
    credentials: { host: "ilo.example.com", port: 22, username: "admin", password: "pass" }
  } as TSshConnectionConfig;
  const gatewayV2Service = { getPlatformConnectionDetailsByGatewayId: vi.fn() };
  const certificate = "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----";

  const probeFailure = () => vi.mocked(safeRequest.request).mockRejectedValueOnce(new Error("self-signed certificate"));

  test("is enabled when the service root responds", async () => {
    vi.mocked(safeRequest.request).mockResolvedValueOnce({ data: {} } as Awaited<
      ReturnType<typeof safeRequest.request>
    >);

    const client = hpIloApiClientFactory(config, gatewayV2Service, {
      sslRejectUnauthorized: true,
      sslCertificate: certificate
    });

    await expect(client.isEnabled()).resolves.toBe(true);
  });

  test("rules out a fallback when the probe fails with a certificate and verification enabled", async () => {
    probeFailure();

    const client = hpIloApiClientFactory(config, gatewayV2Service, {
      sslRejectUnauthorized: true,
      sslCertificate: certificate
    });

    const result = client.isEnabled();
    await expect(result).rejects.toBeInstanceOf(HpIloFallbackNotAllowedError);
    await expect(result).rejects.toThrow("self-signed certificate");
  });

  test.each([
    { name: "no certificate is provided", options: { sslRejectUnauthorized: true } },
    { name: "verification is disabled", options: { sslRejectUnauthorized: false, sslCertificate: certificate } }
  ])("allows a fallback when the probe fails and $name", async ({ options }) => {
    probeFailure();

    const client = hpIloApiClientFactory(config, gatewayV2Service, options);

    await expect(client.isEnabled()).resolves.toBe(false);
  });
});
