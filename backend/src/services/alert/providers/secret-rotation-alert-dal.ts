import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";

export type TSecretRotationWithLocation = {
  rotationId: string;
  rotationName: string;
  rotationType: string;
  connectionId: string;
  folderId: string;
  orgId: string;
  projectId: string;
  envSlug: string;
  envName: string;
};

export type TSecretRotationAlertDALFactory = ReturnType<typeof secretRotationAlertDALFactory>;

export const secretRotationAlertDALFactory = (db: TDbClient) => {
  // Reads the primary: the event path treats an empty result as terminal, and the failure event commits in the
  // same transaction that marks the rotation failed. The create form also adds a rotation's alert right after
  // creating the rotation, and a lagging replica would leave that alert's audit log without the rotation's name.
  const $rotationsWithProject = (rotationIds: string[]) =>
    db(TableName.SecretRotationV2)
      .whereIn(`${TableName.SecretRotationV2}.id`, rotationIds)
      .join(TableName.SecretFolder, `${TableName.SecretRotationV2}.folderId`, `${TableName.SecretFolder}.id`)
      .join(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
      .join(TableName.Project, `${TableName.Environment}.projectId`, `${TableName.Project}.id`);

  const findRotationsByIds = async (rotationIds: string[]): Promise<TSecretRotationWithLocation[]> => {
    if (rotationIds.length === 0) return [];
    try {
      return (await $rotationsWithProject(rotationIds)
        .whereNull(`${TableName.Environment}.deleteAfter`)
        .whereNull(`${TableName.Project}.deleteAfter`)
        .select(
          db.ref("id").withSchema(TableName.SecretRotationV2).as("rotationId"),
          db.ref("name").withSchema(TableName.SecretRotationV2).as("rotationName"),
          db.ref("type").withSchema(TableName.SecretRotationV2).as("rotationType"),
          db.ref("connectionId").withSchema(TableName.SecretRotationV2).as("connectionId"),
          db.ref("folderId").withSchema(TableName.SecretRotationV2).as("folderId"),
          db.ref("slug").withSchema(TableName.Environment).as("envSlug"),
          db.ref("name").withSchema(TableName.Environment).as("envName"),
          db.ref("id").withSchema(TableName.Project).as("projectId"),
          db.ref("orgId").withSchema(TableName.Project).as("orgId")
        )) as TSecretRotationWithLocation[];
    } catch (error) {
      throw new DatabaseError({ error, name: "FindSecretRotationsByIds" });
    }
  };

  const findRotationNamesByIds = async (
    rotationIds: string[],
    orgId: string
  ): Promise<{ id: string; name: string }[]> => {
    if (rotationIds.length === 0) return [];
    try {
      return (await $rotationsWithProject(rotationIds)
        .where(`${TableName.Project}.orgId`, orgId)
        .select(`${TableName.SecretRotationV2}.id`, `${TableName.SecretRotationV2}.name`)) as {
        id: string;
        name: string;
      }[];
    } catch (error) {
      throw new DatabaseError({ error, name: "FindSecretRotationNamesByIds" });
    }
  };

  return { findRotationsByIds, findRotationNamesByIds };
};
