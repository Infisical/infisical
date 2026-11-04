import { logger } from "@app/lib/logger";

import { TAppConnectionHealthColumn, TAppConnectionHealthDALFactory } from "./app-connection-health-dal";

// Records whether the resources using a connection (its syncs, or its rotations) are working, so a destination outage
// counts once per connection rather than once per resource. No row or a null column means nothing on the connection has worked yet: a connection that has never
// worked failing is a misconfiguration, not a breakage. Each write is conditional on the state it replaces, so only
// the run that actually changes it reports the change. `loaded` is what the caller read before its run and can be
// stale when several resources share a connection; that only costs a query, because the write itself is checked.
// Never throws: losing one flip must not fail the run that caused it.
export const recordAppConnectionHealth = async ({
  appConnectionHealthDAL,
  connectionId,
  column,
  loaded,
  isSuccess,
  onStatusChange
}: {
  appConnectionHealthDAL: Pick<TAppConnectionHealthDALFactory, "transition" | "markWorkingIfUnknown">;
  connectionId: string;
  column: TAppConnectionHealthColumn;
  loaded: boolean | null | undefined;
  isSuccess: boolean;
  onStatusChange: (newStatus: "failed" | "healthy") => void;
}) => {
  if ((loaded ?? null) === !isSuccess) return;

  try {
    if (!isSuccess) {
      if (await appConnectionHealthDAL.transition({ connectionId, column, from: false, to: true })) {
        onStatusChange("failed");
      }
      return;
    }

    if (await appConnectionHealthDAL.transition({ connectionId, column, from: true, to: false })) {
      onStatusChange("healthy");
      return;
    }

    await appConnectionHealthDAL.markWorkingIfUnknown({ connectionId, column });
  } catch (error) {
    logger.warn(error, `Failed to record app connection health [connectionId=${connectionId}] [column=${column}]`);
  }
};
