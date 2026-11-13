import { Plan } from "@app/domains/platform/license/ce/module";
import { testFeatures } from "@app/domains/platform/license/ce/testing/test-features";

import { AgentVaultAccessState } from "../../../ce/models/agent-vault-access-state";
import { GrandfatheredOrg } from "../../models/grandfathered-org";
import { AgentVaultAccessService } from "./service";

const ORG_ID = "org-sub";
const ROOT_ORG_ID = "org-root";

const build = ({
  isCloud = true,
  agentVault = false,
  grandfathered = null,
  cached = null
}: {
  isCloud?: boolean;
  agentVault?: boolean | null;
  grandfathered?: GrandfatheredOrg | null;
  cached?: boolean | null;
} = {}) => {
  const licenseService = {
    getInstanceEntitlements: () => ({ isCloud: () => isCloud }) as never,
    getPlan: vi.fn(async () => Plan.restore({ ...testFeatures(), agentVault }))
  };
  const reader = { findByOrgId: vi.fn(async () => grandfathered) };
  const writer = { findByOrgId: vi.fn(), saveEnded: vi.fn<(org: GrandfatheredOrg) => Promise<void>>(async () => {}) };
  const cache = {
    read: vi.fn(async () => cached),
    write: vi.fn(async () => {}),
    forget: vi.fn(async () => {})
  };
  const service = new AgentVaultAccessService(
    licenseService,
    { resolveRootOrgId: async () => ROOT_ORG_ID },
    reader,
    writer,
    cache
  );
  return { service, reader, writer, cache };
};

const grandfatheredOrg = () => GrandfatheredOrg.restore({ orgId: ROOT_ORG_ID, endedAt: null });

describe("AgentVaultAccessService.assertCanBroker", () => {
  test("should not read grandfathering when the plan allows Agent Vault", async () => {
    // Setup
    const { service, reader, cache } = build({ agentVault: null });

    // Action
    await service.assertCanBroker(ORG_ID);

    // Assert
    expect(cache.read).not.toHaveBeenCalled();
    expect(reader.findByOrgId).not.toHaveBeenCalled();
  });

  test("should allow a grandfathered root org from the table, then remember it", async () => {
    // Setup
    const { service, reader, cache } = build({ grandfathered: grandfatheredOrg() });

    // Action
    await service.assertCanBroker(ORG_ID);

    // Assert
    expect(reader.findByOrgId).toHaveBeenCalledWith(ROOT_ORG_ID);
    expect(cache.write).toHaveBeenCalledWith(ROOT_ORG_ID, true);
  });

  test("should answer from the cache without reading the table", async () => {
    // Setup
    const { service, reader } = build({ cached: true });

    // Action
    await service.assertCanBroker(ORG_ID);

    // Assert
    expect(reader.findByOrgId).not.toHaveBeenCalled();
  });

  test("should refuse an org that has no plan and isn't grandfathered", async () => {
    // Setup
    const { service } = build();

    // Action
    const result = service.assertCanBroker(ORG_ID);

    // Assert
    await expect(result).rejects.toMatchObject({ name: "AgentVaultNotOnPlan" });
  });

  test("should never gate self-hosted", async () => {
    // Setup
    const { service } = build({ isCloud: false });

    // Action, Assert
    await expect(service.assertCanBroker(ORG_ID)).resolves.toBeUndefined();
  });
});

describe("AgentVaultAccessService.getAccess", () => {
  test("should end grandfathering once the plan grants Agent Vault, and forget the cached answer", async () => {
    // Setup
    const { service, writer, cache } = build({ agentVault: true, grandfathered: grandfatheredOrg() });

    // Action
    const access = await service.getAccess(ORG_ID);

    // Assert
    expect(access.state).toBe(AgentVaultAccessState.Plan);
    expect(writer.saveEnded).toHaveBeenCalledTimes(1);
    expect(writer.saveEnded.mock.calls[0][0].isActive).toBe(false);
    expect(cache.forget).toHaveBeenCalledWith(ROOT_ORG_ID);
  });

  test("should keep grandfathering and ask for a card while the plan doesn't grant Agent Vault", async () => {
    // Setup
    const { service, writer } = build({ agentVault: false, grandfathered: grandfatheredOrg() });

    // Action
    const access = await service.getAccess(ORG_ID);

    // Assert
    expect(access.toJSON()).toEqual({ state: AgentVaultAccessState.Grandfathered, allowed: true, showCardModal: true });
    expect(writer.saveEnded).not.toHaveBeenCalled();
  });

  test("should treat an ended grandfathering like no grandfathering", async () => {
    // Setup
    const ended = GrandfatheredOrg.restore({ orgId: ROOT_ORG_ID, endedAt: new Date() });
    const { service } = build({ agentVault: false, grandfathered: ended });

    // Action
    const access = await service.getAccess(ORG_ID);

    // Assert
    expect(access.allowed).toBe(false);
  });
});
