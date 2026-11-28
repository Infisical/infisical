import { BlocklistEntryType, TBlocklistEntry, TLicenseServerBlocklist } from "@app/domains/platform/license/ce/module";

import { BlocklistCache } from "../../data-access/blocklist-cache";
import { BlockScope } from "../../models/blocklist";
import { BlocklistService } from "./service";

const ORG_ID = "6f1c6c2e-8d0a-4a7e-9a55-1d2f3b4c5d6e";

const orgEntry: TBlocklistEntry = {
  id: "c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f",
  type: BlocklistEntryType.OrgId,
  value: ORG_ID,
  message: "Blocked for abuse",
  expiresAt: null
};

const buildService = () => {
  const getBlocklist = vi.fn<TLicenseServerBlocklist["getBlocklist"]>();
  const service = new BlocklistService(new BlocklistCache(), { getBlocklist });
  return { service, getBlocklist };
};

describe("BlocklistService.refresh", () => {
  test("should block what the License Server lists after a refresh", async () => {
    // Setup
    const { service, getBlocklist } = buildService();
    getBlocklist.mockResolvedValue([orgEntry]);

    // Action
    await service.refresh();

    // Assert
    expect(service.findBlock({ orgIds: [ORG_ID] })).toEqual({
      scope: BlockScope.Organization,
      message: "Blocked for abuse"
    });
  });

  test("should keep the last list when a refresh fails", async () => {
    // Setup
    const { service, getBlocklist } = buildService();
    getBlocklist.mockResolvedValueOnce([orgEntry]).mockRejectedValueOnce(new Error("License Server unavailable"));
    await service.refresh();

    // Action
    const refresh = service.refresh();

    // Assert
    await expect(refresh).rejects.toThrow("License Server unavailable");
    expect(service.findBlock({ orgIds: [ORG_ID] })?.scope).toBe(BlockScope.Organization);
  });

  test("should lift a block the License Server no longer lists", async () => {
    // Setup
    const { service, getBlocklist } = buildService();
    getBlocklist.mockResolvedValueOnce([orgEntry]).mockResolvedValueOnce([]);
    await service.refresh();

    // Action
    await service.refresh();

    // Assert
    expect(service.findBlock({ orgIds: [ORG_ID] })).toBeNull();
  });

  test("should keep the list when there is no cloud connection", async () => {
    // Setup
    const { service, getBlocklist } = buildService();
    getBlocklist.mockResolvedValueOnce([orgEntry]).mockResolvedValueOnce(null);
    await service.refresh();

    // Action
    await service.refresh();

    // Assert
    expect(service.findBlock({ orgIds: [ORG_ID] })).not.toBeNull();
  });
});
