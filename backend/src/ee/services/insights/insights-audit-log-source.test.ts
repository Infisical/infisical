import { createMongoAbility } from "@casl/ability";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { IdentityAuthMethod } from "@app/db/schemas";
import { TFeatureSet } from "@app/ee/services/license/license-types";
import { ProjectPermissionInsightsActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { OrgServiceActor } from "@app/lib/types";
import { ActorType, AuthMethod } from "@app/services/auth/auth-type";

import { insightsServiceFactory, TInsightsServiceFactoryDep } from "./insights-service";

const config = { CLICKHOUSE_AUDIT_LOG_ENABLED: false };

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => config
}));

const ORG_ID = "00000000-0000-0000-0000-000000000001";
const PROJECT_ID = "project-1";
const TODAY = new Date().toISOString().slice(0, 10);

const actorDto = {
  type: ActorType.USER,
  id: "user-1",
  authMethod: AuthMethod.EMAIL,
  orgId: ORG_ID,
  rootOrgId: ORG_ID,
  parentOrgId: ORG_ID
} as OrgServiceActor;

const buildService = () => {
  const postgres = {
    countByDateAndActor: vi.fn(async () => []),
    countByAuthMethod: vi.fn(async () => [])
  };
  const clickhouse = {
    countByDateForOrg: vi.fn(async () => []),
    countByIdentityAuthMethodForOrg: vi.fn(async () => []),
    countByDateAndActorForProject: vi.fn(async () => [
      { date: TODAY, actor: ActorType.IDENTITY, actorMetadata: { name: "ci-bot", identityId: "i-1" }, count: 4 }
    ]),
    countByAuthMethodForProject: vi.fn(async () => [
      { actor: ActorType.IDENTITY, actorMetadata: { authMethod: IdentityAuthMethod.UNIVERSAL_AUTH }, count: 3 },
      { actor: ActorType.USER, actorMetadata: { authMethod: "email" }, count: 2 }
    ])
  };

  const service = insightsServiceFactory({
    permissionService: {
      getProjectPermission: async () => ({
        permission: createMongoAbility([
          { action: ProjectPermissionInsightsActions.Read, subject: ProjectPermissionSub.Insights }
        ])
      })
    },
    licenseService: {
      getPlan: async () => ({ secretAccessInsights: true }) as unknown as TFeatureSet
    },
    keyStore: {
      getItem: async () => null,
      setItemWithExpiry: async () => "OK",
      ttl: async () => -2
    },
    userDAL: { find: async () => [] },
    auditLogDAL: postgres,
    clickhouseAuditLogDAL: clickhouse
  } as unknown as TInsightsServiceFactoryDep);

  return { service, postgres, clickhouse };
};

describe("project insights audit log source", () => {
  beforeEach(() => {
    config.CLICKHOUSE_AUDIT_LOG_ENABLED = false;
  });

  test("reads access volume and auth methods from Postgres when ClickHouse is disabled", async () => {
    const { service, postgres, clickhouse } = buildService();

    await service.getAccessVolume({ projectId: PROJECT_ID }, actorDto);
    await service.getAuthMethodDistribution({ projectId: PROJECT_ID, days: 30 }, actorDto);

    expect(postgres.countByDateAndActor).toHaveBeenCalledOnce();
    expect(postgres.countByAuthMethod).toHaveBeenCalledOnce();
    expect(clickhouse.countByDateAndActorForProject).not.toHaveBeenCalled();
    expect(clickhouse.countByAuthMethodForProject).not.toHaveBeenCalled();
  });

  test("reads access volume and auth methods from ClickHouse when it is enabled", async () => {
    config.CLICKHOUSE_AUDIT_LOG_ENABLED = true;
    const { service, postgres, clickhouse } = buildService();

    const volume = await service.getAccessVolume({ projectId: PROJECT_ID }, actorDto);
    const { methods } = await service.getAuthMethodDistribution({ projectId: PROJECT_ID, days: 30 }, actorDto);

    expect(postgres.countByDateAndActor).not.toHaveBeenCalled();
    expect(postgres.countByAuthMethod).not.toHaveBeenCalled();
    expect(clickhouse.countByDateAndActorForProject).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: ORG_ID, projectId: PROJECT_ID })
    );

    const today = volume.days.find((day) => day.date === TODAY);
    expect(today?.total).toBe(4);
    expect(today?.actors).toEqual([{ name: "ci-bot", type: ActorType.IDENTITY, count: 4 }]);
    expect(methods).toEqual([
      { method: "Universal Auth", count: 3 },
      { method: "Email", count: 2 }
    ]);
  });
});
