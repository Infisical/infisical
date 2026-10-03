import { createMongoAbility, ForbiddenError } from "@casl/ability";
import { describe, expect, test, vi } from "vitest";

import { ResourcePermissionSub } from "@app/ee/services/permission/resource-permission";
import { ForbiddenRequestError } from "@app/lib/errors";

import { accountAccessAllows } from "./pam-permission";

const abilityFor = (allowed: boolean) =>
  createMongoAbility(allowed ? [{ action: "view-credentials", subject: ResourcePermissionSub.PamResource }] : []);

const ctx = { actorId: "u1", actor: "user", actorOrgId: "o1", actorAuthMethod: "email" } as never;

describe("accountAccessAllows", () => {
  test("is true when the actor holds the action", async () => {
    const permissionService = { getResourcePermission: vi.fn(async () => ({ permission: abilityFor(true) })) };
    await expect(
      accountAccessAllows(permissionService as never, "acc-1", null, "proj-1", "view-credentials" as never, ctx)
    ).resolves.toBe(true);
  });

  test("is false when the actor does not, rather than throwing", async () => {
    const permissionService = { getResourcePermission: vi.fn(async () => ({ permission: abilityFor(false) })) };
    await expect(
      accountAccessAllows(permissionService as never, "acc-1", null, "proj-1", "view-credentials" as never, ctx)
    ).resolves.toBe(false);
  });

  test("rethrows a failure that is not a permission refusal", async () => {
    const permissionService = {
      getResourcePermission: vi.fn(async () => {
        throw new Error("database unreachable");
      })
    };
    await expect(
      accountAccessAllows(permissionService as never, "acc-1", null, "proj-1", "view-credentials" as never, ctx)
    ).rejects.toThrow("database unreachable");
  });

  test("treats both refusal classes as a denial", async () => {
    for (const err of [new ForbiddenRequestError({ message: "no" }), new ForbiddenError(abilityFor(false))]) {
      const permissionService = {
        getResourcePermission: vi.fn(async () => {
          throw err;
        })
      };
      // eslint-disable-next-line no-await-in-loop
      await expect(
        accountAccessAllows(permissionService as never, "acc-1", null, "proj-1", "view-credentials" as never, ctx)
      ).resolves.toBe(false);
    }
  });
});
