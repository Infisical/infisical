import knex, { Knex } from "knex";
import { vi } from "vitest";

import { ProjectType } from "@app/db/schemas";
import { PgSqlLock } from "@app/keystore/keystore";

import { assertProductWillRetainAdmin, resolveMembershipRoleSlugs } from "./membership-fns";

describe("product admin retention", () => {
  const buildTx = (adminCount: number) => {
    const db = knex({ client: "pg" });
    const query = db.queryBuilder();
    const first = vi.spyOn(query, "first").mockResolvedValue({ count: String(adminCount) });
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
