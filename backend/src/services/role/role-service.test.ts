import { createMongoAbility } from "@casl/ability";
import { Knex } from "knex";
import { describe, expect, test, vi } from "vitest";

import { AccessScope, ProjectMembershipRole, ProjectType } from "@app/db/schemas";
import { FakeLicenseService } from "@app/domains/platform/license/ce/testing/fake-license-service";
import { PgSqlLock } from "@app/keystore/keystore";

import { roleServiceFactory } from "./role-service";
import { TCreateRoleDTO, TDeleteRoleDTO } from "./role-types";

const ORG_ID = "org-1";
const PROJECT_ID = "project-1";
const ROLE_ID = "role-1";

const actor = { type: "user", id: "actor-1", authMethod: null, orgId: ORG_ID };
const scopeData = { scope: AccessScope.Project, orgId: ORG_ID, projectId: PROJECT_ID } as const;

// The test plan has no RBAC, the free tier's case. A role to delete exists; one to create doesn't yet.
const build = ({
  projectType,
  holderRows = [],
  roleExists = false
}: {
  projectType: ProjectType;
  holderRows?: Record<string, unknown>[];
  roleExists?: boolean;
}) => {
  const raw = vi.fn().mockResolvedValue(undefined);
  const tx = { raw } as unknown as Knex;
  const role = { id: ROLE_ID, slug: "release-engineers", name: "Release Engineers", permissions: [] };
  const roleDAL = {
    findOne: vi.fn().mockResolvedValue(roleExists ? role : null),
    create: vi.fn().mockResolvedValue(role),
    delete: vi.fn().mockResolvedValue([role]),
    transaction: vi.fn(async (cb: (trx: Knex) => Promise<unknown>) => cb(tx))
  };
  const membershipRoleDAL = {
    find: vi.fn().mockResolvedValue(holderRows),
    delete: vi.fn().mockResolvedValue([])
  };
  const service = roleServiceFactory({
    roleDAL: roleDAL as never,
    permissionService: {
      getProjectPermission: vi
        .fn()
        .mockResolvedValue({ permission: createMongoAbility([{ action: "manage", subject: "all" }]) })
    } as never,
    projectDAL: { findById: vi.fn().mockResolvedValue({ id: PROJECT_ID, type: projectType }) } as never,
    identityDAL: {} as never,
    userDAL: {} as never,
    externalGroupOrgRoleMappingDAL: {} as never,
    membershipRoleDAL: membershipRoleDAL as never,
    licenseService: new FakeLicenseService()
  });
  return { service, roleDAL, membershipRoleDAL, raw, tx };
};

const createDto = {
  permission: actor,
  scopeData,
  data: { name: "Release Engineers", slug: "release-engineers", permissions: [] }
} as unknown as TCreateRoleDTO;

const deleteDto = { permission: actor, scopeData, selector: { id: ROLE_ID } } as unknown as TDeleteRoleDTO;

describe("custom roles without the RBAC plan", () => {
  test("an Agent Vault project creates them, since its access comes from custom roles", async () => {
    const { service, roleDAL } = build({ projectType: ProjectType.AgentVault });
    await service.createRole(createDto);
    expect(roleDAL.create).toHaveBeenCalled();
  });

  test("any other project refuses them", async () => {
    const { service, roleDAL } = build({ projectType: ProjectType.SecretManager });
    await expect(service.createRole(createDto)).rejects.toThrow("plan RBAC restriction");
    expect(roleDAL.create).not.toHaveBeenCalled();
  });
});

describe("deleting an Agent Vault role", () => {
  const ended = {
    customRoleId: ROLE_ID,
    role: ProjectMembershipRole.Custom,
    isTemporary: true,
    temporaryAccessEndTime: new Date(Date.now() - 60_000)
  };

  test("a time limit that has ended doesn't keep the role, and its row goes with it", async () => {
    const { service, roleDAL, membershipRoleDAL, raw, tx } = build({
      projectType: ProjectType.AgentVault,
      holderRows: [ended],
      roleExists: true
    });

    await service.deleteRole(deleteDto);

    expect(raw).toHaveBeenCalledWith("SELECT pg_advisory_xact_lock(?)", [
      PgSqlLock.LastAdminGuard("project", PROJECT_ID)
    ]);
    expect(membershipRoleDAL.delete).toHaveBeenCalledWith({ customRoleId: ROLE_ID }, tx);
    expect(roleDAL.delete).toHaveBeenCalledWith({ id: ROLE_ID, projectId: PROJECT_ID }, tx);
    expect(membershipRoleDAL.delete.mock.invocationCallOrder[0]).toBeLessThan(
      roleDAL.delete.mock.invocationCallOrder[0]
    );
  });

  test("a member who still holds the role keeps it from being deleted", async () => {
    const { service, roleDAL, membershipRoleDAL } = build({
      projectType: ProjectType.AgentVault,
      holderRows: [ended, { customRoleId: ROLE_ID, role: ProjectMembershipRole.Custom, isTemporary: false }],
      roleExists: true
    });

    await expect(service.deleteRole(deleteDto)).rejects.toThrow(
      "1 member holds this role. Remove it from them under Access Control first."
    );
    expect(membershipRoleDAL.delete).not.toHaveBeenCalled();
    expect(roleDAL.delete).not.toHaveBeenCalled();
  });
});
