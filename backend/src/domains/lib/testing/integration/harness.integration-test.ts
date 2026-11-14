import path from "node:path";

import { readdir } from "node:fs/promises";
import RE2 from "re2";
import { describe, expect, test } from "vitest";

import { OrgMembershipRole, ProjectMembershipRole, TableName } from "@app/db/schemas";

import { getRunId } from "./harness";
import { randomId, setupIntegration, startOnce } from "./index";

const MIGRATIONS_DIRECTORY = path.join(__dirname, "../../../../db/migrations");

const countMigrationFiles = async () =>
  (await readdir(MIGRATIONS_DIRECTORY, { withFileTypes: true })).filter(
    (entry) => entry.isFile() && entry.name.endsWith(".ts")
  ).length;

const membershipRole = async (h: ReturnType<typeof setupIntegration>, membershipId: string) =>
  (await h.db(TableName.MembershipRole).where({ membershipId }).first())?.role;

describe("setupIntegration", () => {
  const h = setupIntegration();

  test("should connect to this worker's own database with every migration applied", async () => {
    // Setup
    const expected = await countMigrationFiles();

    // Action
    const [{ count }] = await h.db("infisical_migrations").count<{ count: string }[]>("* as count");

    // Assert
    expect(h.databaseName).toBe(`infisical_it_${getRunId()}_w${process.env.VITEST_POOL_ID}`);
    expect(Number(count)).toBe(expected);
  });

  test("should resolve replicaNode() and primaryNode() to the same database", async () => {
    // Action
    const replica = await h.db.replicaNode().raw<{ rows: { name: string }[] }>("SELECT current_database() AS name");
    const primary = await h.db.primaryNode().raw<{ rows: { name: string }[] }>("SELECT current_database() AS name");

    // Assert
    expect(replica.rows[0].name).toBe(h.databaseName);
    expect(primary.rows[0].name).toBe(h.databaseName);
  });

  test("should give each tenant its own org whose admin also administers its project", async () => {
    // Action
    const first = await h.newTenant();
    const second = await h.newTenant();

    // Assert
    expect(first.org.id).not.toBe(second.org.id);
    expect(first.project.orgId).toBe(first.org.id);
    expect(first.environments.map((env) => env.slug)).toEqual(["dev", "staging", "prod"]);
    expect(await membershipRole(h, first.adminOrgMembership.id)).toBe(OrgMembershipRole.Admin);
  });

  test("should make the tenant admin a project admin", async () => {
    // Setup
    const tn = await h.newTenant();

    // Action
    const membership = await h
      .db(TableName.Membership)
      .where({ scopeProjectId: tn.project.id, actorUserId: tn.admin.id })
      .first();

    // Assert
    expect(membership).toBeDefined();
    expect(await membershipRole(h, membership!.id)).toBe(ProjectMembershipRole.Admin);
  });

  test("should give an empty database with no Infisical schema", async () => {
    // Action
    const target = await h.newDatabase();

    // Assert
    const tables = await target.db.raw<{ rows: unknown[] }>(
      "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public'"
    );
    expect(target.name).not.toBe(h.databaseName);
    expect(tables.rows).toHaveLength(0);
  });

  test("should drop the empty database when it closes", async () => {
    // Setup
    const target = await h.newDatabase();

    // Action
    await target.close();

    // Assert
    const exists = await h.db.raw<{ rows: unknown[] }>("SELECT 1 FROM pg_database WHERE datname = ?", [target.name]);
    expect(exists.rows).toHaveLength(0);
  });
});

describe("setupIntegration({ freshDatabase: true })", () => {
  const h = setupIntegration({ freshDatabase: true });

  test("should use a private migrated clone instead of the worker's database", async () => {
    // Setup
    const expected = await countMigrationFiles();

    // Action
    const [{ count }] = await h.db("infisical_migrations").count<{ count: string }[]>("* as count");

    // Assert
    expect(new RE2(`^infisical_it_${getRunId()}_f[a-z0-9]+$`).test(h.databaseName)).toBe(true);
    expect(Number(count)).toBe(expected);
  });
});

describe("startOnce", () => {
  test("should start once and give every caller the same address when called concurrently", async () => {
    // Setup
    const name = `test-${randomId()}`;
    let starts = 0;
    const start = async () => {
      starts += 1;
      return { port: 1000 + starts };
    };

    // Action
    const addresses = await Promise.all([startOnce(name, start), startOnce(name, start), startOnce(name, start)]);

    // Assert
    expect(starts).toBe(1);
    expect(addresses).toEqual([{ port: 1001 }, { port: 1001 }, { port: 1001 }]);
  });

  test("should start again after a start that failed", async () => {
    // Setup
    const name = `test-${randomId()}`;
    await expect(startOnce(name, () => Promise.reject(new Error("image pull failed")))).rejects.toThrow(
      "image pull failed"
    );

    // Action
    const address = await startOnce(name, async () => ({ port: 2000 }));

    // Assert
    expect(address).toEqual({ port: 2000 });
  });
});
