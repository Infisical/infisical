import { createMongoAbility, ForbiddenError } from "@casl/ability";
import { vi } from "vitest";

import {
  OrgPermissionSecretsManagementInsightsActions,
  OrgPermissionSet,
  OrgPermissionSubjects
} from "@app/ee/services/permission/org-permission";
import { BadRequestError } from "@app/lib/errors";
import { ActorType, AuthMethod } from "@app/services/auth/auth-type";

import { insightsServiceFactory, TInsightsServiceFactoryDep } from "./insights-service";

const dto = {
  secretValue: "value",
  orgId: "org",
  actor: ActorType.USER,
  actorId: "user",
  actorAuthMethod: AuthMethod.EMAIL,
  actorOrgId: "org"
};

const buildService = ({
  insightsActions,
  hasInsightsPlan = true
}: {
  insightsActions: OrgPermissionSecretsManagementInsightsActions[];
  hasInsightsPlan?: boolean;
}) => {
  const orgDAL = { findById: vi.fn(async () => ({ id: "org", orgWideSecretValueTrackingEnabled: true })) };
  const secretV2BridgeDAL = { findSecretsWithMatchingValue: vi.fn(async () => []) };

  const service = insightsServiceFactory({
    orgDAL,
    secretV2BridgeDAL,
    kmsService: {
      createCipherPairWithDataKey: vi.fn(async () => ({
        generateSecretBlindIndex: async () => "digest"
      }))
    },
    licenseService: { getPlan: vi.fn(async () => ({ secretAccessInsights: hasInsightsPlan })) },
    permissionService: {
      getOrgPermission: vi.fn(async () => ({
        permission: createMongoAbility<OrgPermissionSet>(
          insightsActions.map((action) => ({ action, subject: OrgPermissionSubjects.SecretsManagementInsights }))
        ),
        memberships: [],
        hasRole: () => false
      })),
      getProjectPermission: vi.fn()
    }
  } as unknown as TInsightsServiceFactoryDep);

  return { service, orgDAL, secretV2BridgeDAL };
};

describe("searchOrgSecretsByValue", () => {
  // The results name secrets in projects the caller may not be a member of, so the org-wide
  // permission is the only way in. There is no narrower per-project path.
  test("refuses a caller without Search All Secret Values before reading anything", async () => {
    const { service, orgDAL, secretV2BridgeDAL } = buildService({
      insightsActions: [OrgPermissionSecretsManagementInsightsActions.Read]
    });

    await expect(service.searchOrgSecretsByValue(dto)).rejects.toThrow(ForbiddenError);

    expect(orgDAL.findById).not.toHaveBeenCalled();
    expect(secretV2BridgeDAL.findSecretsWithMatchingValue).not.toHaveBeenCalled();
  });

  test("refuses an org whose plan does not include insights", async () => {
    const { service, secretV2BridgeDAL } = buildService({
      insightsActions: [OrgPermissionSecretsManagementInsightsActions.SearchAllSecretValues],
      hasInsightsPlan: false
    });

    await expect(service.searchOrgSecretsByValue(dto)).rejects.toThrow(BadRequestError);

    expect(secretV2BridgeDAL.findSecretsWithMatchingValue).not.toHaveBeenCalled();
  });

  test("lets a caller with Search All Secret Values on an insights plan through", async () => {
    const { service } = buildService({
      insightsActions: [OrgPermissionSecretsManagementInsightsActions.SearchAllSecretValues]
    });

    await expect(service.searchOrgSecretsByValue(dto)).resolves.toEqual([]);
  });
});
