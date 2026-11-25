import { InMemoryKeyStore } from "@app/domains/lib/key-store/testing/in-memory-key-store";

import { describeAuditLogBufferContract } from "../testing/audit-log-buffer-contract";
import { AuditLogBuffer } from "./audit-log-buffer";

describeAuditLogBufferContract("AuditLogBuffer over InMemoryKeyStore", async () => ({
  buffer: new AuditLogBuffer(new InMemoryKeyStore())
}));
