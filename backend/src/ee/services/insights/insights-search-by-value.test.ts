import { createMongoAbility } from "@casl/ability";
import { vi } from "vitest";

import { TActorContext } from "@app/domains/lib/actor-context";
import { PermissionDeniedError } from "@app/domains/lib/errors";
import { Permission } from "@app/domains/platform/access-control/ce/module";
import { FakeLicenseService } from "@app/domains/platform/license/ce/testing/fake-license-service";
import {
  OrgPermissionSecretsManagementInsightsActions,
  OrgPermissionSet,
  OrgPermissionSubjects
} from "@app/domains/platform/organizations/ce/module";
import { ActorType, AuthMethod } from "@app/lib/auth/actor-types";
import { BadRequestError } from "@app/lib/errors";

import { insightsServiceFactory, TInsightsServiceFactoryDep } from "./insights-service";

const dto = {
  secretValue: "value",
  orgId: "org",
  actor: {
    principal: { type: ActorType.USER, id: "user", authMethod: AuthMethod.EMAIL },
    org: { id: "org", rootOrgId: "org", parentOrgId: "org" }
  } as unknown as TActorContext
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
    kmsDataKeyService: {
      createCipherPairWithDataKey: vi.fn(async () => ({
        generateSecretBlindIndex: async () => "digest"
      }))
    },
    licenseService: new FakeLicenseService().setPlan("org", { secretAccessInsights: hasInsightsPlan }),
    orgPermissionService: {
      getOrgPermission: vi.fn(async () =>
        Permission.fromRules({
          rules: createMongoAbility<OrgPermissionSet>(
            insightsActions.map((action) => ({ action, subject: OrgPermissionSubjects.SecretsManagementInsights }))
          ).rules
        })
      )
    },
    secretsPermissionService: { getSecretsPermission: vi.fn() }
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

    await expect(service.searchOrgSecretsByValue(dto)).rejects.toThrow(PermissionDeniedError);

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
