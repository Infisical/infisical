import { ProjectType, ResourceType } from "@app/db/schemas";
import type { TActorContext } from "@app/domains/lib/actor-context";
import { ProjectResourcePermission, TProjectResourcePermissionService } from "@app/domains/platform/projects/ce/module";
import { ActorType, AuthMethod } from "@app/lib/auth/actor-types";

import { SignerRoles } from "../../models/signer-resource-roles";
import { SignerPermissionService } from "./service";

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

describe("SignerPermissionService.getSignerPermission", () => {
  test("should check the signer as a resource of a Certificate Manager project", async () => {
    // Setup
    const permission = ProjectResourcePermission.none();
    const getResourcePermission = vi.fn(async () => permission);
    const service = new SignerPermissionService({ getResourcePermission } as TProjectResourcePermissionService);

    // Action
    const result = await service.getSignerPermission({ actor, projectId: "project-1", signerId: "signer-1" });

    // Assert
    expect(result).toBe(permission);
    expect(getResourcePermission).toHaveBeenCalledWith({
      actor,
      projectId: "project-1",
      type: ProjectType.CertificateManager,
      resources: [{ resourceType: ResourceType.Signer, resourceId: "signer-1" }],
      roles: expect.any(SignerRoles) as unknown
    });
  });
});
