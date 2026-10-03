import { describe, expect, test, vi } from "vitest";

vi.mock("@app/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}));

// eslint-disable-next-line import/first
import { TSshConnectionConfig } from "@app/services/app-connection/ssh";

// eslint-disable-next-line import/first
import { hpIloFallbackClientFactory, isIloPrompt, THpIloClient, THpIloClientFactory } from "./hp-ilo-rotation-fns";

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
    )(config, gatewayV2Service);

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

  test("passes the connection config and gateway service to every factory", () => {
    const primaryFactory = vi.fn<THpIloClientFactory>(() => createMockClient());
    const fallbackFactory = vi.fn<THpIloClientFactory>(() => createMockClient());

    hpIloFallbackClientFactory(primaryFactory, fallbackFactory)(config, gatewayV2Service);

    expect(primaryFactory).toHaveBeenCalledWith(config, gatewayV2Service);
    expect(fallbackFactory).toHaveBeenCalledWith(config, gatewayV2Service);
  });

  describe.each(operations)("$method", ({ method, run, args }) => {
    test("uses the first client when it is enabled, without checking the others", async () => {
      const primary = createMockClient();
      const fallback = createMockClient();

      await run(buildClient(primary, fallback));

      expect(primary[method]).toHaveBeenCalledWith(...args);
      expect(fallback.isEnabled).not.toHaveBeenCalled();
      expect(fallback[method]).not.toHaveBeenCalled();
    });

    test("uses the next client when the first is not enabled", async () => {
      const primary = createMockClient(false);
      const fallback = createMockClient();

      await run(buildClient(primary, fallback));

      expect(primary[method]).not.toHaveBeenCalled();
      expect(fallback[method]).toHaveBeenCalledWith(...args);
    });

    test("does not retry on another client when the selected client fails", async () => {
      const primary = createMockClient();
      const fallback = createMockClient();
      primary[method].mockRejectedValueOnce(new Error("api failed"));

      await expect(run(buildClient(primary, fallback))).rejects.toThrow("api failed");
      expect(fallback[method]).not.toHaveBeenCalled();
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

  test("selects a client once and reuses it for later calls", async () => {
    const primary = createMockClient(false);
    const fallback = createMockClient();
    const client = buildClient(primary, fallback);

    await client.changePasswordAsAdmin("target", "new-pass");
    await client.verifyPassword("target", "new-pass");

    expect(primary.isEnabled).toHaveBeenCalledTimes(1);
    expect(fallback.isEnabled).toHaveBeenCalledTimes(1);
    expect(fallback.changePasswordAsAdmin).toHaveBeenCalledTimes(1);
    expect(fallback.verifyPassword).toHaveBeenCalledTimes(1);
  });

  test("reports enabled when any client is enabled", async () => {
    await expect(buildClient(createMockClient(false), createMockClient()).isEnabled()).resolves.toBe(true);
    await expect(buildClient(createMockClient(false), createMockClient(false)).isEnabled()).resolves.toBe(false);
  });
});
