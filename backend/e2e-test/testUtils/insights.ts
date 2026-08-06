import { TInsightsServiceFactoryDep } from "@app/ee/services/insights/insights-service";

// The insights service covers both the per-project dashboard and the org-wide aggregates, so its factory
// takes every dependency both halves need. Specs that only exercise the org-wide methods supply these
// stubs for the project-scoped half.
//
// They throw rather than return empty values on purpose: a spec that accidentally reaches a project-scoped
// code path should fail loudly instead of quietly asserting against a zero the stub invented.
const unreachable =
  (method: string) =>
  (): never => {
    throw new Error(
      `insights test stub: ${method} was called, but this spec only exercises org-scoped insights. ` +
        `Provide a real dependency if the assertion under test needs it.`
    );
  };

// Specs supply their own getOrgPermission; this fills the other half of the permissionService contract.
export const unreachableGetProjectPermission: Pick<
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
    countByIpAddress: unreachable("auditLogDAL.countByIpAddress"),
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

// getSecretsUsageInsights does not cache; getSecretsProjectWarnings does. A pass-through keyStore makes every
// read miss so each call hits the database directly.
export const passThroughKeyStore: TInsightsServiceFactoryDep["keyStore"] = {
  getItem: async () => null,
  setItemWithExpiry: async () => "OK",
  ttl: async () => -2
};
