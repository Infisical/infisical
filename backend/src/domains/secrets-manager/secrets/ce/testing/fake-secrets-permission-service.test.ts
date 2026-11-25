import { SecretFolderRole } from "@app/db/schemas";
import type { TActorContext } from "@app/domains/lib/actor-context";
import { FakeActorAuditConfig } from "@app/domains/lib/actor-context/testing/fake-actor-audit-config";
import {
  ProjectPermissionSecretActions,
  ProjectPermissionSub,
  TProjectRule
} from "@app/domains/platform/projects/ce/module";
import { ActorType, AuthMethod } from "@app/lib/auth/actor-types";

import { FolderGrant } from "../models/folder-grant";
import { FakeSecretsPermissionService } from "./fake-secrets-permission-service";

const actor: TActorContext = {
  audit: new FakeActorAuditConfig(),
  principal: {
    type: ActorType.USER,
    id: "user-id",
    username: "u",
    email: null,
    authMethod: AuthMethod.EMAIL,
    isSuperAdmin: false
  },
  org: {
    id: "org-id",
    name: "org",
    rootOrgId: "org-id",
    parentOrgId: "org-id",
    shouldUseNewPrivilegeSystem: true,
    ssoPolicy: { authEnforced: false, googleSsoAuthEnforced: false, bypassOrgAuthEnabled: false }
  }
};

const editAt = (secretPath: string) => ({
  action: ProjectPermissionSecretActions.Edit,
  subject: ProjectPermissionSub.Secrets,
  fields: { environment: "prod", secretPath }
});

describe("FakeSecretsPermissionService.getSecretsPermission", () => {
  test("should layer the folder grants over the rules, like the real service", async () => {
    // Setup
    const fake = new FakeSecretsPermissionService();
    fake.rules = [
      { action: ProjectPermissionSecretActions.Edit, subject: ProjectPermissionSub.Secrets } as TProjectRule
    ];
    fake.folderGrants = [
      FolderGrant.restore({
        id: "grant-id",
        name: "",
        actorId: "user-id",
        folderId: "folder-id",
        role: SecretFolderRole.List,
        environmentSlug: "prod",
        secretPath: "/app",
        isTemporary: false,
        temporaryAccessStartTime: null,
        temporaryAccessEndTime: null
      })
    ];

    // Action
    const { permission } = await fake.getSecretsPermission({ actor, projectId: "project-id" });

    // Assert
    expect(permission.can(editAt("/app"))).toBe(false);
    expect(permission.can(editAt("/other"))).toBe(true);
  });
});
