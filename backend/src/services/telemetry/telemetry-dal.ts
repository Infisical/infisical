import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { DatabaseError } from "@app/lib/errors";

export type TTelemetryDALFactory = ReturnType<typeof telemetryDALFactory>;

export const telemetryDALFactory = (db: TDbClient) => {
  const getTelemetryInstanceStats = async () => {
    try {
      const userCount = (await db(TableName.Users).where({ isGhost: false }).count().first())?.count as string;
      const users = parseInt(userCount || "0", 10);

      const identityCount = (await db(TableName.Identity).count().first())?.count as string;
      const identities = parseInt(identityCount || "0", 10);

      const projectCount = (await db(TableName.Project).count().first())?.count as string;
      const projects = parseInt(projectCount || "0", 10);

      const secretCount = (await db(TableName.Secret).count().first())?.count as string;
      const secrets = parseInt(secretCount || "0", 10);

      const organizationNames = await db(TableName.Organization).select("name");
      const organizations = organizationNames.length;

      return {
        users,
        identities,
        projects,
        secrets,
        organizations,
        organizationNames: organizationNames.map(({ name }) => name)
      };
    } catch (error) {
      throw new DatabaseError({ error, name: "TelemtryInstanceStats" });
    }
  };

  return { getTelemetryInstanceStats };
};
