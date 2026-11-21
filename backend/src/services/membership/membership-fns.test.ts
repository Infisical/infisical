import knex, { Knex } from "knex";
import { vi } from "vitest";

import { AccessScope, ProjectMembershipRole, ProjectType } from "@app/db/schemas";
import { PgSqlLock } from "@app/keystore/keystore";
import { ConflictError, ForbiddenRequestError } from "@app/lib/errors";

import {
  assertAgentVaultAdminOnlyChange,
  assertAgentVaultRoleLimits,
  assertProductWillRetainAdmin,
  checkedRoleSlugsOf,
  customRolesNeedRbacPlan,
  lockAgentVaultRoleChange,
  replaceMembershipRoles,
  resolveMembershipRoleSlugs
} from "./membership-fns";

describe("product admin retention", () => {
  const buildTx = (adminCount: number, removingAdmins = 1) => {
    const db = knex({ client: "pg" });
    const query = db.queryBuilder();
    const first = vi
      .spyOn(query, "first")
      .mockResolvedValueOnce({ count: String(adminCount) })
      .mockResolvedValue({ count: String(removingAdmins) });
    const tx = Object.assign(
      vi.fn(() => query),
      { raw: vi.fn().mockResolvedValue(undefined) }
    );
    return { tx: tx as unknown as Knex, raw: tx.raw, query, first };
  };

  test.each([ProjectType.CertificateManager, ProjectType.PAM, ProjectType.AgentVault])(
    "blocks removing the last admin in %s",
    async (type) => {
      const { tx, raw, first } = buildTx(0);
      await expect(
        assertProductWillRetainAdmin({ project: { id: "project-1", type }, excludeMembershipIds: ["admin-1"], tx })
      ).rejects.toThrow("must keep at least one admin");
      expect(raw).toHaveBeenCalledWith("SELECT pg_advisory_xact_lock(?)", [
        PgSqlLock.LastAdminGuard("project", "project-1")
      ]);
      expect(raw.mock.invocationCallOrder[0]).toBeLessThan(first.mock.invocationCallOrder[0]);
    }
  );

  test("allows another active built-in admin of any actor kind using the transaction", async () => {
    const { tx, query } = buildTx(1);
    await assertProductWillRetainAdmin({
      project: { id: "project-1", type: ProjectType.CertificateManager },
      excludeMembershipIds: ["admin-1"],
      tx
    });
    const { sql, bindings } = query.toSQL();
    expect(sql).toContain('"isActive" = ?');
    expect(sql).toContain('"isTemporary" = ? or "membership_roles"."temporaryAccessEndTime" > ?');
    expect(sql).toContain('"id" not in (?)');
    expect(bindings).toContain("admin");
    expect(bindings).toContain("admin-1");
    expect(sql).not.toMatch(/actorUserId|actorGroupId|actorIdentityId|customRoleId/);
  });

  test("allows changing a non-admin in an already adminless project", async () => {
    const { tx } = buildTx(0, 0);
    await assertProductWillRetainAdmin({
      project: { id: "project-1", type: ProjectType.CertificateManager },
      excludeMembershipIds: ["member-1"],
      tx
    });
  });

  test.each([ProjectType.SecretManager, ProjectType.KMS, ProjectType.SecretScanning, null])(
    "does not change retention policy for %s",
    async (type) => {
      const { tx, raw } = buildTx(0);
      await assertProductWillRetainAdmin({ project: { id: "project-1", type }, excludeMembershipIds: [], tx });
      expect(raw).not.toHaveBeenCalled();
    }
  );
});

describe("resolveMembershipRoleSlugs", () => {
  test("prefers the custom role slug over the built-in role column", () => {
    expect(resolveMembershipRoleSlugs([{ role: "custom", customRoleSlug: "release-manager" }])).toEqual([
      "release-manager"
    ]);
  });

  test("falls back to the role column when there is no custom slug", () => {
    expect(resolveMembershipRoleSlugs([{ role: "admin" }, { role: "member", customRoleSlug: null }])).toEqual([
      "admin",
      "member"
    ]);
  });

  test("drops no-access, which confers nothing", () => {
    expect(resolveMembershipRoleSlugs([{ role: "no-access" }, { role: "admin" }])).toEqual(["admin"]);
  });

  test("drops expired temporary roles so a boundary check cannot over-block", () => {
    const expired = { role: "admin", isTemporary: true, temporaryAccessEndTime: new Date(Date.now() - 60_000) };
    const live = { role: "member", isTemporary: true, temporaryAccessEndTime: new Date(Date.now() + 60_000) };

    expect(resolveMembershipRoleSlugs([expired, live])).toEqual(["member"]);
  });

  test("keeps permanent roles regardless of temporaryAccessEndTime", () => {
    expect(
      resolveMembershipRoleSlugs([{ role: "admin", isTemporary: false, temporaryAccessEndTime: new Date(0) }])
    ).toEqual(["admin"]);
  });

  test("deduplicates a slug repeated within one membership", () => {
    // The uniqueness key on membership roles spans isTemporary, so one membership can hold the same
    // custom role permanently and temporarily. Passing the slug twice makes getOrgPermissionByRoles
    // report it as missing, because it compares the requested count against the rows it finds.
    expect(
      resolveMembershipRoleSlugs([
        { role: "custom", customRoleSlug: "release-manager" },
        {
          role: "custom",
          customRoleSlug: "release-manager",
          isTemporary: true,
          temporaryAccessEndTime: new Date(Date.now() + 60_000)
        }
      ])
    ).toEqual(["release-manager"]);
  });

  test("deduplicates slugs shared across memberships in a bulk removal", () => {
    expect(
      resolveMembershipRoleSlugs([
        { role: "member" },
        { role: "member" },
        { role: "custom", customRoleSlug: "auditor" },
        { role: "custom", customRoleSlug: "auditor" }
      ])
    ).toEqual(["member", "auditor"]);
  });

  test("returns an empty list when every role filters out", () => {
    expect(
      resolveMembershipRoleSlugs([
        { role: "no-access" },
        { role: "admin", isTemporary: true, temporaryAccessEndTime: new Date(Date.now() - 1) }
      ])
    ).toEqual([]);
  });
});

describe("assertAgentVaultAdminOnlyChange", () => {
  const agentVault = { type: ProjectType.AgentVault };
  const notAdmin = () => false;

  test("refuses a non-admin who gives the admin role or touches an admin in Agent Vault", () => {
    expect(() =>
      assertAgentVaultAdminOnlyChange({ project: agentVault, hasRole: notAdmin, givesAdmin: true, touchesAdmin: false })
    ).toThrow("Only an Agent Vault admin can give the admin role.");
    expect(() =>
      assertAgentVaultAdminOnlyChange({ project: agentVault, hasRole: notAdmin, givesAdmin: false, touchesAdmin: true })
    ).toThrow("Only an Agent Vault admin can change or remove another admin.");
  });

  test("lets an admin through, and any change that leaves admin alone", () => {
    expect(() =>
      assertAgentVaultAdminOnlyChange({
        project: agentVault,
        hasRole: (role) => role === "admin",
        givesAdmin: true,
        touchesAdmin: true
      })
    ).not.toThrow();
    expect(() =>
      assertAgentVaultAdminOnlyChange({
        project: agentVault,
        hasRole: notAdmin,
        givesAdmin: false,
        touchesAdmin: false
      })
    ).not.toThrow();
  });

  test("leaves other products to their own rules, without asking for the actor's roles", () => {
    const hasRole = vi.fn(() => false);
    expect(() =>
      assertAgentVaultAdminOnlyChange({
        project: { type: ProjectType.SecretManager },
        hasRole,
        givesAdmin: true,
        touchesAdmin: true
      })
    ).not.toThrow();
    expect(hasRole).not.toHaveBeenCalled();
  });
});

describe("replaceMembershipRoles keeping access bundle roles", () => {
  const MEMBERSHIP_ID = "membership-1";
  const memberRoleDoc = {
    membershipId: MEMBERSHIP_ID,
    role: ProjectMembershipRole.Custom,
    customRoleId: "role-member"
  };

  // The bundles' roles are read off the transaction itself, the membership's rows through the DAL.
  const build = (rows: Record<string, unknown>[], bundleRoleIds: string[]) => {
    const tx = vi.fn(() => ({
      where: () => ({
        whereNotNull: () => ({ select: async () => bundleRoleIds.map((grantRoleId) => ({ grantRoleId })) })
      })
    })) as unknown as Knex;
    const membershipRoleDAL = {
      find: vi.fn().mockResolvedValue(rows),
      delete: vi.fn().mockResolvedValue([]),
      insertMany: vi.fn(async (docs: Record<string, unknown>[]) => docs.map((doc) => ({ ...doc, id: "row-new" })))
    };
    const replace = () =>
      replaceMembershipRoles(
        { membershipRoleDAL } as unknown as Parameters<typeof replaceMembershipRoles>[0],
        { membershipId: MEMBERSHIP_ID, roleDocs: [memberRoleDoc], keepBundleRolesInProjectId: "project-1" },
        tx
      );
    return { membershipRoleDAL, replace };
  };
  const bundleRow = (customRoleId: string, extra: Record<string, unknown> = {}) => ({
    id: `row-${customRoleId}`,
    membershipId: MEMBERSHIP_ID,
    role: ProjectMembershipRole.Custom,
    customRoleId,
    isTemporary: false,
    ...extra
  });

  test("counts the kept roles toward the most a member can hold", async () => {
    const bundleRoleIds = Array.from({ length: 10 }, (_, index) => `role-bundle-${index}`);
    const { membershipRoleDAL, replace } = build(
      bundleRoleIds.map((id) => bundleRow(id)),
      bundleRoleIds
    );

    await expect(replace()).rejects.toThrow("A member can have at most 10 roles.");
    expect(membershipRoleDAL.delete).not.toHaveBeenCalled();
    expect(membershipRoleDAL.insertMany).not.toHaveBeenCalled();
  });

  test("keeps a live bundle role and replaces one whose time limit has ended", async () => {
    const { membershipRoleDAL, replace } = build(
      [
        bundleRow("role-bundle-live"),
        bundleRow("role-bundle-ended", { isTemporary: true, temporaryAccessEndTime: new Date(Date.now() - 60_000) }),
        { id: "row-viewer", membershipId: MEMBERSHIP_ID, role: ProjectMembershipRole.Viewer, isTemporary: false }
      ],
      ["role-bundle-live", "role-bundle-ended"]
    );

    const result = await replace();

    expect(membershipRoleDAL.delete).toHaveBeenCalledWith(
      { $in: { id: ["row-role-bundle-ended", "row-viewer"] } },
      expect.anything()
    );
    expect(membershipRoleDAL.insertMany).toHaveBeenCalledWith([memberRoleDoc], expect.anything());
    expect(result.map((row) => row.customRoleId)).toEqual(["role-bundle-live", "role-member"]);
  });
});

describe("assertAgentVaultRoleLimits", () => {
  const agentVault = { type: ProjectType.AgentVault };

  // Agent Vault resolves none of these, so each would be stored as a role that grants nothing. `custom` has no role
  // behind it at all.
  test.each([
    ProjectMembershipRole.Custom,
    ProjectMembershipRole.Viewer,
    ProjectMembershipRole.Member,
    ProjectMembershipRole.KmsCryptographicOperator
  ])("refuses the built-in role %s", (role) => {
    expect(() => assertAgentVaultRoleLimits({ project: agentVault, roles: [{ role }] })).toThrow(
      `This project has no role '${role}'. Use admin, no-access, or the slug of one of the project's roles.`
    );
  });

  test("takes admin, no-access and the slugs of the project's roles", () => {
    expect(() =>
      assertAgentVaultRoleLimits({ project: agentVault, roles: [{ role: ProjectMembershipRole.Admin }] })
    ).not.toThrow();
    expect(() =>
      assertAgentVaultRoleLimits({ project: agentVault, roles: [{ role: ProjectMembershipRole.NoAccess }] })
    ).not.toThrow();
    expect(() =>
      assertAgentVaultRoleLimits({ project: agentVault, roles: [{ role: "release-engineers" }, { role: "auditors" }] })
    ).not.toThrow();
  });

  test("leaves other project types alone", () => {
    expect(() =>
      assertAgentVaultRoleLimits({
        project: { type: ProjectType.KMS },
        roles: [{ role: ProjectMembershipRole.KmsCryptographicOperator }]
      })
    ).not.toThrow();
  });
});

describe("checkedRoleSlugsOf", () => {
  test("reads live rows only, custom roles by slug, sorted and without repeats", () => {
    expect(
      checkedRoleSlugsOf([
        { role: ProjectMembershipRole.Custom, customRoleSlug: "release-engineers" },
        { role: ProjectMembershipRole.NoAccess },
        { role: ProjectMembershipRole.Custom, customRoleSlug: "auditors" },
        { role: ProjectMembershipRole.Custom, customRoleSlug: "auditors" },
        {
          role: ProjectMembershipRole.Admin,
          isTemporary: true,
          temporaryAccessEndTime: new Date(Date.now() - 60_000)
        }
      ])
    ).toEqual(["auditors", ProjectMembershipRole.NoAccess, "release-engineers"]);
  });
});

describe("lockAgentVaultRoleChange", () => {
  const PROJECT_ID = "project-1";
  const MEMBERSHIP_ID = "membership-1";
  const TOUCH_ADMIN = "Only an Agent Vault admin can change or remove another admin.";

  // The admin check reads the target's live Admin row with first(), the role comparison every row with select().
  const buildTx = ({ adminRow, rows }: { adminRow?: { id: string }; rows: Record<string, unknown>[] }) => {
    const chain = () => {
      const query = {
        whereIn: () => query,
        where: () => query,
        leftJoin: () => query,
        first: vi.fn(async () => adminRow),
        select: vi.fn(async () => rows)
      };
      return query;
    };
    const tx = Object.assign(
      vi.fn(() => chain()),
      { raw: vi.fn().mockResolvedValue(undefined) }
    );
    return { tx: tx as unknown as Knex, raw: tx.raw, query: tx };
  };
  const lockCall = ["SELECT pg_advisory_xact_lock(?)", [PgSqlLock.LastAdminGuard("project", PROJECT_ID)]];
  const customRow = (customRoleSlug: string) => ({ role: ProjectMembershipRole.Custom, customRoleSlug });

  test("does nothing outside an Agent Vault project", async () => {
    const { tx, raw, query } = buildTx({ rows: [] });
    await lockAgentVaultRoleChange(null, { membershipId: MEMBERSHIP_ID, checked: { checkedRoleSlugs: [] } }, tx);
    expect(raw).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  test("an admin's change takes the project's lock and checks nothing else", async () => {
    const { tx, raw, query } = buildTx({ rows: [customRow("auditors")] });
    await lockAgentVaultRoleChange(
      { projectId: PROJECT_ID, actorIsAdmin: true },
      { membershipId: MEMBERSHIP_ID, checked: { checkedRoleSlugs: [] } },
      tx
    );
    expect(raw).toHaveBeenCalledWith(...lockCall);
    expect(query).not.toHaveBeenCalled();
  });

  test("a non-admin's change goes ahead when the target's roles are the ones its guard checked", async () => {
    const { tx, raw } = buildTx({
      rows: [
        customRow("release-engineers"),
        customRow("auditors"),
        {
          role: ProjectMembershipRole.Admin,
          isTemporary: true,
          temporaryAccessEndTime: new Date(Date.now() - 60_000)
        }
      ]
    });
    await lockAgentVaultRoleChange(
      { projectId: PROJECT_ID, actorIsAdmin: false },
      { membershipId: MEMBERSHIP_ID, checked: { checkedRoleSlugs: ["auditors", "release-engineers"] } },
      tx
    );
    expect(raw).toHaveBeenCalledWith(...lockCall);
  });

  test("a non-admin's change starts over when the target got another role meanwhile", async () => {
    const { tx } = buildTx({ rows: [customRow("release-engineers"), customRow("auditors")] });
    const change = lockAgentVaultRoleChange(
      { projectId: PROJECT_ID, actorIsAdmin: false },
      { membershipId: MEMBERSHIP_ID, checked: { checkedRoleSlugs: ["release-engineers"] } },
      tx
    );
    await expect(change).rejects.toThrow(ConflictError);
    await expect(change).rejects.toThrow("A member's roles changed while this request was running. Try again.");
  });

  test("a non-admin's change is refused when the target was made an admin meanwhile", async () => {
    const { tx } = buildTx({
      adminRow: { id: "row-admin" },
      rows: [{ role: ProjectMembershipRole.Admin }, customRow("release-engineers")]
    });
    const change = lockAgentVaultRoleChange(
      { projectId: PROJECT_ID, actorIsAdmin: false },
      { membershipId: MEMBERSHIP_ID, checked: { checkedRoleSlugs: ["release-engineers"] } },
      tx
    );
    await expect(change).rejects.toThrow(ForbiddenRequestError);
    await expect(change).rejects.toThrow(TOUCH_ADMIN);
  });
});

describe("customRolesNeedRbacPlan", () => {
  const projectDAL = (type: ProjectType) => ({ findById: vi.fn().mockResolvedValue({ id: "project-1", type }) });

  test("an Agent Vault project's custom roles work on every plan", async () => {
    await expect(
      customRolesNeedRbacPlan(projectDAL(ProjectType.AgentVault), {
        scope: AccessScope.Project,
        projectId: "project-1"
      })
    ).resolves.toBe(false);
  });

  test("custom roles anywhere else need the RBAC plan", async () => {
    await expect(
      customRolesNeedRbacPlan(projectDAL(ProjectType.SecretManager), {
        scope: AccessScope.Project,
        projectId: "project-1"
      })
    ).resolves.toBe(true);
    await expect(
      customRolesNeedRbacPlan(projectDAL(ProjectType.AgentVault), { scope: AccessScope.Organization })
    ).resolves.toBe(true);
  });
});
