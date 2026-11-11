import { createMongoAbility, ForbiddenError } from "@casl/ability";
import { describe, expect, test, vi } from "vitest";

import { PamResourcePermissionSub } from "@app/domains/pam/pam/ce/module";
import { ActorGrants } from "@app/domains/platform/access-control/ce/module";
import { ProjectResourcePermission } from "@app/domains/platform/projects/ce/module";
import { ForbiddenRequestError } from "@app/lib/errors";

import { accountAccessAllows, checkAccountAccess } from "./pam-permission";

const rulesFor = (allowed: boolean) =>
  allowed ? [{ action: "view-credentials", subject: PamResourcePermissionSub.PamResource }] : [];

const membershipOn = (resourceType: string, resourceId: string) => ({
  id: `membership-${resourceId}`,
  scope: "resource",
  scopeOrgId: "o1",
  scopeProjectId: "proj-1",
  scopeResourceType: resourceType,
  scopeResourceId: resourceId,
  actorUserId: "u1",
  isActive: true,
  roles: []
});

const permissionFor = (allowed: boolean, memberships: ReturnType<typeof membershipOn>[] = []) =>
  ProjectResourcePermission.build({
    rules: rulesFor(allowed) as never,
    grants: ActorGrants.restore({ memberships: memberships as never, privileges: [], attributes: [] }),
    isImplicitAdmin: false,
    isProjectAdmin: false
  });

const ctx = { principal: { type: "user", id: "u1" }, org: { id: "o1" } } as never;

describe("accountAccessAllows", () => {
  test("is true when the actor holds the action", async () => {
    const pamDomain = { getPamPermission: vi.fn(async () => permissionFor(true)) };
    await expect(
      accountAccessAllows(pamDomain as never, "acc-1", null, "proj-1", "view-credentials" as never, ctx)
    ).resolves.toBe(true);
  });

  test("is false when the actor does not, rather than throwing", async () => {
    const pamDomain = { getPamPermission: vi.fn(async () => permissionFor(false)) };
    await expect(
      accountAccessAllows(pamDomain as never, "acc-1", null, "proj-1", "view-credentials" as never, ctx)
    ).resolves.toBe(false);
  });

  test("rethrows a failure that is not a permission refusal", async () => {
    const pamDomain = {
      getPamPermission: vi.fn(async () => {
        throw new Error("database unreachable");
      })
    };
    await expect(
      accountAccessAllows(pamDomain as never, "acc-1", null, "proj-1", "view-credentials" as never, ctx)
    ).rejects.toThrow("database unreachable");
  });

  test("treats both refusal classes as a denial", async () => {
    for (const err of [
      new ForbiddenRequestError({ message: "no" }),
      new ForbiddenError(createMongoAbility(rulesFor(false)))
    ]) {
      const pamDomain = {
        getPamPermission: vi.fn(async () => {
          throw err;
        })
      };
      // eslint-disable-next-line no-await-in-loop
      await expect(
        accountAccessAllows(pamDomain as never, "acc-1", null, "proj-1", "view-credentials" as never, ctx)
      ).resolves.toBe(false);
    }
  });
});

describe("checkAccountAccess", () => {
  const check = (permission: ReturnType<typeof permissionFor>) =>
    checkAccountAccess(
      { getPamPermission: vi.fn(async () => permission) } as never,
      "acc-1",
      "folder-1",
      "proj-1",
      "view-credentials" as never,
      ctx
    );

  test("passes when the folder or the account gives the action", async () => {
    await expect(check(permissionFor(true, [membershipOn("pam-folder", "folder-1")]))).resolves.toBeUndefined();
  });

  test("refuses a folder member with no role on the account as a non-member of the account", async () => {
    await expect(check(permissionFor(false, [membershipOn("pam-folder", "folder-1")]))).rejects.toThrow(
      new ForbiddenRequestError({ message: "You are not a member of this pam-account." })
    );
  });

  test("refuses an account member without the action with the permission error", async () => {
    await expect(
      check(permissionFor(false, [membershipOn("pam-folder", "folder-1"), membershipOn("pam-account", "acc-1")]))
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
