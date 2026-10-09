import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";

export type TAuditLogStreamAlertDALFactory = ReturnType<typeof auditLogStreamAlertDALFactory>;

export type TAuditLogStreamRef = {
  id: string;
  provider: string;
};

export const auditLogStreamAlertDALFactory = (db: TDbClient) => {
  // Primary on purpose: the event is emitted in the transaction that flips the stream to failing, and
  // an empty read here is terminal, so a lagging replica would swallow the notification.
  const findStreamsByIds = async (streamIds: string[], orgId: string): Promise<TAuditLogStreamRef[]> => {
    if (streamIds.length === 0) return [];
    try {
      return (await db
        .primaryNode()(TableName.AuditLogStream)
        .whereIn("id", streamIds)
        .where({ orgId })
        .select("id", "provider")) as TAuditLogStreamRef[];
    } catch (error) {
      throw new DatabaseError({ error, name: "AuditLogStreamAlert: findStreamsByIds" });
    }
  };

  return { findStreamsByIds };
};
