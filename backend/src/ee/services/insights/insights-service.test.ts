import { createMongoAbility, MongoAbility } from "@casl/ability";
import { describe, expect, test } from "vitest";

import { TFeatureSet } from "@app/ee/services/license/license-types";
import {
  OrgPermissionSecretsManagementInsightsActions,
  OrgPermissionSet,
  OrgPermissionSubjects
} from "@app/ee/services/permission/org-permission";
import { ActorType, AuthMethod } from "@app/services/auth/auth-type";

import { insightsServiceFactory, PROJECT_WARNINGS_CHUNK_SIZE, TInsightsServiceFactoryDep } from "./insights-service";
import { TSecretsProjectWarning } from "./insights-types";

const ORG_ID = "org-insights-chunk";
const CATALOG_SIZE = 1500;

const unreachable = (method: string) => (): never => {
  throw new Error(`insights unit test stub: ${method} was called unexpectedly`);
};

const projectScopedDepStubs: Pick<
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

const fakeProject = (index: number): TSecretsProjectWarning => ({
  projectId: `00000000-0000-0000-0000-${String(index).padStart(12, "0")}`,
  projectName: `project-${index}`,
  projectSlug: `project-${index}`,
  totalSecrets: 0,
  severityScore: 0,
  warnings: {
    duplicatedSecrets: 0,
    staleSecrets: 0,
    failedRotations: 0,
    failedSyncs: 0,
    orphanedLeases: 0
  }
});

const buildCatalog = (size: number) => Array.from({ length: size }, (_, index) => fakeProject(index));

const orgReadAbility = (): MongoAbility<OrgPermissionSet> =>
  createMongoAbility<OrgPermissionSet>([
    {
      action: OrgPermissionSecretsManagementInsightsActions.Read,
      subject: OrgPermissionSubjects.SecretsManagementInsights
    }
  ]);

const buildService = (catalog: TSecretsProjectWarning[]) => {
  const dalCalls: { offset: number; limit: number }[] = [];

  const service = insightsServiceFactory({
    ...projectScopedDepStubs,
    permissionService: {
      getProjectPermission: unreachable("permissionService.getProjectPermission"),
      getOrgPermission: async () => ({
        permission: orgReadAbility(),
        memberships: [],
        hasRole: () => false
      })
    } as TInsightsServiceFactoryDep["permissionService"],
    licenseService: {
      getPlan: async () => ({ secretAccessInsights: true }) as unknown as TFeatureSet
    } as TInsightsServiceFactoryDep["licenseService"],
    keyStore: {
      getItem: async () => null,
      setItemWithExpiry: async () => "OK",
      ttl: async () => -2
    },
    orgDAL: { countSecretManagerProjectMembers: unreachable("orgDAL.countSecretManagerProjectMembers") },
    identityOrgMembershipDAL: {
      countSecretManagerProjectIdentities: unreachable("identityOrgMembershipDAL.countSecretManagerProjectIdentities")
    },
    dynamicSecretLeaseDAL: {
      countLeasesForOrg: unreachable("dynamicSecretLeaseDAL.countLeasesForOrg")
    },
    insightsDAL: {
      findSecretCreationsByWeekForOrg: unreachable("insightsDAL.findSecretCreationsByWeekForOrg"),
      countSecretCreationsForOrg: unreachable("insightsDAL.countSecretCreationsForOrg"),
      findProjectWarningsForOrg: async (_orgId, { offset, limit }) => {
        dalCalls.push({ offset, limit });
        return {
          projects: catalog.slice(offset, offset + limit),
          totalProjects: catalog.length,
          projectsWithIssues: 0
        };
      }
    }
  });

  return { service, dalCalls };
};

const actor = (offset: number, limit: number) => ({
  actor: ActorType.USER,
  actorId: "user-1",
  actorAuthMethod: AuthMethod.EMAIL,
  actorOrgId: ORG_ID,
  orgId: ORG_ID,
  offset,
  limit
});

describe("getSecretsProjects chunk pagination", () => {
  test("a page inside the first chunk fetches that chunk and slices offset + limit from it", async () => {
    const catalog = buildCatalog(CATALOG_SIZE);
    const { service, dalCalls } = buildService(catalog);
    const offset = 50;
    const limit = 20;

    const result = await service.getSecretsProjects(actor(offset, limit));

    expect(dalCalls).toEqual([{ offset: 0, limit: PROJECT_WARNINGS_CHUNK_SIZE }]);
    expect(result.offset).toBe(offset);
    expect(result.limit).toBe(limit);
    expect(result.projects).toEqual(catalog.slice(offset, offset + limit));
  });

  test("a page that spans a chunk boundary fetches both chunks and concatenates the window", async () => {
    const catalog = buildCatalog(CATALOG_SIZE);
    const { service, dalCalls } = buildService(catalog);
    const offset = PROJECT_WARNINGS_CHUNK_SIZE - 10;
    const limit = 20;

    const result = await service.getSecretsProjects(actor(offset, limit));

    expect(dalCalls).toEqual([
      { offset: 0, limit: PROJECT_WARNINGS_CHUNK_SIZE },
      { offset: PROJECT_WARNINGS_CHUNK_SIZE, limit: PROJECT_WARNINGS_CHUNK_SIZE }
    ]);
    expect(result.offset).toBe(offset);
    expect(result.limit).toBe(limit);
    expect(result.projects).toEqual(catalog.slice(offset, offset + limit));
  });

  test("a page that starts on the second chunk fetches only that chunk", async () => {
    const catalog = buildCatalog(CATALOG_SIZE);
    const { service, dalCalls } = buildService(catalog);
    const offset = PROJECT_WARNINGS_CHUNK_SIZE;
    const limit = 20;

    const result = await service.getSecretsProjects(actor(offset, limit));

    expect(dalCalls).toEqual([{ offset: PROJECT_WARNINGS_CHUNK_SIZE, limit: PROJECT_WARNINGS_CHUNK_SIZE }]);
    expect(result.offset).toBe(offset);
    expect(result.limit).toBe(limit);
    expect(result.projects).toEqual(catalog.slice(offset, offset + limit));
  });
});
