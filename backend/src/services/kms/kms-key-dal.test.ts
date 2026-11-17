import knex from "knex";
import { vi } from "vitest";

import { TDbClient } from "@app/db";

import { kmskeyDALFactory } from "./kms-key-dal";

const recordQueries = () => {
  const db = knex({ client: "pg" });
  vi.spyOn(db.client, "acquireConnection").mockResolvedValue({});
  vi.spyOn(db.client, "releaseConnection").mockResolvedValue(undefined);
  const query = vi.spyOn(db.client, "query").mockImplementation(async (_connection, statement) => ({
    ...(statement as object),
    response: { rows: [], command: "SELECT" }
  }));
  return { db, sql: () => query.mock.calls.map(([, statement]) => (statement as { sql: string }).sql) };
};

describe("kms key lookups with the associated KMS", () => {
  test("select the external KMS inputs version by default", async () => {
    const { db, sql } = recordQueries();
    const dal = kmskeyDALFactory(db as TDbClient);

    await dal.findByIdWithAssociatedKms("kms-id", db);
    await dal.findByIdsWithAssociatedKms(["kms-id"], db);

    expect(sql()).toHaveLength(2);
    sql().forEach((statement) => expect(statement).toContain('"external_kms"."providerInputsVersion"'));
    await db.destroy();
  });

  test("never name the inputs version for historical migrations, which run before the column exists", async () => {
    const { db, sql } = recordQueries();
    const dal = kmskeyDALFactory(db as TDbClient, { selectProviderInputsVersion: false });

    await dal.findByIdWithAssociatedKms("kms-id", db);
    await dal.findByIdsWithAssociatedKms(["kms-id"], db);

    expect(sql()).toHaveLength(2);
    sql().forEach((statement) => {
      expect(statement).not.toContain("providerInputsVersion");
      expect(statement).toContain('"external_kms"."encryptedProviderInputs"');
    });
    await db.destroy();
  });
});
