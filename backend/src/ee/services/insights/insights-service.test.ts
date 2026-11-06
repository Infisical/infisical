import { createMongoAbility, MongoAbility } from "@casl/ability";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { IdentityAuthMethod } from "@app/db/schemas";
import { TFeatureSet } from "@app/ee/services/license/license-types";
import {
  OrgPermissionSecretsManagementInsightsActions,
  OrgPermissionSet,
  OrgPermissionSubjects
} from "@app/ee/services/permission/org-permission";
import { ProjectPermissionInsightsActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { OrgServiceActor } from "@app/lib/types";
import { ActorType, AuthMethod } from "@app/services/auth/auth-type";

import { insightsServiceFactory, PROJECT_WARNINGS_CHUNK_SIZE, TInsightsServiceFactoryDep } from "./insights-service";
import { TSecretsProjectWarning } from "./insights-types";

type TClickHouseAuditLogDAL = NonNullable<TInsightsServiceFactoryDep["clickhouseAuditLogDAL"]>;

const appConfig = { CLICKHOUSE_AUDIT_LOG_ENABLED: false };

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => appConfig
}));

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
    findDuplicatedSecretValuesInOrg: unreachable("secretV2BridgeDAL.findDuplicatedSecretValuesInOrg"),
    findSecretsWithMatchingValue: unreachable("secretV2BridgeDAL.findSecretsWithMatchingValue"),
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
    orgDAL: {
      countSecretManagerProjectMembers: unreachable("orgDAL.countSecretManagerProjectMembers"),
      findById: unreachable("orgDAL.findById")
    },
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

describe("project access insights audit log store", () => {
  const PROJECT_ID = "project-insights-store";
  const today = new Date().toISOString().slice(0, 10);

  const projectActor = {
    type: ActorType.USER,
    id: "user-1",
    authMethod: AuthMethod.EMAIL,
    orgId: ORG_ID,
    rootOrgId: ORG_ID,
    parentOrgId: ORG_ID
  } as OrgServiceActor;

  const buildProjectService = ({ withClickHouse }: { withClickHouse: boolean }) => {
    const postgres = {
      countByDateAndActor: vi.fn(async () => []),
      countByAuthMethod: vi.fn(async () => [])
    };
    const volumeRows: Awaited<ReturnType<TClickHouseAuditLogDAL["countByDateAndActorForProject"]>> = [
      { date: today, actor: ActorType.USER, actorMetadata: { userId: "user-1", email: "ada@example.com" }, count: 2 },
      { date: today, actor: ActorType.IDENTITY, actorMetadata: { identityId: "identity-1", name: "ci-bot" }, count: 4 }
    ];
    const authMethodRows: Awaited<ReturnType<TClickHouseAuditLogDAL["countByAuthMethodForProject"]>> = [
      { actor: ActorType.IDENTITY, actorMetadata: { authMethod: IdentityAuthMethod.UNIVERSAL_AUTH }, count: 4 },
      { actor: ActorType.USER, actorMetadata: { authMethod: AuthMethod.EMAIL }, count: 2 }
    ];
    const clickhouse = {
      countByDateForOrg: unreachable("clickhouseAuditLogDAL.countByDateForOrg"),
      countByIdentityAuthMethodForOrg: unreachable("clickhouseAuditLogDAL.countByIdentityAuthMethodForOrg"),
      countByDateAndActorForProject: vi.fn(async () => volumeRows),
      countByAuthMethodForProject: vi.fn(async () => authMethodRows)
    };

    const service = insightsServiceFactory({
      ...projectScopedDepStubs,
      auditLogDAL: postgres,
      clickhouseAuditLogDAL: withClickHouse ? clickhouse : undefined,
      userDAL: {
        find: async () => [{ id: "user-1", firstName: "Ada", lastName: "Lovelace" }]
      } as unknown as TInsightsServiceFactoryDep["userDAL"],
      permissionService: {
        getProjectPermission: async () => ({
          permission: createMongoAbility([
            { action: ProjectPermissionInsightsActions.Read, subject: ProjectPermissionSub.Insights }
          ])
        }),
        getOrgPermission: unreachable("permissionService.getOrgPermission")
      } as unknown as TInsightsServiceFactoryDep["permissionService"],
      licenseService: {
        getPlan: async () => ({ secretAccessInsights: true }) as unknown as TFeatureSet
      } as TInsightsServiceFactoryDep["licenseService"],
      keyStore: {
        getItem: async () => null,
        setItemWithExpiry: async () => "OK",
        ttl: async () => -2
      },
      orgDAL: {
        countSecretManagerProjectMembers: unreachable("orgDAL.countSecretManagerProjectMembers"),
        findById: unreachable("orgDAL.findById")
      },
      identityOrgMembershipDAL: {
        countSecretManagerProjectIdentities: unreachable("identityOrgMembershipDAL.countSecretManagerProjectIdentities")
      },
      dynamicSecretLeaseDAL: {
        countLeasesForOrg: unreachable("dynamicSecretLeaseDAL.countLeasesForOrg")
      },
      insightsDAL: {
        findSecretCreationsByWeekForOrg: unreachable("insightsDAL.findSecretCreationsByWeekForOrg"),
        countSecretCreationsForOrg: unreachable("insightsDAL.countSecretCreationsForOrg"),
        findProjectWarningsForOrg: unreachable("insightsDAL.findProjectWarningsForOrg")
      }
    });

    return { service, postgres, clickhouse };
  };

  beforeEach(() => {
    appConfig.CLICKHOUSE_AUDIT_LOG_ENABLED = false;
  });

  test("reads Postgres when ClickHouse audit logging is off", async () => {
    const { service, postgres, clickhouse } = buildProjectService({ withClickHouse: true });

    await service.getAccessVolume({ projectId: PROJECT_ID }, projectActor);
    await service.getAuthMethodDistribution({ projectId: PROJECT_ID, days: 30 }, projectActor);

    expect(postgres.countByDateAndActor).toHaveBeenCalledOnce();
    expect(postgres.countByAuthMethod).toHaveBeenCalledOnce();
    expect(clickhouse.countByDateAndActorForProject).not.toHaveBeenCalled();
    expect(clickhouse.countByAuthMethodForProject).not.toHaveBeenCalled();
  });

  test("reads Postgres when ClickHouse audit logging is on but no ClickHouse is configured", async () => {
    appConfig.CLICKHOUSE_AUDIT_LOG_ENABLED = true;
    const { service, postgres } = buildProjectService({ withClickHouse: false });

    await service.getAccessVolume({ projectId: PROJECT_ID }, projectActor);
    await service.getAuthMethodDistribution({ projectId: PROJECT_ID, days: 30 }, projectActor);

    expect(postgres.countByDateAndActor).toHaveBeenCalledOnce();
    expect(postgres.countByAuthMethod).toHaveBeenCalledOnce();
  });

  test("reads ClickHouse when it holds the audit logs, and labels actors and auth methods as for Postgres", async () => {
    appConfig.CLICKHOUSE_AUDIT_LOG_ENABLED = true;
    const { service, postgres, clickhouse } = buildProjectService({ withClickHouse: true });

    const volume = await service.getAccessVolume({ projectId: PROJECT_ID }, projectActor);
    const { methods } = await service.getAuthMethodDistribution({ projectId: PROJECT_ID, days: 30 }, projectActor);

    expect(postgres.countByDateAndActor).not.toHaveBeenCalled();
    expect(postgres.countByAuthMethod).not.toHaveBeenCalled();
    expect(clickhouse.countByDateAndActorForProject).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: ORG_ID, projectId: PROJECT_ID })
    );
    expect(clickhouse.countByAuthMethodForProject).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: ORG_ID, projectId: PROJECT_ID })
    );

    expect(volume.days.find((day) => day.date === today)).toEqual({
      date: today,
      total: 6,
      actors: [
        { name: "ci-bot", type: ActorType.IDENTITY, count: 4 },
        { name: "Ada Lovelace", type: ActorType.USER, count: 2 }
      ]
    });
    expect(methods).toEqual([
      { method: "Universal Auth", count: 4 },
      { method: "Email", count: 2 }
    ]);
  });
});
