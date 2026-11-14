import { Plan } from "@app/domains/platform/license/ce/module";
import { testFeatures } from "@app/domains/platform/license/ce/testing/test-features";

import { AgentVaultAccessState } from "../../../ce/models/agent-vault-access-state";
import { AgentVaultAccessService } from "./service";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

const ORG_ID = "org-sub";
const ROOT_ORG_ID = "org-root";

const build = ({
  isCloud = true,
  agentVault = false,
  used = 0,
  readFails = false
}: {
  isCloud?: boolean;
  agentVault?: boolean | null;
  used?: number;
  readFails?: boolean;
} = {}) => {
  const licenseService = {
    getInstanceEntitlements: () => ({ isCloud: () => isCloud }) as never,
    getPlan: vi.fn(async () => Plan.restore({ ...testFeatures(), agentVault }))
  };
  const freeUsageCache = {
    read: vi.fn(async () => {
      if (readFails) throw new Error("redis down");
      return used;
    })
  };
  const service = new AgentVaultAccessService(
    licenseService,
    { resolveRootOrgId: async () => ROOT_ORG_ID },
    freeUsageCache
  );
  return { service, licenseService, freeUsageCache };
};

describe("AgentVaultAccessService.assertCanBroker", () => {
  test.each([true, null])("should not read the free count when the plan says %s", async (agentVault) => {
    // Setup
    const { service, freeUsageCache } = build({ agentVault, used: 9_000 });

    // Action
    await service.assertCanBroker(ORG_ID);

    // Assert
    expect(freeUsageCache.read).not.toHaveBeenCalled();
  });

  test("should allow a limited org under the limit, reading the root org's count", async () => {
    // Setup
    const { service, freeUsageCache } = build({ used: 4_999 });

    // Action
    await service.assertCanBroker(ORG_ID);

    // Assert
    expect(freeUsageCache.read).toHaveBeenCalledWith(ROOT_ORG_ID, expect.any(Date));
  });

  test("should refuse a limited org at the limit", async () => {
    // Setup
    const { service } = build({ used: 5_000 });

    // Action
    const result = service.assertCanBroker(ORG_ID);

    // Assert
    await expect(result).rejects.toMatchObject({ name: "AgentVaultFreeLimitReached" });
  });

  test("should allow when the count can't be read", async () => {
    // Setup
    const { service } = build({ readFails: true });

    // Action, Assert
    await expect(service.assertCanBroker(ORG_ID)).resolves.toBeUndefined();
  });

  test("should never count or limit self-hosted", async () => {
    // Setup
    const { service, licenseService, freeUsageCache } = build({ isCloud: false, used: 9_000 });

    // Action, Assert
    await expect(service.assertCanBroker(ORG_ID)).resolves.toBeUndefined();
    expect(licenseService.getPlan).not.toHaveBeenCalled();
    expect(freeUsageCache.read).not.toHaveBeenCalled();
  });
});

describe("AgentVaultAccessService.getAccess", () => {
  test("should return the free usage for a limited org", async () => {
    // Setup
    const { service } = build({ used: 4_200 });

    // Action
    const access = await service.getAccess(ORG_ID);

    // Assert
    expect(access.state).toBe(AgentVaultAccessState.Free);
    expect(access.warn).toBe(true);
    expect(access.freeUsage).toMatchObject({ used: 4_200, limit: 5_000 });
  });

  test("should report the limit as reached without throwing", async () => {
    // Setup
    const { service } = build({ used: 5_000 });

    // Action
    const access = await service.getAccess(ORG_ID);

    // Assert
    expect(access.toJSON()).toMatchObject({ state: AgentVaultAccessState.LimitReached, allowed: false });
  });

  test("should not read the free count for an org on the plan", async () => {
    // Setup
    const { service, freeUsageCache } = build({ agentVault: true });

    // Action
    const access = await service.getAccess(ORG_ID);

    // Assert
    expect(access.toJSON()).toEqual({ state: AgentVaultAccessState.Plan, allowed: true, freeUsage: null, warn: false });
    expect(freeUsageCache.read).not.toHaveBeenCalled();
  });
});
