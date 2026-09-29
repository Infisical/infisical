/* eslint-disable no-await-in-loop -- batches run one after another on purpose */
import { Knex } from "knex";

import { inMemoryKeyStore } from "@app/keystore/memory";
import { initLogger, logger } from "@app/lib/logger";
import { resolvePrincipalsInScope } from "@app/services/alert/alert-principal-scope-fns";
import { kmsRootConfigDALFactory } from "@app/services/kms/kms-root-config-dal";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { orgDALFactory } from "@app/services/org/org-dal";
import { projectDALFactory } from "@app/services/project/project-dal";
import { superAdminDALFactory } from "@app/services/super-admin/super-admin-dal";

import { TableName } from "../schemas";
import { getMigrationEnvConfig, getMigrationHsmConfig } from "./utils/env-config";
import { createCircularCache } from "./utils/ring-buffer";
import { getMigrationEncryptionServices, getMigrationHsmService } from "./utils/services";

// Copied rather than imported so later changes to the reminder or alert code can't change what this
// migration did.
const RESOURCE_TYPE = "secret.reminder";
const EVENT_TYPE = "secret.reminder.due";
const MAX_ALERT_NAME_LENGTH = 255;
const MAX_RECIPIENTS_PER_CHANNEL = 20;
const CATCH_UP_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
const BATCH_SIZE = 100;
const BATCH_STATEMENT_TIMEOUT_MS = 60_000;

type TReminderRow = {
  id: string;
  secretId: string;
  secretKey: string;
  projectId: string;
  orgId: string;
};

type TRecipient = { principalType: string; principalId: string };

const startOfUtcDay = (date: Date) => Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());

// Recurring reminders that silently died (a failed send left their date in the past) resume on their
// original schedule from the next future date. Nothing is sent for the dates they missed.
const rollForwardStaleReminders = async (knex: Knex) => {
  const now = new Date();
  const cutoff = new Date(startOfUtcDay(now) - CATCH_UP_DAYS * DAY_MS);
  const endOfToday = startOfUtcDay(now) + DAY_MS - 1;

  const stale = (await knex(TableName.Reminder)
    .whereNotNull("repeatDays")
    .where("repeatDays", ">", 0)
    .where("nextReminderDate", "<", cutoff)
    .select("id", "nextReminderDate", "repeatDays")) as { id: string; nextReminderDate: Date; repeatDays: number }[];

  for (let i = 0; i < stale.length; i += BATCH_SIZE) {
    const batch = stale.slice(i, i + BATCH_SIZE);
    await knex.transaction(async (tx) => {
      await tx.raw(`SET LOCAL statement_timeout = ${BATCH_STATEMENT_TIMEOUT_MS}`);
      for (const reminder of batch) {
        const due = new Date(reminder.nextReminderDate).getTime();
        const periodMs = reminder.repeatDays * DAY_MS;
        const periods = Math.floor((endOfToday - due) / periodMs) + 1;
        await tx(TableName.Reminder)
          .where({ id: reminder.id })
          .update({ nextReminderDate: new Date(due + periods * periodMs) });
      }
    });
  }
  logger.info(`migrate-secret-reminders-to-alerts: rolled forward ${stale.length} stale recurring reminders`);
};

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.Reminder)) || !(await knex.schema.hasTable(TableName.Alert))) return;

  initLogger();

  await rollForwardStaleReminders(knex);

  const hasReminders = await knex(TableName.Reminder).whereNotNull("secretId").first("id");
  if (!hasReminders) return;

  const { hsmService } = await getMigrationHsmService({ envConfig: getMigrationHsmConfig() });
  const envConfig = await getMigrationEnvConfig(superAdminDALFactory(knex), hsmService, kmsRootConfigDALFactory(knex));
  const { kmsService } = await getMigrationEncryptionServices({ envConfig, keyStore: inMemoryKeyStore(), db: knex });
  const cipherCache = createCircularCache<Awaited<ReturnType<(typeof kmsService)["createCipherPairWithDataKey"]>>>(25);
  const orgDAL = orgDALFactory(knex as never);
  const projectDAL = projectDALFactory(knex as never);

  let lastId: string | undefined;
  let migrated = 0;

  for (;;) {
    const cursor = lastId;
    const reminders = (await knex(TableName.Reminder)
      .join(TableName.SecretV2, `${TableName.Reminder}.secretId`, `${TableName.SecretV2}.id`)
      .join(TableName.SecretFolder, `${TableName.SecretV2}.folderId`, `${TableName.SecretFolder}.id`)
      .join(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
      .join(TableName.Project, `${TableName.Environment}.projectId`, `${TableName.Project}.id`)
      .modify((qb) => {
        if (cursor) void qb.where(`${TableName.Reminder}.id`, ">", cursor);
      })
      .orderBy(`${TableName.Reminder}.id`, "asc")
      .limit(BATCH_SIZE)
      .select(
        knex.ref("id").withSchema(TableName.Reminder),
        knex.ref("secretId").withSchema(TableName.Reminder),
        knex.ref("key").withSchema(TableName.SecretV2).as("secretKey"),
        knex.ref("id").withSchema(TableName.Project).as("projectId"),
        knex.ref("orgId").withSchema(TableName.Project).as("orgId")
      )) as TReminderRow[];
    if (reminders.length === 0) break;
    lastId = reminders[reminders.length - 1].id;

    // A rerun after a partial failure skips reminders that already have their alert.
    const alreadyMigrated = new Set(
      (
        await knex(TableName.Alert)
          .where({ resourceType: RESOURCE_TYPE })
          .whereIn(
            "resourceId",
            reminders.map((reminder) => reminder.secretId)
          )
          .select("resourceId")
      ).map((row) => row.resourceId as string)
    );
    const pending = reminders.filter((reminder) => !alreadyMigrated.has(reminder.secretId));

    const recipientRows = (await knex(TableName.ReminderRecipient)
      .whereIn(
        "reminderId",
        pending.map((reminder) => reminder.id)
      )
      .select("reminderId", "userId")) as { reminderId: string; userId: string }[];

    const encryptedEmptyConfigByProject = new Map<string, Buffer>();
    for (const projectId of new Set(pending.map((reminder) => reminder.projectId))) {
      let cipher = cipherCache.getItem(projectId);
      if (!cipher) {
        cipher = await kmsService.createCipherPairWithDataKey({ type: KmsDataKey.SecretManager, projectId }, knex);
        cipherCache.push(projectId, cipher);
      }
      encryptedEmptyConfigByProject.set(
        projectId,
        cipher.encryptor({ plainText: Buffer.from(JSON.stringify({})) }).cipherTextBlob
      );
    }

    // Reminder recipients were never pruned when someone left a project. Keep only principals the alert
    // module would accept, so the migrated channel can be saved again from the UI.
    const recipientsByReminder = new Map<string, TRecipient[]>();
    for (const reminder of pending) {
      const userIds = [
        ...new Set(recipientRows.filter((row) => row.reminderId === reminder.id).map((row) => row.userId))
      ];
      const inScope = userIds.length
        ? await resolvePrincipalsInScope(
            { orgDAL, projectDAL },
            { orgId: reminder.orgId, projectId: reminder.projectId, userIds, groupIds: [], tx: knex }
          )
        : { userIds: new Set<string>() };
      const kept = userIds.filter((userId) => inScope.userIds.has(userId));
      recipientsByReminder.set(
        reminder.id,
        kept.length
          ? kept.map((principalId) => ({ principalType: "user", principalId }))
          : [{ principalType: "project-members", principalId: reminder.projectId }]
      );
    }

    await knex.transaction(async (tx) => {
      await tx.raw(`SET LOCAL statement_timeout = ${BATCH_STATEMENT_TIMEOUT_MS}`);
      for (const reminder of pending) {
        const [alert] = (await tx(TableName.Alert)
          .insert({
            name: `Reminder for ${reminder.secretKey}`.slice(0, MAX_ALERT_NAME_LENGTH),
            resourceType: RESOURCE_TYPE,
            resourceId: reminder.secretId,
            eventType: EVENT_TYPE,
            triggerType: "event",
            condition: null,
            enabled: true,
            orgId: reminder.orgId,
            projectId: reminder.projectId,
            createdByActorId: null,
            createdByActorType: "platform"
          })
          .returning("id")) as { id: string }[];

        const recipients = recipientsByReminder.get(reminder.id) ?? [];
        for (let i = 0; i < recipients.length; i += MAX_RECIPIENTS_PER_CHANNEL) {
          const channelNumber = i / MAX_RECIPIENTS_PER_CHANNEL + 1;
          const [channel] = (await tx(TableName.AlertChannel)
            .insert({
              name: channelNumber === 1 ? "Email" : `Email ${channelNumber}`,
              channelType: "email",
              encryptedConfig: encryptedEmptyConfigByProject.get(reminder.projectId) as Buffer,
              enabled: true,
              orgId: reminder.orgId,
              projectId: reminder.projectId,
              createdByActorId: null,
              createdByActorType: "platform"
            })
            .returning("id")) as { id: string }[];
          await tx(TableName.AlertChannelMembership).insert({ alertId: alert.id, channelId: channel.id });
          await tx(TableName.AlertChannelRecipient).insert(
            recipients.slice(i, i + MAX_RECIPIENTS_PER_CHANNEL).map((recipient) => ({
              channelId: channel.id,
              principalType: recipient.principalType,
              principalId: recipient.principalId
            }))
          );
        }
      }
    });

    migrated += pending.length;
  }

  logger.info(`migrate-secret-reminders-to-alerts: created alerts for ${migrated} reminders`);
}

export async function down(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.Alert))) return;

  const alertIds = knex(TableName.Alert)
    .where({ resourceType: RESOURCE_TYPE, createdByActorType: "platform" })
    .whereNull("createdByActorId")
    .select("id");
  const channelIds = (await knex(TableName.AlertChannelMembership)
    .whereIn("alertId", alertIds)
    .pluck("channelId")) as string[];

  await knex(TableName.Alert)
    .where({ resourceType: RESOURCE_TYPE, createdByActorType: "platform" })
    .whereNull("createdByActorId")
    .delete();
  for (let i = 0; i < channelIds.length; i += BATCH_SIZE) {
    await knex(TableName.AlertChannel)
      .whereIn("id", channelIds.slice(i, i + BATCH_SIZE))
      .delete();
  }
}

const config = { transaction: false };
export { config };
