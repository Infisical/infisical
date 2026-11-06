import { BadRequestError } from "@app/lib/errors";

import { HsmGatewayCapability } from "./hsm-connector-fns";
import { hsmConnectorRoutingFactory } from "./hsm-connector-routing";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}));

vi.mock("@app/lib/gateway-v2/gateway-v2", () => ({
  withGatewayV2Proxy: vi.fn(async (fn: (port: number) => Promise<unknown>) => fn(1))
}));

vi.mock("@app/lib/gateway-v2/pkcs11-rpc", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/lib/gateway-v2/pkcs11-rpc")>()),
  callPkcs11Endpoint: vi.fn(async () => ({ ok: true, status: 200, result: { signature: "c2ln" } }))
}));

type TPoolGateway = { id: string; capabilities: Record<string, unknown> };

const buildRouting = (members: TPoolGateway[], healthyIds?: string[]) => {
  const healthy = members.filter((member) => !healthyIds || healthyIds.includes(member.id));
  const selectGatewayFromPool = vi.fn(
    async ({
      exclude,
      filter,
      unavailableMessage
    }: {
      exclude: Set<string>;
      filter: (gateway: TPoolGateway) => boolean;
      unavailableMessage: string;
    }) => {
      const candidate = healthy.find((member) => !exclude.has(member.id) && filter(member));
      if (!candidate) throw new BadRequestError({ message: unavailableMessage });
      return candidate;
    }
  );
  const getPlatformConnectionDetailsByGatewayId = vi.fn(async ({ gatewayId }: { gatewayId: string }) => ({
    gatewayId
  }));
  const routing = hsmConnectorRoutingFactory({
    gatewayV2Service: { getPlatformConnectionDetailsByGatewayId } as never,
    gatewayV2DAL: { findById: vi.fn(async (id: string) => members.find((member) => member.id === id)) } as never,
    gatewayPoolService: { selectGatewayFromPool, listHealthyGateways: vi.fn(async () => healthy) } as never
  });
  return { routing, getPlatformConnectionDetailsByGatewayId };
};

const signThroughPool = (
  routing: ReturnType<typeof buildRouting>["routing"],
  requiredCapability?: HsmGatewayCapability,
  connector: { gatewayId: string | null; gatewayPoolId: string | null } = { gatewayId: null, gatewayPoolId: "pool" }
) =>
  routing.dispatchPkcs11({
    connector,
    credentials: { slotLabel: "slot", pin: "pin" },
    endpoint: "/v1/sign",
    params: {},
    requiredCapability
  });

describe("HSM Connector routing", () => {
  test("ML-DSA operations skip pool members that do not advertise ML-DSA support", async () => {
    const { routing, getPlatformConnectionDetailsByGatewayId } = buildRouting([
      { id: "old-gateway", capabilities: { pkcs11: true } },
      { id: "new-gateway", capabilities: { pkcs11: true, pkcs11MlDsa: true } }
    ]);

    await signThroughPool(routing, HsmGatewayCapability.MlDsa);

    expect(getPlatformConnectionDetailsByGatewayId).toHaveBeenCalledTimes(1);
    expect(getPlatformConnectionDetailsByGatewayId.mock.calls[0][0]).toMatchObject({ gatewayId: "new-gateway" });
  });

  test("asks to update a pool whose members predate ML-DSA support", async () => {
    const { routing } = buildRouting([
      { id: "old-gateway", capabilities: { pkcs11: true } },
      { id: "current-gateway", capabilities: { pkcs11: true, pkcs11MlDsa: false } }
    ]);

    await expect(signThroughPool(routing, HsmGatewayCapability.MlDsa)).rejects.toThrow(
      /Update the pool's gateways to the latest version/
    );
  });

  test("blames the HSMs when every current pool member reports no ML-DSA support", async () => {
    const { routing } = buildRouting([{ id: "current-gateway", capabilities: { pkcs11: true, pkcs11MlDsa: false } }]);

    await expect(signThroughPool(routing, HsmGatewayCapability.MlDsa)).rejects.toThrow(
      /None of the HSMs attached to the pool's gateways support ML-DSA keys/
    );
  });

  test("an offline pool is reported as offline, not as needing an upgrade", async () => {
    const { routing } = buildRouting([{ id: "new-gateway", capabilities: { pkcs11: true, pkcs11MlDsa: true } }], []);

    await expect(signThroughPool(routing, HsmGatewayCapability.MlDsa)).rejects.toThrow(
      /No HSM-capable gateway available in the pool/
    );
  });

  test("a single gateway without ML-DSA support is refused before it is dialed", async () => {
    const { routing, getPlatformConnectionDetailsByGatewayId } = buildRouting([
      { id: "old-gateway", capabilities: { pkcs11: true } }
    ]);

    await expect(
      signThroughPool(routing, HsmGatewayCapability.MlDsa, { gatewayId: "old-gateway", gatewayPoolId: null })
    ).rejects.toThrow(/Update the gateway to the latest version/);
    expect(getPlatformConnectionDetailsByGatewayId).not.toHaveBeenCalled();
  });

  test("a current single gateway whose HSM lacks ML-DSA is refused with an HSM error", async () => {
    const { routing, getPlatformConnectionDetailsByGatewayId } = buildRouting([
      { id: "current-gateway", capabilities: { pkcs11: true, pkcs11MlDsa: false } }
    ]);

    await expect(
      signThroughPool(routing, HsmGatewayCapability.MlDsa, { gatewayId: "current-gateway", gatewayPoolId: null })
    ).rejects.toThrow(/The HSM attached to the HSM Connector's gateway does not support ML-DSA keys/);
    expect(getPlatformConnectionDetailsByGatewayId).not.toHaveBeenCalled();
  });

  test("a single gateway with ML-DSA support is used", async () => {
    const { routing, getPlatformConnectionDetailsByGatewayId } = buildRouting([
      { id: "new-gateway", capabilities: { pkcs11: true, pkcs11MlDsa: true } }
    ]);

    await signThroughPool(routing, HsmGatewayCapability.MlDsa, { gatewayId: "new-gateway", gatewayPoolId: null });

    expect(getPlatformConnectionDetailsByGatewayId.mock.calls[0][0]).toMatchObject({ gatewayId: "new-gateway" });
  });

  test("other operations still use any HSM-capable member", async () => {
    const { routing, getPlatformConnectionDetailsByGatewayId } = buildRouting([
      { id: "old-gateway", capabilities: { pkcs11: true } }
    ]);

    await signThroughPool(routing);

    expect(getPlatformConnectionDetailsByGatewayId.mock.calls[0][0]).toMatchObject({ gatewayId: "old-gateway" });
  });
});
