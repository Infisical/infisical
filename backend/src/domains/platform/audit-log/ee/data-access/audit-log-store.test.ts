import { randomUUID } from "node:crypto";

import { describeAuditLogStoreContract } from "../testing/audit-log-store-contract";
import { InMemoryAuditLogStore } from "../testing/in-memory-audit-log-store";

describeAuditLogStoreContract("InMemoryAuditLogStore", async () => {
  const store = new InMemoryAuditLogStore();
  return {
    store,
    orgId: randomUUID(),
    storedIds: async (orgId) => store.rows.filter((row) => row.orgId === orgId).map((row) => row.id)
  };
});
