import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TPamAccounts } from "@app/db/schemas";
import { sanitizeSqlLikeString } from "@app/lib/fn";
import { ormify } from "@app/lib/knex";

import { PamAccountType } from "../pam/pam-enums";
import { PamRecordingStorageBackend } from "../pam-session-recording/pam-recording-enums";

export const accountAccessibilitySql = (accountTable: string, templateTable: string): string =>
  `(
    ("${accountTable}"."gatewayId" is not null or "${accountTable}"."gatewayPoolId" is not null
      or "${templateTable}"."gatewayId" is not null or "${templateTable}"."gatewayPoolId" is not null)
    and "${accountTable}"."credentialConfigured" = true
    and ("${templateTable}"."type" != '${PamAccountType.Windows}'
      or (
        "${templateTable}"."settings"->>'recordingStorageBackend' = '${PamRecordingStorageBackend.AwsS3}'
        and ("${accountTable}"."recordingConnectionId" is not null
          or "${templateTable}"."recordingConnectionId" is not null)
        and coalesce(
          "${accountTable}"."settingsOverrides"->'recordingS3Config',
          "${templateTable}"."settings"->'recordingS3Config'
        ) is not null
      ))
  )`;

type TPamAccountTemplateInheritedFields = {
  credentialConfigured: boolean;
  templateGatewayId: string | null;
  templateGatewayPoolId: string | null;
  templateRecordingConnectionId: string | null;
  templateSettings: unknown;
};

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
  | "settingsOverrides"
  | "createdAt"
  | "updatedAt"
> &
  TPamAccountTemplateInheritedFields & {
    accountType: string;
    templateName: string;
    folderName: string | null;
  };

export type TPamAccountDetail = TPamAccounts &
  TPamAccountTemplateInheritedFields & {
    accountType: string;
    templateName: string;
    templatePolicies: unknown;
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
    filters?: {
      folderId?: string;
      templateId?: string;
      accountType?: string;
      search?: string;
      onlyAccessible?: boolean;
      offset?: number;
      limit?: number;
    },
    tx?: Knex
  ) => {
    const baseQuery = (tx || db.replicaNode())(TableName.PamAccount)
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
      });

    if (filters?.folderId) {
      void baseQuery.where(`${TableName.PamAccount}.folderId`, filters.folderId);
    }
    if (filters?.templateId) {
      void baseQuery.where(`${TableName.PamAccount}.templateId`, filters.templateId);
    }
    if (filters?.accountType) {
      void baseQuery.where(`${TableName.PamAccountTemplate}.type`, filters.accountType);
    }
    if (filters?.search) {
      const pattern = `%${sanitizeSqlLikeString(filters.search)}%`;
      void baseQuery.whereILike(`${TableName.PamAccount}.name`, pattern);
    }
    if (filters?.onlyAccessible) {
      void baseQuery.whereRaw(accountAccessibilitySql(TableName.PamAccount, TableName.PamAccountTemplate));
    }

    const countQuery = baseQuery
      .clone()
      .clearSelect()
      .count(`${TableName.PamAccount}.id as count`)
      .first<{ count: string }>();

    const dataQuery = baseQuery
      .clone()
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
        `${TableName.PamAccount}.settingsOverrides`,
        `${TableName.PamAccount}.credentialConfigured`,
        `${TableName.PamAccount}.createdAt`,
        `${TableName.PamAccount}.updatedAt`,
        `${TableName.PamAccountTemplate}.type as accountType`,
        `${TableName.PamAccountTemplate}.name as templateName`,
        `${TableName.PamAccountTemplate}.settings as templateSettings`,
        `${TableName.PamAccountTemplate}.gatewayId as templateGatewayId`,
        `${TableName.PamAccountTemplate}.gatewayPoolId as templateGatewayPoolId`,
        `${TableName.PamAccountTemplate}.recordingConnectionId as templateRecordingConnectionId`,
        `${TableName.PamFolder}.name as folderName`
      )
      .orderBy(`${TableName.PamFolder}.name`, "asc")
      .orderBy(`${TableName.PamAccount}.name`, "asc");

    if (filters?.limit) void dataQuery.limit(filters.limit);
    if (filters?.offset) void dataQuery.offset(filters.offset);

    const [countResult, accounts] = await Promise.all([countQuery, dataQuery]);

    return {
      accounts: accounts as unknown as TPamAccountListItem[],
      totalCount: Number(countResult?.count ?? 0)
    };
  };

  const findByIdWithDetails = async (accountId: string, tx?: Knex): Promise<TPamAccountDetail | null> => {
    const rows = (await (tx || db.replicaNode())(TableName.PamAccount)
      .join(TableName.PamAccountTemplate, `${TableName.PamAccount}.templateId`, `${TableName.PamAccountTemplate}.id`)
      .leftJoin(TableName.PamFolder, `${TableName.PamAccount}.folderId`, `${TableName.PamFolder}.id`)
      .where(`${TableName.PamAccount}.id`, accountId)
      .select(
        `${TableName.PamAccount}.*`,
        `${TableName.PamAccountTemplate}.type as accountType`,
        `${TableName.PamAccountTemplate}.name as templateName`,
        `${TableName.PamAccountTemplate}.policies as templatePolicies`,
        `${TableName.PamAccountTemplate}.settings as templateSettings`,
        `${TableName.PamAccountTemplate}.gatewayId as templateGatewayId`,
        `${TableName.PamAccountTemplate}.gatewayPoolId as templateGatewayPoolId`,
        `${TableName.PamAccountTemplate}.recordingConnectionId as templateRecordingConnectionId`,
        `${TableName.PamFolder}.name as folderName`
      )) as unknown as TPamAccountDetail[];

    return rows[0] || null;
  };

  return { ...orm, findAccessible, findByIdWithDetails };
};
