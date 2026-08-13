import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

export type TEndpointDeviceAppDALFactory = ReturnType<typeof endpointDeviceAppDALFactory>;

export type TReportedEndpointDeviceApp = {
  name: string;
  bundleId?: string | null;
  version?: string | null;
  path: string;
  source: string;
  isRunning: boolean;
};

export const endpointDeviceAppDALFactory = (db: TDbClient) => {
  const appOrm = ormify(db, TableName.EndpointDeviceApp);

  // An inventory is the whole truth about one device at one moment, so anything the agent did not
  // report has been uninstalled and its row goes. Rows that survive keep their firstSeenAt, which is
  // the only thing here that says how long an app has been on the machine.
  //
  // Short and write-only on purpose: the caller holds no other work open across it.
  const replaceForDevice = async (deviceId: string, apps: TReportedEndpointDeviceApp[], reportedAt: Date) => {
    try {
      await db.transaction(async (tx) => {
        if (apps.length) {
          await tx(TableName.EndpointDeviceApp)
            .insert(
              apps.map((app) => ({
                deviceId,
                name: app.name,
                bundleId: app.bundleId ?? null,
                version: app.version ?? null,
                path: app.path,
                source: app.source,
                isRunning: app.isRunning,
                firstSeenAt: reportedAt,
                lastSeenAt: reportedAt
              }))
            )
            .onConflict(["deviceId", "path"])
            .merge({
              name: db.raw(`EXCLUDED."name"`),
              bundleId: db.raw(`EXCLUDED."bundleId"`),
              version: db.raw(`EXCLUDED."version"`),
              source: db.raw(`EXCLUDED."source"`),
              isRunning: db.raw(`EXCLUDED."isRunning"`),
              lastSeenAt: db.raw(`EXCLUDED."lastSeenAt"`),
              updatedAt: new Date()
            });
        }

        // Whatever this inventory did not touch is no longer installed.
        await tx(TableName.EndpointDeviceApp).where({ deviceId }).andWhere("lastSeenAt", "<", reportedAt).delete();
      });
    } catch (error) {
      throw new DatabaseError({ error, name: "Replace endpoint device apps" });
    }
  };

  const findByDevice = async ({ projectId, deviceId }: { projectId: string; deviceId: string }, tx?: Knex) => {
    try {
      return await (tx || db.replicaNode())(TableName.EndpointDeviceApp)
        // Scoped through the device so an app inventory cannot be read across projects by guessing a
        // device id.
        .join(TableName.EndpointDevice, `${TableName.EndpointDevice}.id`, `${TableName.EndpointDeviceApp}.deviceId`)
        .where(`${TableName.EndpointDevice}.projectId`, projectId)
        .andWhere(`${TableName.EndpointDeviceApp}.deviceId`, deviceId)
        .select(
          db.ref("id").withSchema(TableName.EndpointDeviceApp),
          db.ref("name").withSchema(TableName.EndpointDeviceApp),
          db.ref("bundleId").withSchema(TableName.EndpointDeviceApp),
          db.ref("version").withSchema(TableName.EndpointDeviceApp),
          db.ref("path").withSchema(TableName.EndpointDeviceApp),
          db.ref("source").withSchema(TableName.EndpointDeviceApp),
          db.ref("isRunning").withSchema(TableName.EndpointDeviceApp),
          db.ref("firstSeenAt").withSchema(TableName.EndpointDeviceApp),
          db.ref("lastSeenAt").withSchema(TableName.EndpointDeviceApp)
        )
        .orderBy(`${TableName.EndpointDeviceApp}.name`, "asc");
    } catch (error) {
      throw new DatabaseError({ error, name: "Find endpoint device apps" });
    }
  };

  return { ...appOrm, replaceForDevice, findByDevice };
};
