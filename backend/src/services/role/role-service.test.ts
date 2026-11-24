import { createMongoAbility } from "@casl/ability";
import { packRules } from "@casl/ability/extra";
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
  remainingRows = [],
  roleExists = false
}: {
  projectType: ProjectType;
  holderRows?: Record<string, unknown>[];
  // The rows the holders' memberships still have once the role's rows are gone.
  remainingRows?: Record<string, unknown>[];
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
    find: vi.fn().mockResolvedValueOnce(holderRows).mockResolvedValue(remainingRows),
    delete: vi.fn().mockResolvedValue([]),
    insertMany: vi.fn().mockResolvedValue([])
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
  const MEMBERSHIP_ID = "membership-1";
  const ended = {
    membershipId: MEMBERSHIP_ID,
    customRoleId: ROLE_ID,
    role: ProjectMembershipRole.Custom,
    isTemporary: true,
    temporaryAccessEndTime: new Date(Date.now() - 60_000)
  };

  test("a time limit that has ended doesn't keep the role, and its row goes with it", async () => {
    const { service, roleDAL, membershipRoleDAL, raw, tx } = build({
      projectType: ProjectType.AgentVault,
      holderRows: [ended],
      remainingRows: [{ membershipId: MEMBERSHIP_ID, role: ProjectMembershipRole.Custom, customRoleId: "role-other" }],
      roleExists: true
    });

    await service.deleteRole(deleteDto);

    expect(raw).toHaveBeenCalledWith("SELECT pg_advisory_xact_lock(?)", [
      PgSqlLock.LastAdminGuard("project", PROJECT_ID)
    ]);
    expect(membershipRoleDAL.delete).toHaveBeenCalledWith({ customRoleId: ROLE_ID }, tx);
    expect(membershipRoleDAL.insertMany).not.toHaveBeenCalled();
    expect(roleDAL.delete).toHaveBeenCalledWith({ id: ROLE_ID, projectId: PROJECT_ID }, tx);
    expect(membershipRoleDAL.delete.mock.invocationCallOrder[0]).toBeLessThan(
      roleDAL.delete.mock.invocationCallOrder[0]
    );
  });

  test("a member whose only row was an ended assignment of the role gets No Access, so their membership keeps a role", async () => {
    const { service, membershipRoleDAL, tx } = build({
      projectType: ProjectType.AgentVault,
      holderRows: [ended],
      remainingRows: [],
      roleExists: true
    });

    await service.deleteRole(deleteDto);

    expect(membershipRoleDAL.find).toHaveBeenLastCalledWith({ $in: { membershipId: [MEMBERSHIP_ID] } }, { tx });
    expect(membershipRoleDAL.insertMany).toHaveBeenCalledWith(
      [{ membershipId: MEMBERSHIP_ID, role: ProjectMembershipRole.NoAccess }],
      tx
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

describe("Agent Vault role names", () => {
  const createWithName = (name: string) =>
    ({ ...createDto, data: { ...createDto.data, name } }) as unknown as TCreateRoleDTO;

  test.each([
    ["Admin", "built-in role"],
    [" no access ", "built-in role"],
    ["No-Access", "built-in role"],
    ["Ad​min", "invisible characters"],
    ["Release‮Engineers", "invisible characters"],
    ["Release\nEngineers", "invisible characters"],
    ["", "Enter a name"],
    ["No\u00a0Access", "built-in role"],
    ["No  Access", "built-in role"],
    ["Admin\u2800", "invisible characters"],
    ["\u3164", "invisible characters"],
    ["\u00a0\u2003", "Enter a name"]
  ])("refuses %j", async (name, message) => {
    const { service, roleDAL } = build({ projectType: ProjectType.AgentVault });
    await expect(service.createRole(createWithName(name))).rejects.toThrow(message);
    expect(roleDAL.create).not.toHaveBeenCalled();
  });

  test("saves a name trimmed", async () => {
    const { service, roleDAL } = build({ projectType: ProjectType.AgentVault });
    await service.createRole(createWithName("  Release Engineers  "));
    expect(roleDAL.create).toHaveBeenCalledWith(expect.objectContaining({ name: "Release Engineers" }));
  });

  test("collapses any run of spaces into one plain space", async () => {
    const { service, roleDAL } = build({ projectType: ProjectType.AgentVault });
    await service.createRole(createWithName("Release\u00a0\u00a0Engineers"));
    expect(roleDAL.create).toHaveBeenCalledWith(expect.objectContaining({ name: "Release Engineers" }));
  });
});

describe("Agent Vault role size", () => {
  test("refuses more rules than an Agent Vault role can hold, as the routes send them", async () => {
    const { service, roleDAL } = build({ projectType: ProjectType.AgentVault });
    const tooMany = JSON.stringify(Array.from({ length: 501 }, () => ["read", "agent-vault-proxies"]));
    await expect(
      service.createRole({
        ...createDto,
        data: { ...createDto.data, permissions: tooMany }
      } as unknown as TCreateRoleDTO)
    ).rejects.toThrow("at most 500 rules");
    expect(roleDAL.create).not.toHaveBeenCalled();
  });

  test("takes a role at the limit", async () => {
    const { service, roleDAL } = build({ projectType: ProjectType.AgentVault });
    const atLimit = JSON.stringify(Array.from({ length: 500 }, () => ["read", "agent-vault-proxies"]));
    await service.createRole({
      ...createDto,
      data: { ...createDto.data, permissions: atLimit }
    } as unknown as TCreateRoleDTO);
    expect(roleDAL.create).toHaveBeenCalled();
  });

  const idOf = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const rulesNaming = (count: number) =>
    JSON.stringify(
      packRules(
        Array.from({ length: Math.ceil(count / 1000) }, (_, index) => ({
          action: "use",
          subject: "agent-vault-services",
          conditions: {
            serviceId: {
              $in: Array.from({ length: Math.min(1000, count - index * 1000) }, (__, n) => idOf(index * 1000 + n))
            }
          }
        }))
      )
    );

  test("refuses more ids across a role's rules than the role editor can show", async () => {
    const { service, roleDAL } = build({ projectType: ProjectType.AgentVault });
    await expect(
      service.createRole({
        ...createDto,
        data: { ...createDto.data, permissions: rulesNaming(2001) }
      } as unknown as TCreateRoleDTO)
    ).rejects.toThrow("at most 2000 IDs across its rules");
    expect(roleDAL.create).not.toHaveBeenCalled();
  });

  test("takes a role naming exactly as many ids as the limit", async () => {
    const { service, roleDAL } = build({ projectType: ProjectType.AgentVault });
    await service.createRole({
      ...createDto,
      data: { ...createDto.data, permissions: rulesNaming(2000) }
    } as unknown as TCreateRoleDTO);
    expect(roleDAL.create).toHaveBeenCalled();
  });
});
