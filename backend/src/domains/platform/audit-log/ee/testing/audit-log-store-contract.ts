import { randomUUID } from "node:crypto";

import { describe, expect, test } from "vitest";

import type { TAuditLogs } from "@app/db/schemas";

import type { TAuditLogStore } from "../services/dependencies";

export type TAuditLogStoreContractSetup = () => Promise<{
  store: TAuditLogStore;
  // An org the rows may belong to.
  orgId: string;
  storedIds: (orgId: string) => Promise<string[]>;
}>;

const auditLogRow = (orgId: string): TAuditLogs => {
  const createdAt = new Date();
  return {
    id: randomUUID(),
    actor: "platform",
    actorMetadata: {},
    ipAddress: null,
    eventType: "create-secret",
    eventMetadata: { secretKey: "KEY" },
    userAgent: null,
    userAgentType: null,
    expiresAt: new Date(createdAt.getTime() + 24 * 60 * 60 * 1000),
    createdAt,
    updatedAt: createdAt,
    orgId,
    projectId: null,
    projectName: null
  };
};

// The cases every TAuditLogStore passes, Postgres and in memory alike.
export const describeAuditLogStoreContract = (name: string, setup: TAuditLogStoreContractSetup) => {
  describe(`${name} (audit log store contract)`, () => {
    test("should store every row of a batch", async () => {
      // Setup
      const { store, orgId, storedIds } = await setup();
      const rows = [auditLogRow(orgId), auditLogRow(orgId)];

      // Action
      await store.insertBatch(rows);

      // Assert
      expect((await storedIds(orgId)).sort()).toEqual(rows.map((row) => row.id).sort());
    });

    test("should store a re-inserted id once, so a retried batch is safe", async () => {
      // Setup
      const { store, orgId, storedIds } = await setup();
      const rows = [auditLogRow(orgId)];
      await store.insertBatch(rows);

      // Action
      await store.insertBatch([...rows, auditLogRow(orgId)]);

      // Assert
      expect(await storedIds(orgId)).toHaveLength(2);
    });

    test("should do nothing for an empty batch", async () => {
      // Setup
      const { store, orgId, storedIds } = await setup();

      // Action
      await store.insertBatch([]);

      // Assert
      expect(await storedIds(orgId)).toEqual([]);
    });
  });
};
