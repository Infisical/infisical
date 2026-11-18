import { ProjectType } from "@app/db/schemas";
import type { TActorContext } from "@app/domains/lib/actor-context";
import { ProjectPermission, TProjectPermissionService } from "@app/domains/platform/projects/ce/module";
import { ActorType, AuthMethod } from "@app/lib/auth/actor-types";

import { KmsPermissionService } from "./service";

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

describe("KmsPermissionService.getKmsPermission", () => {
  test("should ask Projects for the permission in a KMS project", async () => {
    // Setup
    const permission = {} as ProjectPermission;
    const getProjectPermission = vi.fn(async () => permission);
    const service = new KmsPermissionService({ getProjectPermission } as unknown as TProjectPermissionService);

    // Action
    const result = await service.getKmsPermission({ actor, projectId: "project-1" });

    // Assert
    expect(result).toBe(permission);
    expect(getProjectPermission).toHaveBeenCalledWith({ actor, projectId: "project-1", type: ProjectType.KMS });
  });
});
