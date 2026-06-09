import { TDbClient } from "@app/db";
import { TableName, TPamAccounts } from "@app/db/schemas";
import { sanitizeSqlLikeString } from "@app/lib/fn";
import { ormify } from "@app/lib/knex";

export type TPamAccountListItem = Pick<
  TPamAccounts,
  | "id"
  | "name"
  | "description"
  | "folderId"
  | "projectId"
  | "templateId"
  | "gatewayId"
  | "gatewayPoolId"
  | "recordingConnectionId"
  | "createdAt"
  | "updatedAt"
> & {
  accountType: string;
  templateName: string;
  folderName: string | null;
};

export type TPamAccountDetail = TPamAccounts & {
  accountType: string;
  templateName: string;
  templateAccessPolicy: unknown;
  templateSettings: unknown;
  folderName: string | null;
};

export type TPamAccountDALFactory = ReturnType<typeof pamAccountDALFactory>;

export const pamAccountDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.PamAccount);

  const findAccessible = async (
    projectId: string,
    accessibleFolderIds: string[],
    accessibleAccountIds: string[],
    filters?: { folderId?: string; templateId?: string; search?: string }
  ): Promise<TPamAccountListItem[]> => {
    const qb = db
      .replicaNode()(TableName.PamAccount)
      .join(TableName.PamAccountTemplate, `${TableName.PamAccount}.templateId`, `${TableName.PamAccountTemplate}.id`)
      .leftJoin(TableName.PamFolder, `${TableName.PamAccount}.folderId`, `${TableName.PamFolder}.id`)
      .where(`${TableName.PamAccount}.projectId`, projectId)
      .where((builder) => {
        if (accessibleFolderIds.length > 0) {
          void builder.whereIn(`${TableName.PamAccount}.folderId`, accessibleFolderIds);
        }
        if (accessibleAccountIds.length > 0) {
          void builder.orWhereIn(`${TableName.PamAccount}.id`, accessibleAccountIds);
        }
      })
      .select(
        `${TableName.PamAccount}.id`,
        `${TableName.PamAccount}.name`,
        `${TableName.PamAccount}.description`,
        `${TableName.PamAccount}.folderId`,
        `${TableName.PamAccount}.projectId`,
        `${TableName.PamAccount}.templateId`,
        `${TableName.PamAccount}.gatewayId`,
        `${TableName.PamAccount}.gatewayPoolId`,
        `${TableName.PamAccount}.recordingConnectionId`,
        `${TableName.PamAccount}.createdAt`,
        `${TableName.PamAccount}.updatedAt`,
        `${TableName.PamAccountTemplate}.type as accountType`,
        `${TableName.PamAccountTemplate}.name as templateName`,
        `${TableName.PamFolder}.name as folderName`
      );

    if (filters?.folderId) {
      void qb.where(`${TableName.PamAccount}.folderId`, filters.folderId);
    }
    if (filters?.templateId) {
      void qb.where(`${TableName.PamAccount}.templateId`, filters.templateId);
    }
    if (filters?.search) {
      void qb.whereILike(`${TableName.PamAccount}.name`, `%${sanitizeSqlLikeString(filters.search)}%`);
    }

    return qb
      .orderBy(`${TableName.PamFolder}.name`, "asc")
      .orderBy(`${TableName.PamAccount}.name`, "asc") as unknown as Promise<TPamAccountListItem[]>;
  };

  const findByIdWithDetails = async (accountId: string): Promise<TPamAccountDetail | null> => {
    const rows = (await db
      .replicaNode()(TableName.PamAccount)
      .join(TableName.PamAccountTemplate, `${TableName.PamAccount}.templateId`, `${TableName.PamAccountTemplate}.id`)
      .leftJoin(TableName.PamFolder, `${TableName.PamAccount}.folderId`, `${TableName.PamFolder}.id`)
      .where(`${TableName.PamAccount}.id`, accountId)
      .select(
        `${TableName.PamAccount}.*`,
        `${TableName.PamAccountTemplate}.type as accountType`,
        `${TableName.PamAccountTemplate}.name as templateName`,
        `${TableName.PamAccountTemplate}.accessPolicy as templateAccessPolicy`,
        `${TableName.PamAccountTemplate}.settings as templateSettings`,
        `${TableName.PamFolder}.name as folderName`
      )) as unknown as TPamAccountDetail[];

    return rows[0] || null;
  };

  return { ...orm, findAccessible, findByIdWithDetails };
};
