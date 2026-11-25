import { ProjectType, ResourceType } from "@app/db/schemas";
import type { TActorContext } from "@app/domains/lib/actor-context";
import { FakeActorAuditConfig } from "@app/domains/lib/actor-context/testing/fake-actor-audit-config";
import { ProjectResourcePermission, TProjectResourcePermissionService } from "@app/domains/platform/projects/ce/module";
import { ActorType, AuthMethod } from "@app/lib/auth/actor-types";

import { ApplicationRoles } from "../../models/application-resource-roles";
import { ApplicationPermissionService } from "./service";

const actor: TActorContext = {
  audit: new FakeActorAuditConfig(),
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

describe("ApplicationPermissionService.getApplicationPermission", () => {
  test("should check the application as a resource of a Certificate Manager project", async () => {
    // Setup
    const permission = ProjectResourcePermission.none();
    const getResourcePermission = vi.fn(async () => permission);
    const service = new ApplicationPermissionService({ getResourcePermission } as TProjectResourcePermissionService);

    // Action
    const result = await service.getApplicationPermission({ actor, projectId: "project-1", applicationId: "app-1" });

    // Assert
    expect(result).toBe(permission);
    expect(getResourcePermission).toHaveBeenCalledWith({
      actor,
      projectId: "project-1",
      type: ProjectType.CertificateManager,
      resources: [{ resourceType: ResourceType.CertificateApplication, resourceId: "app-1" }],
      roles: expect.any(ApplicationRoles) as unknown
    });
  });
});
