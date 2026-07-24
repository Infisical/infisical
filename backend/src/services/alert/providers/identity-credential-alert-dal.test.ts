import { TableName } from "@app/db/schemas";

import { identityCredentialAlertDALFactory } from "./identity-credential-alert-dal";

// Records the query builder calls so we can assert which identities a scan is allowed to return.
// This is the enforcement point for the permission boundary of a project-owned identity: an
// org-scoped alert only ever checks org-level identity permission, so it must never surface the
// credential metadata of an identity whose reads are gated by a project (see
// getUniversalAuthClientSecrets in identity-ua-service).
const buildDAL = () => {
  const calls = {
    join: [] as unknown[][],
    where: [] as unknown[][],
    whereNull: [] as unknown[],
    // Calls made inside a `.where((builder) => ...)` group.
    groupedWhereNull: [] as unknown[],
    groupedOrWhere: [] as unknown[][]
  };

  const group = {
    whereNull: (col: unknown) => {
      calls.groupedWhereNull.push(col);
      return group;
    },
    orWhere: (...args: unknown[]) => {
      calls.groupedOrWhere.push(args);
      return group;
    }
  };

  const chain = {
    join: (...args: unknown[]) => {
      calls.join.push(args);
      return chain;
    },
    where: (...args: unknown[]) => {
      if (typeof args[0] === "function") {
        (args[0] as (builder: typeof group) => void)(group);
        return chain;
      }
      calls.where.push(args);
      return chain;
    },
    whereNull: (col: unknown) => {
      calls.whereNull.push(col);
      return chain;
    },
    whereRaw: () => chain,
    orderByRaw: () => chain,
    select: async () => []
  };

  const db = {
    replicaNode: () => () => chain,
    ref: (col: string) => ({ withSchema: () => ({ as: () => col }) }),
    raw: (sql: string) => sql
  } as never;

  return { dal: identityCredentialAlertDALFactory(db), calls };
};

const scanArgs = {
  orgId: "org-1",
  alertBeforeInterval: "30 days",
  leadInterval: "1 day",
  asOf: new Date("2026-01-01T00:00:00Z")
};

describe("identity credential alert dal", () => {
  test("an org-scoped scan excludes project-owned identities", async () => {
    const { dal, calls } = buildDAL();

    await dal.findExpiringUaClientSecrets(scanArgs);

    expect(calls.whereNull).toContainEqual(`${TableName.Identity}.projectId`);
    // No project membership join: the scan spans the whole org.
    expect(calls.where.some((args) => args[0] === "projectMembership.scope")).toBe(false);
  });

  test("a project-scoped scan keeps org-level identities but only its own project's identities", async () => {
    const { dal, calls } = buildDAL();

    await dal.findExpiringUaClientSecrets({ ...scanArgs, projectId: "proj-1" });

    expect(calls.where).toContainEqual(["projectMembership.scopeProjectId", "proj-1"]);
    // Membership in the project is not sufficient on its own: an identity owned by another project
    // stays out even when it has been shared into this one.
    expect(calls.groupedWhereNull).toContainEqual(`${TableName.Identity}.projectId`);
    expect(calls.groupedOrWhere).toContainEqual([`${TableName.Identity}.projectId`, "proj-1"]);
    expect(calls.whereNull).not.toContainEqual(`${TableName.Identity}.projectId`);
  });
});
