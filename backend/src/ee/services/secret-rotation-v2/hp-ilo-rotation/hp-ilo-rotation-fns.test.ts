import { beforeEach, describe, expect, test, vi } from "vitest";

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

  const createMockClient = () => ({
    changePasswordAsAdmin: vi.fn<THpIloClient["changePasswordAsAdmin"]>(async () => {}),
    changePasswordAsTarget: vi.fn<THpIloClient["changePasswordAsTarget"]>(async () => {}),
    verifyPassword: vi.fn<THpIloClient["verifyPassword"]>(async () => {})
  });

  let primary: ReturnType<typeof createMockClient>;
  let fallback: ReturnType<typeof createMockClient>;

  const buildClient = () => {
    const primaryFactory: THpIloClientFactory = () => primary;
    const fallbackFactory: THpIloClientFactory = () => fallback;
    return hpIloFallbackClientFactory(primaryFactory, fallbackFactory)(config, gatewayV2Service);
  };

  beforeEach(() => {
    primary = createMockClient();
    fallback = createMockClient();
  });

  test("passes the connection config and gateway service to both factories", () => {
    const primaryFactory = vi.fn<THpIloClientFactory>(() => primary);
    const fallbackFactory = vi.fn<THpIloClientFactory>(() => fallback);

    hpIloFallbackClientFactory(primaryFactory, fallbackFactory)(config, gatewayV2Service);

    expect(primaryFactory).toHaveBeenCalledWith(config, gatewayV2Service);
    expect(fallbackFactory).toHaveBeenCalledWith(config, gatewayV2Service);
  });

  describe.each([
    {
      method: "changePasswordAsAdmin" as const,
      run: (client: THpIloClient) => client.changePasswordAsAdmin("target", "new-pass"),
      args: ["target", "new-pass"],
      operation: "password change"
    },
    {
      method: "changePasswordAsTarget" as const,
      run: (client: THpIloClient) => client.changePasswordAsTarget("target", "old-pass", "new-pass"),
      args: ["target", "old-pass", "new-pass"],
      operation: "password change"
    },
    {
      method: "verifyPassword" as const,
      run: (client: THpIloClient) => client.verifyPassword("target", "pass"),
      args: ["target", "pass"],
      operation: "password verification"
    }
  ])("$method", ({ method, run, args, operation }) => {
    test("uses only the primary client when it succeeds", async () => {
      await run(buildClient());

      expect(primary[method]).toHaveBeenCalledWith(...args);
      expect(fallback[method]).not.toHaveBeenCalled();
    });

    test("falls back to the secondary client when the primary fails", async () => {
      primary[method].mockRejectedValueOnce(new Error("api unreachable"));

      await run(buildClient());

      expect(primary[method]).toHaveBeenCalledWith(...args);
      expect(fallback[method]).toHaveBeenCalledWith(...args);
    });

    test("fails with both errors when both clients fail", async () => {
      primary[method].mockRejectedValueOnce(new Error("api unreachable"));
      fallback[method].mockRejectedValueOnce(new Error("ssh refused"));

      await expect(run(buildClient())).rejects.toThrow(
        `HP iLO ${operation} failed: api unreachable; fallback also failed: ssh refused`
      );
      expect(primary[method]).toHaveBeenCalledTimes(1);
      expect(fallback[method]).toHaveBeenCalledTimes(1);
    });
  });
});
