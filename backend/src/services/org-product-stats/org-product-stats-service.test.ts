import { createMongoAbility, ForbiddenError } from "@casl/ability";
import { describe, expect, test, vi } from "vitest";

import { orgNoAccessPermissions } from "@app/ee/services/permission/org-permission";

import { orgProductStatsServiceFactory } from "./org-product-stats-service";

describe("getOrgProductStats", () => {
  test("refuses an organization role that grants nothing", async () => {
    const service = orgProductStatsServiceFactory({
      orgProductStatsDAL: {} as never,
      keyStore: {} as never,
      kmsKeyService: {} as never,
      permissionService: {
        getOrgPermission: vi.fn().mockResolvedValue({ permission: createMongoAbility(orgNoAccessPermissions) })
      } as never
    });

    const result = service.getOrgProductStats({
      actor: "user",
      actorId: "user-id",
      actorAuthMethod: null,
      actorOrgId: "org-id"
    } as never);

    await expect(result).rejects.toBeInstanceOf(ForbiddenError);
    await expect(result).rejects.toThrow("Your organization role does not grant access to product statistics");
  });
});
