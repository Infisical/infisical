import { packRules } from "@casl/ability/extra";

import { ProjectType, RESOURCE_SCOPE, ResourceType } from "@app/db/schemas";
import type { TActorContext } from "@app/domains/lib/actor-context";
import { PermissionDeniedError } from "@app/domains/lib/errors";
import { ActorGrants, Grant, TMembershipRecord } from "@app/domains/platform/access-control/ce/module";
import { FakeActorGrantsService } from "@app/domains/platform/access-control/ce/testing/fake-actor-grants-service";
import { InMemoryGrantSeeder } from "@app/domains/platform/access-control/ce/testing/in-memory-grant-seeder";
import { InMemoryGrantStore } from "@app/domains/platform/access-control/ce/testing/in-memory-grant-store";
import { ProjectResourcePermission, TProjectResourcePermissionService } from "@app/domains/platform/projects/ce/module";
import { ActorType, AuthMethod } from "@app/lib/auth/actor-types";

import { PamAccountRoles, PamFolderRoles } from "../../models/pam-resource-roles";
import {
  PamResourcePermissionActions,
  PamResourcePermissionSet,
  PamResourcePermissionSub
} from "../../models/pam-roles";
import { pamActorKey, PamPermissionService } from "./service";

const actor: TActorContext = {
  principal: {
    type: ActorType.USER,
    id: "user-1",
    username: "user",
    email: null,
    authMethod: AuthMethod.EMAIL,
    isSuperAdmin: false
  },
  org: {
    id: "org-1",
    name: "org",
    rootOrgId: "org-1",
    parentOrgId: "org-1",
    shouldUseNewPrivilegeSystem: true,
    ssoPolicy: { authEnforced: false, googleSsoAuthEnforced: false, bypassOrgAuthEnabled: false }
  }
};

const setup = () => {
  const getResourcePermission = vi.fn(async () => ProjectResourcePermission.none());
  const service = new PamPermissionService(
    { getResourcePermission } as TProjectResourcePermissionService,
    new FakeActorGrantsService(new InMemoryGrantStore())
  );
  return { service, getResourcePermission };
};

describe("PamPermissionService.getPamPermission", () => {
  test("should count the folder and then the account in it together", async () => {
    // Setup
    const { service, getResourcePermission } = setup();

    // Action
    await service.getPamPermission({ actor, projectId: "project-1", folderId: "folder-1", accountId: "account-1" });

    // Assert
    expect(getResourcePermission).toHaveBeenCalledWith({
      actor,
      projectId: "project-1",
      type: ProjectType.PAM,
      resources: [
        { resourceType: ResourceType.PamFolder, resourceId: "folder-1" },
        { resourceType: ResourceType.PamAccount, resourceId: "account-1" }
      ],
      roles: expect.any(PamAccountRoles) as unknown
    });
  });

  test("should check a folder alone with the folder roles", async () => {
    // Setup
    const { service, getResourcePermission } = setup();

    // Action
    await service.getPamPermission({ actor, projectId: "project-1", folderId: "folder-1" });

    // Assert
    expect(getResourcePermission).toHaveBeenCalledWith(
      expect.objectContaining({
        resources: [{ resourceType: ResourceType.PamFolder, resourceId: "folder-1" }],
        roles: expect.any(PamFolderRoles) as unknown
      })
    );
  });

  test("should check an account outside any folder on its own", async () => {
    // Setup
    const { service, getResourcePermission } = setup();

    // Action
    await service.getPamPermission({ actor, projectId: "project-1", folderId: null, accountId: "account-1" });

    // Assert
    expect(getResourcePermission).toHaveBeenCalledWith(
      expect.objectContaining({ resources: [{ resourceType: ResourceType.PamAccount, resourceId: "account-1" }] })
    );
  });
});

const grantOf = (slug: string) => Grant.restore({ slug });

const arrangeMemberships = () => {
  const store = new InMemoryGrantStore();
  const seed = new InMemoryGrantSeeder(store);
  const service = new PamPermissionService({} as TProjectResourcePermissionService, new FakeActorGrantsService(store));
  const projectId = "project-1";
  const assign = (
    resourceType: ResourceType,
    resourceId: string,
    role: string,
    {
      userId = "user-1",
      isActive,
      temporaryAccessEndTime
    }: { userId?: string; isActive?: boolean; temporaryAccessEndTime?: Date } = {}
  ) =>
    seed.membership({
      scope: RESOURCE_SCOPE,
      orgId: "org-1",
      projectId,
      resourceType,
      resourceId,
      actor: { userId },
      isActive,
      roles: [{ role, temporaryAccessEndTime }]
    });
  return { service, seed, projectId, assign };
};

const user = (id: string) => ({ type: ActorType.USER as const, id });
const launch = { allOf: [PamResourcePermissionActions.LaunchSessions] };

describe("PamPermissionService.getResourceIdsWithActions", () => {
  test("should list the folders and accounts whose active role allows the actions, directly or through a group", async () => {
    // Setup
    const { service, seed, projectId, assign } = arrangeMemberships();
    await assign(ResourceType.PamFolder, "f-admin", "admin");
    await assign(ResourceType.PamAccount, "a-operator", "operator");
    await assign(ResourceType.PamAccount, "a-auditor", "auditor");
    await assign(ResourceType.PamFolder, "f-ended", "admin", { temporaryAccessEndTime: new Date(Date.now() - 1000) });
    await assign(ResourceType.PamFolder, "f-inactive", "admin", { isActive: false });
    await assign(ResourceType.PamFolder, "f-custom", "custom");
    await assign(ResourceType.PamFolder, "f-other", "admin", { userId: "user-2" });
    const group = await seed.group({ orgId: "org-1" });
    await seed.groupMember({ groupId: group.id, userId: "user-1" });
    await seed.membership({
      scope: RESOURCE_SCOPE,
      orgId: "org-1",
      projectId,
      resourceType: ResourceType.PamFolder,
      resourceId: "f-group",
      actor: { groupId: group.id },
      roles: [{ role: "connector" }]
    });

    // Action
    const result = await service.getResourceIdsWithActions({ actor, projectId, actions: launch });

    // Assert
    expect(result.folderIds.sort()).toEqual(["f-admin", "f-group"]);
    expect(result.accountIds).toEqual(["a-operator"]);
  });

  test("should need every allOf action and at least one anyOf action", async () => {
    // Setup
    const { service, projectId, assign } = arrangeMemberships();
    await assign(ResourceType.PamFolder, "f-admin", "admin");
    await assign(ResourceType.PamFolder, "f-operator", "operator");
    await assign(ResourceType.PamFolder, "f-auditor", "auditor");

    // Action
    const [allOf, anyOf] = await Promise.all([
      service.getResourceIdsWithActions({
        actor,
        projectId,
        actions: { allOf: [PamResourcePermissionActions.LaunchSessions, PamResourcePermissionActions.ManageMembers] }
      }),
      service.getResourceIdsWithActions({
        actor,
        projectId,
        actions: { anyOf: [PamResourcePermissionActions.LaunchSessions, PamResourcePermissionActions.ManageMembers] }
      })
    ]);

    // Assert
    expect(allOf.folderIds).toEqual(["f-admin"]);
    expect(anyOf.folderIds.sort()).toEqual(["f-admin", "f-operator"]);
  });
});

describe("PamPermissionService.getResourceIdsWithActionsForActors", () => {
  test("should answer for each actor under its own key, with an empty entry for one holding nothing", async () => {
    // Setup
    const { service, projectId, assign } = arrangeMemberships();
    await assign(ResourceType.PamFolder, "f1", "operator");
    await assign(ResourceType.PamAccount, "a2", "admin", { userId: "user-2" });

    // Action
    const byActor = await service.getResourceIdsWithActionsForActors({
      actors: [user("user-1"), user("user-2"), user("user-3")],
      projectId,
      actions: launch
    });

    // Assert
    expect([...byActor.get(pamActorKey(user("user-1")))!.folderIds]).toEqual(["f1"]);
    expect([...byActor.get(pamActorKey(user("user-2")))!.accountIds]).toEqual(["a2"]);
    expect(byActor.get(pamActorKey(user("user-3")))).toEqual({ folderIds: new Set(), accountIds: new Set() });
  });
});

describe("PamPermissionService.getLaunchAccessRemainingMs", () => {
  const account = { id: "a1", folderId: "f1" };

  test("should give 0 with no role on the account or its folder", async () => {
    // Setup
    const { service, projectId, assign } = arrangeMemberships();
    await assign(ResourceType.PamFolder, "f-elsewhere", "admin");

    // Action
    const remaining = await service.getLaunchAccessRemainingMs({ actor: user("user-1"), projectId, account });

    // Assert
    expect(remaining).toBe(0);
  });

  test("should give null while a permanent role on the folder grants launching", async () => {
    // Setup
    const { service, projectId, assign } = arrangeMemberships();
    await assign(ResourceType.PamFolder, "f1", "operator");
    await assign(ResourceType.PamAccount, "a1", "admin", { temporaryAccessEndTime: new Date(Date.now() + 60_000) });

    // Action
    const remaining = await service.getLaunchAccessRemainingMs({ actor: user("user-1"), projectId, account });

    // Assert
    expect(remaining).toBeNull();
  });

  test("should give the time left on the latest temporary granting role, and 0 for a role that does not grant", async () => {
    // Setup
    const { service, projectId, assign } = arrangeMemberships();
    await assign(ResourceType.PamAccount, "a1", "operator", { temporaryAccessEndTime: new Date(Date.now() + 60_000) });
    await assign(ResourceType.PamFolder, "f1", "admin", { temporaryAccessEndTime: new Date(Date.now() + 120_000) });
    const auditorOnly = arrangeMemberships();
    await auditorOnly.assign(ResourceType.PamAccount, "a1", "auditor");

    // Action
    const [remaining, none] = await Promise.all([
      service.getLaunchAccessRemainingMs({ actor: user("user-1"), projectId, account }),
      auditorOnly.service.getLaunchAccessRemainingMs({ actor: user("user-1"), projectId, account })
    ]);

    // Assert
    expect(remaining).toBeGreaterThan(110_000);
    expect(remaining).toBeLessThanOrEqual(120_000);
    expect(none).toBe(0);
  });
});

describe("PamPermissionService.getAccountPermissionRules", () => {
  test("should give each account its folder's and its own active roles' rules, and none for an unknown role", async () => {
    // Setup
    const { service, projectId, assign } = arrangeMemberships();
    await assign(ResourceType.PamFolder, "f1", "auditor");
    await assign(ResourceType.PamAccount, "a1", "operator");
    await assign(ResourceType.PamAccount, "a2", "custom");
    await assign(ResourceType.PamAccount, "a3", "admin", { isActive: false });

    // Action
    const rules = await service.getAccountPermissionRules({
      actor,
      projectId,
      accounts: [{ id: "a1", folderId: "f1" }, { id: "a2", folderId: null }, { id: "a3" }]
    });

    // Assert
    expect(rules.get("a1")).toEqual(
      packRules([
        ...new PamFolderRoles().rulesFor(grantOf("auditor")),
        ...new PamAccountRoles().rulesFor(grantOf("operator"))
      ])
    );
    expect(rules.get("a2")).toEqual([]);
    expect(rules.get("a3")).toEqual([]);
  });
});

const membershipOn = (resourceType: ResourceType, resourceId: string): TMembershipRecord => ({
  id: `membership-${resourceId}`,
  scope: RESOURCE_SCOPE,
  scopeOrgId: "org-1",
  scopeProjectId: "project-1",
  scopeResourceType: resourceType,
  scopeResourceId: resourceId,
  actorUserId: "user-1",
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  roles: [
    { id: `role-${resourceId}`, role: "member", isTemporary: false, createdAt: new Date(), updatedAt: new Date() }
  ]
});

const accountPermission = (allowed: boolean, memberships: TMembershipRecord[]) =>
  ProjectResourcePermission.fromGrants<PamResourcePermissionSet>({
    grants: ActorGrants.restore({ memberships, privileges: [], attributes: [] }),
    roles: {
      resourceType: ResourceType.PamAccount,
      rulesFor: () =>
        allowed
          ? [{ action: PamResourcePermissionActions.ViewCredentials, subject: PamResourcePermissionSub.PamResource }]
          : [],
      projectAdminRules: () => []
    },
    isProjectAdmin: false
  });

const accountAccess = {
  actor,
  projectId: "project-1",
  accountId: "account-1",
  folderId: "folder-1",
  action: PamResourcePermissionActions.ViewCredentials
};

describe("PamPermissionService.assertAccountAccess", () => {
  test("should pass when the folder or the account gives the action", async () => {
    // Setup
    const { service, getResourcePermission } = setup();
    getResourcePermission.mockResolvedValue(
      accountPermission(true, [membershipOn(ResourceType.PamFolder, "folder-1")])
    );

    // Action
    const result = service.assertAccountAccess(accountAccess);

    // Assert
    await expect(result).resolves.toBeUndefined();
  });

  test("should refuse a folder member with no role on the account as a non-member of the account", async () => {
    // Setup
    const { service, getResourcePermission } = setup();
    getResourcePermission.mockResolvedValue(
      accountPermission(false, [membershipOn(ResourceType.PamFolder, "folder-1")])
    );

    // Action
    const result = service.assertAccountAccess(accountAccess);

    // Assert
    await expect(result).rejects.toThrow("You are not a member of this pam-account.");
    await expect(result).rejects.toMatchObject({ denial: undefined });
  });

  test("should refuse an account member without the action with the rule denial", async () => {
    // Setup
    const { service, getResourcePermission } = setup();
    getResourcePermission.mockResolvedValue(
      accountPermission(false, [
        membershipOn(ResourceType.PamFolder, "folder-1"),
        membershipOn(ResourceType.PamAccount, "account-1")
      ])
    );

    // Action
    const result = service.assertAccountAccess(accountAccess);

    // Assert
    await expect(result).rejects.toMatchObject({ denial: { action: PamResourcePermissionActions.ViewCredentials } });
  });
});

describe("PamPermissionService.canAccessAccount", () => {
  test("should answer true or false instead of refusing", async () => {
    // Setup
    const { service, getResourcePermission } = setup();
    getResourcePermission
      .mockResolvedValueOnce(accountPermission(true, [membershipOn(ResourceType.PamAccount, "account-1")]))
      .mockResolvedValueOnce(accountPermission(false, [membershipOn(ResourceType.PamAccount, "account-1")]))
      .mockRejectedValueOnce(new PermissionDeniedError({ message: "You are not a member of this pam-account." }));

    // Action
    const answers = [
      await service.canAccessAccount(accountAccess),
      await service.canAccessAccount(accountAccess),
      await service.canAccessAccount(accountAccess)
    ];

    // Assert
    expect(answers).toEqual([true, false, false]);
  });

  test("should rethrow a failure that is not a refusal", async () => {
    // Setup
    const { service, getResourcePermission } = setup();
    getResourcePermission.mockRejectedValueOnce(new Error("database unreachable"));

    // Action
    const result = service.canAccessAccount(accountAccess);

    // Assert
    await expect(result).rejects.toThrow("database unreachable");
  });
});
