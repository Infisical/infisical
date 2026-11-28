import { randomUUID } from "crypto";
import { v7 as uuidv7 } from "uuid";

import type { TAuditLogIdGenerator } from "../dependencies";

// ClickHouse orders by id, so its ids are time-ordered (uuidv7) from the record's own timestamp.
export class AuditLogIdGenerator implements TAuditLogIdGenerator {
  constructor(private readonly useTimeOrderedIds: boolean) {}

  next(createdAt: Date): string {
    return this.useTimeOrderedIds ? uuidv7({ msecs: createdAt.getTime() }) : randomUUID();
  }
}
