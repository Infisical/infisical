import { DataAccessDb } from "@app/domains/lib/data-access-db";

import { InstanceConfigDataAccess, TInstanceConfigDataAccess } from "./instance-config-data-access";

export type TInstanceConfigCoreDataAccess = {
  instanceConfig: TInstanceConfigDataAccess;
};

export const buildInstanceConfigCoreDataAccess = (db: DataAccessDb): TInstanceConfigCoreDataAccess => ({
  instanceConfig: new InstanceConfigDataAccess(db)
});
