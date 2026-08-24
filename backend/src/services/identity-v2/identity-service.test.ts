import { createMongoAbility } from "@casl/ability";
import { Knex } from "knex";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { AccessScope } from "@app/db/schemas";

import { identityV2ServiceFactory } from "./identity-service";
import { TDeleteIdentityV2DTO } from "./identity-types";

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => ({})
}));

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

// `vi.mock` factories are hoisted above imports — the spy they reference must come from `vi.hoisted`.
// Stubbing the config read rather than the guard itself keeps the real instance-admin check under test.
const { getServerCfgMock } = vi.hoisted(() => ({ getServerCfgMock: vi.fn() }));

vi.mock("@app/services/super-admin/super-admin-service", () => ({
  getServerCfg: getServerCfgMock
}));

const ORG_ID = "org-1";
const PROJECT_ID = "project-1";
const IDENTITY_ID = "identity-1";
const RESOURCE_TYPE = "identity.authentication";

// A sentinel so a test can prove a call joined the service's transaction rather than
// checking out its own connection.
const TX = { sentinel: "tx" } as unknown as Knex;

const buildDto = (): TDeleteIdentityV2DTO =>
  ({
    permission: { type: "user", id: "actor-1", authMethod: null, orgId: ORG_ID },
    scopeData: { scope: AccessScope.Organization, orgId: ORG_ID },
    selector: { identityId: IDENTITY_ID }
  }) as unknown as TDeleteIdentityV2DTO;

const createService = ({
  existingIdentity = { id: IDENTITY_ID, name: "ident", hasDeleteProtection: false }
}: { existingIdentity?: Record<string, unknown> | null } = {}) => {
  const deleteAlertsForDeletedResource = vi.fn().mockResolvedValue(0);

  const identityDAL = {
    findOne: vi.fn().mockResolvedValue(existingIdentity),
    transaction: vi.fn(async (cb: (tx: Knex) => Promise<unknown>) => cb(TX)),
    deleteById: vi.fn().mockResolvedValue({ id: IDENTITY_ID, name: "ident" }),
    updateById: vi.fn().mockResolvedValue({ id: IDENTITY_ID, name: "renamed" })
  };

  const service = identityV2ServiceFactory({
    identityDAL: identityDAL as never,
    identityMembershipV2DAL: {} as never,
    permissionService: {
      getOrgPermission: vi
        .fn()
        .mockResolvedValue({ permission: createMongoAbility([{ action: "manage", subject: "all" }]) }),
      getProjectPermission: vi
        .fn()
        .mockResolvedValue({ permission: createMongoAbility([{ action: "manage", subject: "all" }]) })
    } as never,
    licenseService: { getPlan: vi.fn(), updateSubscriptionOrgMemberCount: vi.fn() } as never,
    membershipIdentityDAL: {} as never,
    membershipRoleDAL: {} as never,
    identityMetadataDAL: { delete: vi.fn(), insertMany: vi.fn() } as never,
    identityAccessTokenService: {
      insertIdentityWideRevocationMarker: vi.fn().mockResolvedValue(undefined),
      bumpIdentityRevocationVersion: vi.fn().mockResolvedValue(undefined)
    } as never,
    keyStore: { hashGetAll: vi.fn().mockResolvedValue({}) } as never,
    projectDAL: {
      findActorAccessibleProjectIds: vi.fn(),
      findOrgProjectIds: vi.fn(),
      findById: vi.fn()
    } as never,
    orgDAL: { findById: vi.fn() } as never,
    roleDAL: { find: vi.fn() } as never,
    usageMeteringService: { emit: vi.fn(), emitForProject: vi.fn() } as never,
    alertService: { deleteAlertsForDeletedResource } as never
  });

  return { service, identityDAL, deleteAlertsForDeletedResource };
};

describe("deleteIdentity alert cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerCfgMock.mockResolvedValue({ adminIdentityIds: [] });
  });

  test("reaps the identity's alerts in every org, in the same transaction as the row delete", async () => {
    const { service, identityDAL, deleteAlertsForDeletedResource } = createService();

    await service.deleteIdentity(buildDto());

    // alerts.resourceId has no FK, and the identity can have been watched from a child org it was
    // invited into, so the reap must not be filtered by the actor's org.
    expect(deleteAlertsForDeletedResource).toHaveBeenCalledTimes(1);
    expect(deleteAlertsForDeletedResource).toHaveBeenCalledWith(
      { resourceType: RESOURCE_TYPE, resourceId: IDENTITY_ID },
      TX
    );
    // Same tx as the row delete: the alerts come back if the delete rolls back.
    expect(identityDAL.deleteById).toHaveBeenCalledWith(IDENTITY_ID, TX);
  });

  test("reaps the alerts of a project scoped identity too", async () => {
    const { service, deleteAlertsForDeletedResource } = createService();

    await service.deleteIdentity({
      ...buildDto(),
      scopeData: { scope: AccessScope.Project, orgId: ORG_ID, projectId: PROJECT_ID }
    });

    expect(deleteAlertsForDeletedResource).toHaveBeenCalledWith(
      { resourceType: RESOURCE_TYPE, resourceId: IDENTITY_ID },
      TX
    );
  });

  test("delete protection stops the delete before anything is reaped", async () => {
    const { service, deleteAlertsForDeletedResource } = createService({
      existingIdentity: { id: IDENTITY_ID, name: "ident", hasDeleteProtection: true }
    });

    await expect(service.deleteIdentity(buildDto())).rejects.toThrow(
      "Cannot delete identity while delete protection is enabled"
    );

    expect(deleteAlertsForDeletedResource).not.toHaveBeenCalled();
  });

  test("an identity outside the actor's org is not found, and nothing is reaped", async () => {
    const { service, deleteAlertsForDeletedResource } = createService({ existingIdentity: null });

    await expect(service.deleteIdentity(buildDto())).rejects.toThrow(`Identity with id ${IDENTITY_ID} not found`);

    expect(deleteAlertsForDeletedResource).not.toHaveBeenCalled();
  });
});

describe("instance admin identities are protected on the v2 surface", () => {
  const INSTANCE_ADMIN_ERROR =
    "You are attempting to modify an instance admin identity. This requires elevated instance admin privileges";

  beforeEach(() => {
    vi.clearAllMocks();
    getServerCfgMock.mockResolvedValue({ adminIdentityIds: [IDENTITY_ID] });
  });

  test("delete is refused for a non instance admin actor, and nothing is reaped", async () => {
    const { service, identityDAL, deleteAlertsForDeletedResource } = createService();

    await expect(service.deleteIdentity(buildDto())).rejects.toThrow(INSTANCE_ADMIN_ERROR);

    expect(identityDAL.deleteById).not.toHaveBeenCalled();
    expect(deleteAlertsForDeletedResource).not.toHaveBeenCalled();
  });

  test("update is refused for a non instance admin actor", async () => {
    const { service, identityDAL } = createService();

    await expect(service.updateIdentity({ ...buildDto(), data: { name: "renamed" } } as never)).rejects.toThrow(
      INSTANCE_ADMIN_ERROR
    );

    expect(identityDAL.updateById).not.toHaveBeenCalled();
  });

  test("an instance admin actor is allowed through", async () => {
    const { service, identityDAL } = createService();

    await service.deleteIdentity({ ...buildDto(), isActorSuperAdmin: true });

    expect(identityDAL.deleteById).toHaveBeenCalledWith(IDENTITY_ID, TX);
  });

  test("the guard is inert when no instance admin identities are configured", async () => {
    getServerCfgMock.mockResolvedValue({ adminIdentityIds: [] });
    const { service, identityDAL } = createService();

    await service.deleteIdentity(buildDto());

    expect(identityDAL.deleteById).toHaveBeenCalledWith(IDENTITY_ID, TX);
  });

  test("an out-of-scope instance admin identity is not found, not refused as privileged", async () => {
    const { service, identityDAL, deleteAlertsForDeletedResource } = createService({ existingIdentity: null });

    await expect(service.deleteIdentity(buildDto())).rejects.toThrow(`Identity with id ${IDENTITY_ID} not found`);

    expect(identityDAL.deleteById).not.toHaveBeenCalled();
    expect(deleteAlertsForDeletedResource).not.toHaveBeenCalled();
  });

  test("an out-of-scope instance admin identity is not found on update either", async () => {
    const { service, identityDAL } = createService({ existingIdentity: null });

    await expect(service.updateIdentity({ ...buildDto(), data: { name: "renamed" } } as never)).rejects.toThrow(
      `Identity with id ${IDENTITY_ID} not found`
    );

    expect(identityDAL.updateById).not.toHaveBeenCalled();
  });
});
