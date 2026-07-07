import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TPamAccounts } from "@app/db/schemas";
import { sanitizeSqlLikeString } from "@app/lib/fn";
import { ormify } from "@app/lib/knex";

import { PamAccountType } from "../pam/pam-enums";
import {
  ACCOUNT_NEEDS_ROTATION_ACCOUNT_SQL,
  ACCOUNT_WILL_ROTATE_SQL,
  computeNextRotationAt,
  getRotationReadiness,
  ROTATABLE_ACCOUNT_TYPES,
  rotationJitterCapSeconds
} from "../pam-account-rotation/pam-rotation-fns";
import { PamTemplateSettingsSchema } from "../pam-account-template/pam-account-template-schemas";
import { PamRecordingStorageBackend } from "../pam-session-recording/pam-recording-enums";
import { ACCOUNT_TYPE_CONFIGS } from "./pam-account-schemas";

const ROTATABLE_TYPE_VALUES = ROTATABLE_ACCOUNT_TYPES as readonly string[];

export type TPamRotationCandidate = {
  id: string;
  name: string;
  folderId: string | null;
  folderName: string | null;
  accountType: string;
  encryptedConnectionDetails: Buffer;
};

const recordingRequiredAccountTypes = [PamAccountType.Windows, PamAccountType.WindowsAd]
  .map((type) => `'${type}'`)
  .join(", ");

const gatewayExemptAccountTypes = (Object.entries(ACCOUNT_TYPE_CONFIGS) as [string, { requiresGateway?: boolean }][])
  .filter(([, config]) => config.requiresGateway === false)
  .map(([type]) => `'${type}'`)
  .join(", ");

export const accountAccessibilitySql = (accountTable: string, templateTable: string): string =>
  `(
    ("${templateTable}"."type" in (${gatewayExemptAccountTypes})
      or "${accountTable}"."gatewayId" is not null or "${accountTable}"."gatewayPoolId" is not null
      or "${templateTable}"."gatewayId" is not null or "${templateTable}"."gatewayPoolId" is not null)
    and "${accountTable}"."credentialConfigured" = true
    and ("${templateTable}"."type" not in (${recordingRequiredAccountTypes})
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

  const detailSelect = [
    `${TableName.PamAccount}.*`,
    `${TableName.PamAccountTemplate}.type as accountType`,
    `${TableName.PamAccountTemplate}.name as templateName`,
    `${TableName.PamAccountTemplate}.policies as templatePolicies`,
    `${TableName.PamAccountTemplate}.settings as templateSettings`,
    `${TableName.PamAccountTemplate}.gatewayId as templateGatewayId`,
    `${TableName.PamAccountTemplate}.gatewayPoolId as templateGatewayPoolId`,
    `${TableName.PamAccountTemplate}.recordingConnectionId as templateRecordingConnectionId`,
    `${TableName.PamFolder}.name as folderName`
  ];

  const findByIdWithDetails = async (accountId: string, tx?: Knex): Promise<TPamAccountDetail | null> => {
    const rows = (await (tx || db.replicaNode())(TableName.PamAccount)
      .join(TableName.PamAccountTemplate, `${TableName.PamAccount}.templateId`, `${TableName.PamAccountTemplate}.id`)
      .leftJoin(TableName.PamFolder, `${TableName.PamAccount}.folderId`, `${TableName.PamFolder}.id`)
      .where(`${TableName.PamAccount}.id`, accountId)
      .select(detailSelect)) as unknown as TPamAccountDetail[];

    return rows[0] || null;
  };

  // Due, rotatable, enabled; excludes soft-deleted projects (rotating their accounts is a side effect during cleanup).
  const dueRotationQuery = (now: Date, tx?: Knex) =>
    (tx || db.replicaNode())(TableName.PamAccount)
      .join(TableName.PamAccountTemplate, `${TableName.PamAccount}.templateId`, `${TableName.PamAccountTemplate}.id`)
      .join(TableName.Project, `${TableName.PamAccount}.projectId`, `${TableName.Project}.id`)
      .whereNull(`${TableName.Project}.deleteAfter`)
      .whereNotNull(`${TableName.PamAccount}.nextRotationAt`)
      .where(`${TableName.PamAccount}.nextRotationAt`, "<=", now)
      .whereIn(`${TableName.PamAccountTemplate}.type`, ROTATABLE_TYPE_VALUES)
      .whereRaw(`"${TableName.PamAccountTemplate}"."settings"->'rotation'->>'enabled' = 'true'`);

  // Only ready accounts get a nextRotationAt, so every due row here is already rotation-ready.
  const findAccountsToRotate = async (now: Date, limit: number, tx?: Knex): Promise<TPamAccountDetail[]> => {
    const rows = (await dueRotationQuery(now, tx)
      .leftJoin(TableName.PamFolder, `${TableName.PamAccount}.folderId`, `${TableName.PamFolder}.id`)
      .orderBy(`${TableName.PamAccount}.nextRotationAt`, "asc")
      .limit(limit)
      .select(detailSelect)) as unknown as TPamAccountDetail[];
    return rows;
  };

  const countAccountsToRotate = async (now: Date, tx?: Knex): Promise<number> => {
    const result = await dueRotationQuery(now, tx).count<[{ count: string }]>(`${TableName.PamAccount}.id`);
    return Number(result[0]?.count ?? 0);
  };

  const findRotationCandidates = async (
    projectId: string,
    accessibleFolderIds: string[],
    accessibleAccountIds: string[],
    accountType: string,
    tx?: Knex
  ): Promise<TPamRotationCandidate[]> => {
    if (accessibleFolderIds.length === 0 && accessibleAccountIds.length === 0) return [];

    const rows = (await (tx || db.replicaNode())(TableName.PamAccount)
      .join(TableName.PamAccountTemplate, `${TableName.PamAccount}.templateId`, `${TableName.PamAccountTemplate}.id`)
      .leftJoin(TableName.PamFolder, `${TableName.PamAccount}.folderId`, `${TableName.PamFolder}.id`)
      .where(`${TableName.PamAccount}.projectId`, projectId)
      .where(`${TableName.PamAccountTemplate}.type`, accountType)
      // A delegated rotator authenticates with its own stored password, so exclude accounts without one.
      .where(`${TableName.PamAccount}.credentialConfigured`, true)
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
        `${TableName.PamAccount}.folderId`,
        `${TableName.PamAccount}.encryptedConnectionDetails`,
        `${TableName.PamAccountTemplate}.type as accountType`,
        `${TableName.PamFolder}.name as folderName`
      )
      .orderBy(`${TableName.PamFolder}.name`, "asc")
      .orderBy(`${TableName.PamAccount}.name`, "asc")) as unknown as TPamRotationCandidate[];
    return rows;
  };

  // Bulk set-based reschedule of a template's accounts; rescheduleReady also recomputes already-scheduled ones.
  const reconcileRotationScheduleForTemplate = async (
    templateId: string,
    opts?: { rescheduleReady?: boolean },
    tx?: Knex
  ): Promise<void> => {
    const dbClient = tx || db;
    const template = await dbClient(TableName.PamAccountTemplate)
      .where({ id: templateId })
      .first<{ type: string; settings: unknown } | undefined>("type", "settings");
    if (!template) return;

    const parsed = PamTemplateSettingsSchema.safeParse(template.settings);
    const rotation = parsed.success ? parsed.data.rotation : undefined;
    const enabled = rotation?.enabled === true && ROTATABLE_TYPE_VALUES.includes(template.type);

    if (!enabled || !rotation || rotation.intervalSeconds == null) {
      await dbClient(TableName.PamAccount)
        .where({ templateId })
        .whereNotNull("nextRotationAt")
        .update({ nextRotationAt: null });
      return;
    }

    const { intervalSeconds } = rotation;
    const jitterCapSeconds = rotationJitterCapSeconds(intervalSeconds);

    await dbClient(TableName.PamAccount)
      .where({ templateId })
      .whereNotNull("nextRotationAt")
      .whereRaw(`(${ACCOUNT_NEEDS_ROTATION_ACCOUNT_SQL})`)
      .update({ nextRotationAt: null });

    const readyUpdate = dbClient(TableName.PamAccount).where({ templateId }).whereRaw(`(${ACCOUNT_WILL_ROTATE_SQL})`);
    if (!opts?.rescheduleReady) {
      void readyUpdate.whereNull("nextRotationAt");
    }
    await readyUpdate.update({
      nextRotationAt: dbClient.raw(
        `GREATEST(COALESCE(??, now()) + make_interval(secs => ?), now()) + make_interval(secs => floor(random() * ?)::int)`,
        ["lastRotatedAt", intervalSeconds, jitterCapSeconds]
      ) as unknown as Date
    });
  };

  const reconcileRotationScheduleForAccount = async (accountId: string, tx?: Knex): Promise<void> => {
    const account = await findByIdWithDetails(accountId, tx ?? db);
    if (!account) return;

    const readiness = getRotationReadiness({
      accountId: account.id,
      accountType: account.accountType,
      rotationAccountId: account.rotationAccountId,
      credentialConfigured: account.credentialConfigured
    });
    const rotation = PamTemplateSettingsSchema.safeParse(account.templateSettings).data?.rotation;
    const current = account.nextRotationAt ?? null;

    let nextRotationAt: Date | null = current;
    if (!readiness.ready || !rotation?.enabled || rotation.intervalSeconds == null) {
      nextRotationAt = null;
    } else if (!current) {
      nextRotationAt = computeNextRotationAt({
        anchor: account.lastRotatedAt ?? null,
        intervalSeconds: rotation.intervalSeconds,
        now: new Date()
      });
    }

    if ((nextRotationAt?.getTime() ?? null) !== (current?.getTime() ?? null)) {
      await (tx || db)(TableName.PamAccount).where({ id: accountId }).update({ nextRotationAt });
    }
  };

  return {
    ...orm,
    findAccessible,
    findByIdWithDetails,
    findAccountsToRotate,
    countAccountsToRotate,
    findRotationCandidates,
    reconcileRotationScheduleForTemplate,
    reconcileRotationScheduleForAccount
  };
};
