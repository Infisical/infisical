import { createMongoAbility, ForbiddenError } from "@casl/ability";
import { vi } from "vitest";

import {
  OrgPermissionSecretsManagementInsightsActions,
  OrgPermissionSet,
  OrgPermissionSubjects
} from "@app/ee/services/permission/org-permission";
import { ActorType, AuthMethod } from "@app/services/auth/auth-type";

import { secretV2BridgeServiceFactory } from "./secret-v2-bridge-service";
import { SecretValueSearchScope } from "./secret-v2-bridge-types";

const actor = {
  type: ActorType.USER,
  id: "user",
  authMethod: AuthMethod.EMAIL,
  orgId: "org",
  rootOrgId: "org",
  parentOrgId: "org"
};

const buildService = (insightsActions: OrgPermissionSecretsManagementInsightsActions[]) => {
  const orgDAL = { findById: vi.fn(async () => ({ id: "org", orgWideSecretValueTrackingEnabled: true })) };
  const projectDAL = { find: vi.fn(async () => []), findById: vi.fn() };

  const service = secretV2BridgeServiceFactory({
    orgDAL,
    projectDAL,
    permissionService: {
      getOrgPermission: vi.fn(async () => ({
        permission: createMongoAbility<OrgPermissionSet>(
          insightsActions.map((action) => ({ action, subject: OrgPermissionSubjects.SecretsManagementInsights }))
        ),
        memberships: [],
        hasRole: () => false
      })),
      getProjectPermission: vi.fn(),
      getProjectPermissionFingerprint: vi.fn()
    }
  } as unknown as Parameters<typeof secretV2BridgeServiceFactory>[0]);

  return { service, orgDAL, projectDAL };
};

describe("findSecretsByValue", () => {
  // The results name secrets in projects the caller may not be a member of, so the org-wide
  // permission is the only way in. There is no narrower per-project path.
  test("refuses a caller without Search All Secret Values before reading anything", async () => {
    const { service, orgDAL, projectDAL } = buildService([OrgPermissionSecretsManagementInsightsActions.Read]);

    await expect(
      service.findSecretsByValue({ secretValue: "value", scope: SecretValueSearchScope.Organization }, actor)
    ).rejects.toThrow(ForbiddenError);

    expect(orgDAL.findById).not.toHaveBeenCalled();
    expect(projectDAL.find).not.toHaveBeenCalled();
  });

  test("lets a caller with Search All Secret Values through", async () => {
    const { service } = buildService([OrgPermissionSecretsManagementInsightsActions.SearchAllSecretValues]);

    await expect(
      service.findSecretsByValue({ secretValue: "value", scope: SecretValueSearchScope.Organization }, actor)
    ).resolves.toEqual({ secrets: [] });
  });
});
