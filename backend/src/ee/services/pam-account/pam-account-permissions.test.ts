import { describe, expect, test, vi } from "vitest";

import type { TActorContext } from "@app/domains/lib/actor-context";
import { PermissionDeniedError } from "@app/domains/lib/errors";
import { FakePamPermissionService } from "@app/domains/pam/pam/ce/testing/fake-pam-permission-service";
import { ActorType } from "@app/lib/auth/actor-types";

import { pamAccountServiceFactory } from "./pam-account-service";

const PROJECT_ID = "project-1";
const actor = { principal: { type: ActorType.USER, id: "user-1" }, org: { id: "org-1" } } as unknown as TActorContext;

const buildService = (pamPermissionService: FakePamPermissionService) =>
  pamAccountServiceFactory({
    pamAccountDAL: {
      findById: vi.fn(async (id: string) => ({ id, projectId: PROJECT_ID, folderId: "folder-1" }))
    },
    pamPermissionService
  } as unknown as Parameters<typeof pamAccountServiceFactory>[0]);

describe("pamAccountService.getAccountPermissions", () => {
  test("should count the folder's and the account's roles together, and list members for a member manager", async () => {
    // Setup
    const pam = new FakePamPermissionService()
      .assignFolderRole({ actorId: "user-1", folderId: "folder-1", role: "auditor" })
      .assignAccountRole({ actorId: "user-1", accountId: "account-1", role: "admin" });

    // Action
    const result = await buildService(pam).getAccountPermissions({
      accountId: "account-1",
      projectId: PROJECT_ID,
      actor
    });

    // Assert
    expect(result.memberships).toHaveLength(2);
    expect(result.permissions.length).toBeGreaterThan(0);
  });

  test("should give a reader without ManageMembers the permissions and no roster", async () => {
    // Setup
    const pam = new FakePamPermissionService().assignFolderRole({
      actorId: "user-1",
      folderId: "folder-1",
      role: "auditor"
    });

    // Action
    const result = await buildService(pam).getAccountPermissions({
      accountId: "account-1",
      projectId: PROJECT_ID,
      actor
    });

    // Assert
    expect(result.memberships).toEqual([]);
    expect(result.permissions.length).toBeGreaterThan(0);
  });

  test("should refuse an actor with no role on the account or its folder as a rule denial", async () => {
    // Setup
    const pam = new FakePamPermissionService();

    // Action
    const result = buildService(pam).getAccountPermissions({ accountId: "account-1", projectId: PROJECT_ID, actor });

    // Assert
    await expect(result).rejects.toBeInstanceOf(PermissionDeniedError);
    await expect(result).rejects.toMatchObject({ denial: { action: "read-accounts" } });
  });
});
