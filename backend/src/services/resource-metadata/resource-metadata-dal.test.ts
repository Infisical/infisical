import knex from "knex";
import { vi } from "vitest";

import { TDbClient } from "@app/db";

import { resourceMetadataDALFactory } from "./resource-metadata-dal";
import { SecretMetadataSearchLogicalOperator, SecretMetadataSearchOperator } from "./resource-metadata-types";

describe("metadata candidate SQL scope", () => {
  test.each(["searchSecretMetadata", "searchSecretMetadataWithEncryptedValues"] as const)(
    "%s constrains folders before the candidate limit",
    async (method) => {
      const db = knex({ client: "pg" });
      vi.spyOn(db.client, "acquireConnection").mockResolvedValue({});
      vi.spyOn(db.client, "releaseConnection").mockResolvedValue(undefined);
      const query = vi.spyOn(db.client, "query").mockImplementation(async (_connection, statement) => ({
        ...(statement as object),
        response: { rows: [], command: "SELECT" }
      }));
      const dal = resourceMetadataDALFactory(db as TDbClient);
      await dal[method](
        {
          orgId: "org",
          projectId: "project",
          filters: [{ key: "team", value: "platform", operator: SecretMetadataSearchOperator.Is }],
          operator: SecretMetadataSearchLogicalOperator.And,
          folderIds: ["parent", "child"],
          tagSlugs: ["backend"],
          limit: 100
        },
        db
      );
      const statement = query.mock.calls[0][1] as { sql: string; bindings: unknown[] };
      expect(statement.sql).toMatch(/"folderId" in \(\?, \?\).*limit \?/);
      expect(statement.bindings).toEqual(expect.arrayContaining(["org", "project", "parent", "child", "backend", 100]));
      expect(statement.sql).not.toContain("encryptedSecretValue");
      await db.destroy();
    }
  );
});
