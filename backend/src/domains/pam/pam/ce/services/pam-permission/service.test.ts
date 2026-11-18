import { ProjectType, ResourceType } from "@app/db/schemas";
import type { TActorContext } from "@app/domains/lib/actor-context";
import { ProjectResourcePermission, TProjectResourcePermissionService } from "@app/domains/platform/projects/ce/module";
import { ActorType, AuthMethod } from "@app/lib/auth/actor-types";

import { PamAccountRoles, PamFolderRoles } from "../../models/pam-resource-roles";
import { PamPermissionService } from "./service";

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
  const service = new PamPermissionService({ getResourcePermission } as TProjectResourcePermissionService);
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
