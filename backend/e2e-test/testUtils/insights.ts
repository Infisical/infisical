import { createMongoAbility, MongoAbility } from "@casl/ability";

import { TInsightsServiceFactoryDep } from "@app/ee/services/insights/insights-service";
import { TFeatureSet } from "@app/ee/services/license/license-types";
import {
  OrgPermissionSecretsManagementInsightsActions,
  OrgPermissionSet,
  OrgPermissionSubjects
} from "@app/ee/services/permission/org-permission";

// The insights service covers both the per-project dashboard and the org-wide aggregates, so its factory
// takes every dependency both halves need. Specs that only exercise the org-wide methods supply these
// stubs for the project-scoped half.
//
// They throw rather than return empty values on purpose: a spec that accidentally reaches a project-scoped
// code path should fail loudly instead of quietly asserting against a zero the stub invented.
const unreachable = (method: string) => (): never => {
  throw new Error(
    `insights test stub: ${method} was called, but this spec only exercises org-scoped insights. ` +
      `Provide a real dependency if the assertion under test needs it.`
  );
};

// Specs supply their own getOrgPermission; this fills the other half of the permissionService contract.
const unreachableGetProjectPermission: Pick<
  TInsightsServiceFactoryDep["permissionService"],
  "getProjectPermission"
> = {
  getProjectPermission: unreachable("permissionService.getProjectPermission")
};

export const projectScopedInsightsDepStubs: Pick<
  TInsightsServiceFactoryDep,
  | "auditLogDAL"
  | "secretRotationV2DAL"
  | "reminderDAL"
  | "folderDAL"
  | "secretV2BridgeDAL"
  | "dynamicSecretDAL"
  | "honeyTokenDAL"
  | "projectBotService"
  | "projectDAL"
  | "userDAL"
  | "kmsService"
> = {
  auditLogDAL: {
    countByDateAndActor: unreachable("auditLogDAL.countByDateAndActor"),
    countByAuthMethod: unreachable("auditLogDAL.countByAuthMethod")
  },
  secretRotationV2DAL: {
    findByProjectAndDateRange: unreachable("secretRotationV2DAL.findByProjectAndDateRange"),
    findByProject: unreachable("secretRotationV2DAL.findByProject"),
    countByProject: unreachable("secretRotationV2DAL.countByProject")
  },
  reminderDAL: {
    findByProjectAndDateRange: unreachable("reminderDAL.findByProjectAndDateRange")
  },
  folderDAL: {
    findSecretPathByFolderIds: unreachable("folderDAL.findSecretPathByFolderIds"),
    countByProject: unreachable("folderDAL.countByProject")
  },
  secretV2BridgeDAL: {
    findStaleByProject: unreachable("secretV2BridgeDAL.findStaleByProject"),
    countStaleByProject: unreachable("secretV2BridgeDAL.countStaleByProject"),
    findDuplicatedSecretValues: unreachable("secretV2BridgeDAL.findDuplicatedSecretValues"),
    countByProject: unreachable("secretV2BridgeDAL.countByProject")
  },
  dynamicSecretDAL: {
    countByProject: unreachable("dynamicSecretDAL.countByProject")
  },
  honeyTokenDAL: {
    countByProjectId: unreachable("honeyTokenDAL.countByProjectId")
  },
  projectBotService: {
    getBotKey: unreachable("projectBotService.getBotKey")
  },
  projectDAL: {
    findById: unreachable("projectDAL.findById")
  },
  userDAL: {
    find: unreachable("userDAL.find")
  },
  kmsService: {
    createCipherPairWithDataKey: unreachable("kmsService.createCipherPairWithDataKey")
  }
};

// getSecretsUsageInsights is the only method that reads these three counts, and it has its own spec.
// The other org-wide specs supply these so an accidental call fails loudly instead of asserting
// against a zero a stub invented.
export const usageInsightsDepStubs: Pick<
  TInsightsServiceFactoryDep,
  "orgDAL" | "identityOrgMembershipDAL" | "dynamicSecretLeaseDAL"
> = {
  orgDAL: {
    countSecretManagerProjectMembers: unreachable("orgDAL.countSecretManagerProjectMembers")
  },
  identityOrgMembershipDAL: {
    countSecretManagerProjectIdentities: unreachable("identityOrgMembershipDAL.countSecretManagerProjectIdentities")
  },
  dynamicSecretLeaseDAL: {
    countLeasesForOrg: unreachable("dynamicSecretLeaseDAL.countLeasesForOrg")
  }
};

// Every org-wide insight is gated on the same org read permission plus the same plan entitlement, so specs
// share one set of stubs for that gate and flip the two toggles to exercise the two rejection paths.
export const buildOrgInsightsGateStubs = () => {
  let canReadInsights = true;
  let planHasInsights = true;

  const buildPermission = (canRead: boolean): MongoAbility<OrgPermissionSet> =>
    createMongoAbility<OrgPermissionSet>(
      canRead
        ? [
            {
              action: OrgPermissionSecretsManagementInsightsActions.Read,
              subject: OrgPermissionSubjects.SecretsManagementInsights
            }
          ]
        : []
    );

  return {
    permissionService: {
      ...unreachableGetProjectPermission,
      getOrgPermission: async () => ({
        permission: buildPermission(canReadInsights),
        memberships: [],
        hasRole: () => false
      })
    } as TInsightsServiceFactoryDep["permissionService"],
    licenseService: {
      getPlan: async () => ({ secretAccessInsights: planHasInsights }) as unknown as TFeatureSet
    } as TInsightsServiceFactoryDep["licenseService"],
    setCanReadInsights: (canRead: boolean) => {
      canReadInsights = canRead;
    },
    setPlanHasInsights: (hasPlan: boolean) => {
      planHasInsights = hasPlan;
    }
  };
};

// getSecretsUsageInsights does not cache; getSecretsProjectWarnings does. A pass-through keyStore makes every
// read miss so each call hits the database directly.
export const passThroughKeyStore: TInsightsServiceFactoryDep["keyStore"] = {
  getItem: async () => null,
  setItemWithExpiry: async () => "OK",
  ttl: async () => -2
};
