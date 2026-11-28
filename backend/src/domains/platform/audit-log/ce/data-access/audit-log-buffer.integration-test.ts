import { setupRedis } from "@app/domains/lib/testing/integration";

import { describeAuditLogBufferContract } from "../testing/audit-log-buffer-contract";
import { AuditLogBuffer } from "./audit-log-buffer";

describe("AuditLogBuffer on Redis", () => {
  const redis = setupRedis();

  describeAuditLogBufferContract("AuditLogBuffer over the Redis key store", async () => ({
    buffer: new AuditLogBuffer(await redis.newKeyStore())
  }));
});
