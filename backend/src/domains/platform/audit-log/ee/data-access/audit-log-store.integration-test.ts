import { randomUUID } from "node:crypto";

import { TableName, type TAuditLogs } from "@app/db/schemas";
import { singleStoreConnection } from "@app/domains/lib/data-access";
import { setupIntegration } from "@app/domains/lib/testing/integration";

import { describeAuditLogStoreContract } from "../testing/audit-log-store-contract";
import { AuditLogStore } from "./audit-log-store";

describe("AuditLogStore.insertBatch", () => {
  const h = setupIntegration();

  const row = (orgId: string, overrides: Partial<TAuditLogs> = {}): TAuditLogs => {
    const createdAt = new Date();
    return {
      id: randomUUID(),
      actor: "user",
      actorMetadata: { userId: randomUUID(), email: "a@example.com" },
      ipAddress: "10.0.0.1",
      eventType: "create-secret",
      eventMetadata: { secretKey: "KEY", environment: "dev" },
      userAgent: "agent",
      userAgentType: "web",
      expiresAt: new Date(createdAt.getTime() + 30 * 24 * 60 * 60 * 1000),
      createdAt,
      updatedAt: createdAt,
      orgId,
      projectId: null,
      projectName: null,
      ...overrides
    };
  };

  const storedFor = (orgId: string) => h.db(TableName.AuditLog).where({ orgId }).orderBy("id");

  test("should store every column of a batch", async () => {
    // Setup
    const tn = await h.newTenant();
    const log = row(tn.org.id, { projectId: tn.project.id, projectName: tn.project.name });

    // Action
    await new AuditLogStore(singleStoreConnection(h.db)).insertBatch([log]);

    // Assert
    const [stored] = await storedFor(tn.org.id);
    expect(stored).toMatchObject({
      id: log.id,
      actor: "user",
      actorMetadata: log.actorMetadata,
      eventType: "create-secret",
      eventMetadata: log.eventMetadata,
      ipAddress: "10.0.0.1",
      userAgentType: "web",
      projectId: tn.project.id,
      projectName: tn.project.name
    });
    expect(new Date(stored.expiresAt as Date).toISOString()).toBe(log.expiresAt!.toISOString());
  });

  test("should ignore a re-insert of the same ids, so a retried batch stores each log once", async () => {
    // Setup
    const tn = await h.newTenant();
    const store = new AuditLogStore(singleStoreConnection(h.db));
    const logs = [row(tn.org.id), row(tn.org.id)];
    await store.insertBatch(logs);

    // Action
    await store.insertBatch(logs);

    // Assert
    expect(await storedFor(tn.org.id)).toHaveLength(2);
  });

  test("should store a batch larger than one insert chunk", async () => {
    // Setup
    const tn = await h.newTenant();
    const logs = Array.from({ length: 1_050 }, () => row(tn.org.id));

    // Action
    await new AuditLogStore(singleStoreConnection(h.db)).insertBatch(logs);

    // Assert
    expect(await storedFor(tn.org.id)).toHaveLength(1_050);
  });
});

describe("AuditLogStore on Postgres", () => {
  const h = setupIntegration();

  describeAuditLogStoreContract("AuditLogStore", async () => {
    const tn = await h.newTenant();
    return {
      store: new AuditLogStore(singleStoreConnection(h.db)),
      orgId: tn.org.id,
      storedIds: async (orgId) =>
        (await h.db(TableName.AuditLog).where({ orgId }).select("id")).map((row: { id: string }) => row.id)
    };
  });
});
