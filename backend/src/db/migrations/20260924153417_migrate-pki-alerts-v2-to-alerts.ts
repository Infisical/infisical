/* eslint-disable no-await-in-loop */
import { Knex } from "knex";
import RE2 from "re2";

import { inMemoryKeyStore } from "@app/keystore/memory";
import { initLogger, logger } from "@app/lib/logger";
import { kmsRootConfigDALFactory } from "@app/services/kms/kms-root-config-dal";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { superAdminDALFactory } from "@app/services/super-admin/super-admin-dal";

import { AccessScope, OrgMembershipStatus, TableName, TAlertChannelsInsert, TAlertsInsert } from "../schemas";
import { getMigrationEnvConfig, getMigrationHsmConfig } from "./utils/env-config";
import { getMigrationEncryptionServices, getMigrationHsmService } from "./utils/services";

const RESOURCE_TYPE = "cert-manager.application";
const EXPIRATION_EVENT = "expiration";
const EVENT_BY_LEGACY_EVENT: Record<string, string> = {
  expiration: "cert-manager.application.certificate.expiry",
  issuance: "cert-manager.application.certificate.issuance",
  renewal: "cert-manager.application.certificate.renewal",
  revocation: "cert-manager.application.certificate.revocation"
};
const MAX_ALERT_BEFORE_DAYS = 365;
const HISTORY_LOOKBACK_DAYS = 30;
const INSERT_BATCH_SIZE = 500;
const DAYS_PER_UNIT: Record<string, number> = { d: 1, w: 7, m: 30, y: 365 };
const CHANNEL_NAMES: Record<string, string> = {
  email: "Email",
  slack: "Slack",
  webhook: "Webhook",
  pagerduty: "PagerDuty"
};

type TLegacyFilter = { field: string; operator: string; value: unknown };

const toAlertBefore = (alertBefore: string | null | undefined): string => {
  const match = new RE2("^(\\d{1,4})([dwmy])$").exec(alertBefore ?? "");
  if (!match) return "30d";
  const days = parseInt(match[1], 10) * DAYS_PER_UNIT[match[2]];
  if (days < 1) return "1d";
  if (days > MAX_ALERT_BEFORE_DAYS) return `${MAX_ALERT_BEFORE_DAYS}d`;
  return alertBefore as string;
};

const createUniqueScopeIndex = (knex: Knex, where = "") =>
  knex.schema.raw(
    `CREATE UNIQUE INDEX "alert_unique_scope_resource_event" ON "${TableName.Alert}"
     ("orgId", (COALESCE("projectId", '')), "resourceType", (COALESCE("resourceId", '')), "eventType") ${where}`
  );

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.AlertHistory, "error"))) {
    await knex.schema.alterTable(TableName.AlertHistory, (t) => {
      t.string("error", 1000).nullable();
    });
  }

  await knex.schema.raw(`DROP INDEX IF EXISTS "alert_unique_scope_resource_event"`);
  await createUniqueScopeIndex(knex, `WHERE "resourceType" <> '${RESOURCE_TYPE}'`);
  await knex.schema.alterTable(TableName.Alert, (t) => {
    t.index("orgId");
  });

  if (!(await knex.schema.hasTable(TableName.PkiAlertsV2))) return;

  const legacyAlerts = await knex(TableName.PkiAlertsV2)
    .join(TableName.Project, `${TableName.PkiAlertsV2}.projectId`, `${TableName.Project}.id`)
    .whereNotNull(`${TableName.PkiAlertsV2}.applicationId`)
    .select(`${TableName.PkiAlertsV2}.*`, `${TableName.Project}.orgId`);
  if (!legacyAlerts.length) return;

  initLogger();
  const { hsmService } = await getMigrationHsmService({ envConfig: getMigrationHsmConfig() });
  const envConfig = await getMigrationEnvConfig(superAdminDALFactory(knex), hsmService, kmsRootConfigDALFactory(knex));
  const { kmsService } = await getMigrationEncryptionServices({
    envConfig,
    keyStore: inMemoryKeyStore(),
    db: knex,
    skipHsmLicenseCheck: true
  });

  const cipherByProjectId = new Map<string, Awaited<ReturnType<typeof kmsService.createCipherPairWithDataKey>>>();
  for (const legacyAlert of legacyAlerts) {
    let cipher = cipherByProjectId.get(legacyAlert.projectId);
    if (!cipher) {
      cipher = await kmsService.createCipherPairWithDataKey(
        { type: KmsDataKey.SecretManager, projectId: legacyAlert.projectId },
        knex
      );
      cipherByProjectId.set(legacyAlert.projectId, cipher);
    }
    const { encryptor, decryptor } = cipher;
    const encrypt = (config: unknown) => encryptor({ plainText: Buffer.from(JSON.stringify(config)) }).cipherTextBlob;
    const actor = { createdByActorId: legacyAlert.orgId, createdByActorType: "platform" };
    const scope = { orgId: legacyAlert.orgId, projectId: legacyAlert.projectId };

    const hasLegacyFilters = ((legacyAlert.filters ?? []) as TLegacyFilter[]).some(
      (filter) =>
        filter.field !== "include_cas" &&
        [filter.value].flat().some((value) => typeof value === "string" && value.trim().length > 0)
    );
    if (hasLegacyFilters) {
      logger.warn(
        `Migration dropped the certificate filters of application alert '${legacyAlert.name}'; application alerts now cover every certificate in the application [pkiAlertId=${legacyAlert.id}]`
      );
    }

    const isExpiration = legacyAlert.eventType === EXPIRATION_EVENT;
    const legacyNotificationConfig = legacyAlert.notificationConfig as { enableDailyNotification?: boolean } | null;
    const alertBefore = isExpiration ? toAlertBefore(legacyAlert.alertBefore) : null;
    if (alertBefore && alertBefore !== legacyAlert.alertBefore) {
      logger.warn(
        `Migration changed the lead time of application alert '${legacyAlert.name}' from '${legacyAlert.alertBefore}' to '${alertBefore}' [pkiAlertId=${legacyAlert.id}]`
      );
    }
    const condition = alertBefore
      ? {
          alertBefore,
          ...(legacyNotificationConfig
            ? { dailyReminder: Boolean(legacyNotificationConfig.enableDailyNotification) }
            : {})
        }
      : null;

    const [alert] = await knex(TableName.Alert)
      .insert({
        ...scope,
        ...actor,
        id: legacyAlert.id,
        name: legacyAlert.name,
        description: legacyAlert.description,
        resourceType: RESOURCE_TYPE,
        resourceId: legacyAlert.applicationId,
        eventType: EVENT_BY_LEGACY_EVENT[legacyAlert.eventType],
        triggerType: isExpiration ? "scheduled" : "event",
        condition: condition ? JSON.stringify(condition) : null,
        enabled: legacyAlert.enabled ?? true,
        createdAt: legacyAlert.createdAt,
        updatedAt: legacyAlert.updatedAt
      } as TAlertsInsert)
      .returning("id");

    const legacyChannels = await knex(TableName.PkiAlertChannels).where({ alertId: legacyAlert.id });
    const migratedChannels: { id: string; channelType: string }[] = [];
    const takenChannelNames = new Set<string>();

    for (const legacyChannel of legacyChannels) {
      const config = (
        legacyChannel.encryptedConfig
          ? JSON.parse(decryptor({ cipherTextBlob: legacyChannel.encryptedConfig }).toString())
          : legacyChannel.config
      ) as Record<string, unknown> | null;

      let recipients: { principalType: string; principalId: string }[] = [];
      if (legacyChannel.channelType === "email") {
        const emails = [...new Set(((config?.recipients ?? []) as string[]).map((email) => email.toLowerCase()))];
        const users = await knex(TableName.Users)
          .join(TableName.Membership, `${TableName.Users}.id`, `${TableName.Membership}.actorUserId`)
          .where(`${TableName.Membership}.scope`, AccessScope.Organization)
          .where(`${TableName.Membership}.scopeOrgId`, legacyAlert.orgId)
          .where(`${TableName.Membership}.isActive`, true)
          .where(`${TableName.Membership}.status`, OrgMembershipStatus.Accepted)
          .whereRaw(`lower(??) = ANY(?)`, [`${TableName.Users}.email`, emails])
          .where((qb) => {
            void qb
              .whereExists((sub) => {
                void sub
                  .select(knex.raw("1"))
                  .from({ projectMembership: TableName.Membership })
                  .where("projectMembership.scope", AccessScope.Project)
                  .where("projectMembership.scopeProjectId", legacyAlert.projectId)
                  .whereRaw(`"projectMembership"."actorUserId" = ??`, [`${TableName.Users}.id`]);
              })
              .orWhereExists((sub) => {
                void sub
                  .select(knex.raw("1"))
                  .from({ groupMembership: TableName.Membership })
                  .join(
                    TableName.UserGroupMembership,
                    `${TableName.UserGroupMembership}.groupId`,
                    "groupMembership.actorGroupId"
                  )
                  .where("groupMembership.scope", AccessScope.Project)
                  .where("groupMembership.scopeProjectId", legacyAlert.projectId)
                  .whereRaw(`??."userId" = ??`, [TableName.UserGroupMembership, `${TableName.Users}.id`]);
              });
          })
          .distinct(`${TableName.Users}.id`, `${TableName.Users}.email`);
        const memberEmails = new Set(users.map((user) => String(user.email).toLowerCase()));
        recipients = [
          ...users.map((user) => ({ principalType: "user", principalId: String(user.id) })),
          ...emails
            .filter((email) => email && !memberEmails.has(email))
            .map((email) => ({ principalType: "email", principalId: email }))
        ];
        if (!recipients.length) continue;
      }

      const baseName = CHANNEL_NAMES[legacyChannel.channelType] ?? legacyChannel.channelType;
      let channelName = baseName;
      for (let suffix = 2; takenChannelNames.has(channelName); suffix += 1) channelName = `${baseName} ${suffix}`;
      takenChannelNames.add(channelName);

      const [channel] = await knex(TableName.AlertChannel)
        .insert({
          ...scope,
          ...actor,
          id: legacyChannel.id,
          name: channelName,
          channelType: legacyChannel.channelType,
          encryptedConfig: encrypt(legacyChannel.channelType === "email" ? {} : config),
          enabled: legacyChannel.enabled ?? true,
          createdAt: legacyChannel.createdAt,
          updatedAt: legacyChannel.updatedAt
        } as TAlertChannelsInsert)
        .returning("id");

      await knex(TableName.AlertChannelMembership).insert({ alertId: alert.id, channelId: channel.id });
      migratedChannels.push({ id: channel.id, channelType: legacyChannel.channelType });
      if (recipients.length) {
        await knex(TableName.AlertChannelRecipient).insert(
          recipients.map((recipient) => ({ channelId: channel.id, ...recipient }))
        );
      }
    }

    if (!migratedChannels.length && (legacyAlert.enabled ?? true)) {
      await knex(TableName.Alert).where({ id: alert.id }).update({ enabled: false });
      logger.warn(
        `Migration disabled alert '${legacyAlert.name}' because none of its channels could be migrated [pkiAlertId=${legacyAlert.id}]`
      );
    }

    if (migratedChannels.length) {
      const history = await knex(TableName.PkiAlertHistory)
        .where({ alertId: legacyAlert.id, hasNotificationSent: true })
        .whereRaw(`"triggeredAt" > now() - ?::interval`, [`${HISTORY_LOOKBACK_DAYS} days`])
        .select("id", "triggeredAt", "notificationError");

      if (history.length) {
        const failedTypesByHistoryId = new Map(
          history.map((row) => [
            row.id,
            new Set(
              String(row.notificationError ?? "")
                .split("\n")
                .map((line) => line.split(":")[0].trim())
                .filter((channelType) => CHANNEL_NAMES[channelType])
            )
          ])
        );
        const toHistoryStatus = (failedTypes: Set<string>) => {
          const failedCount = migratedChannels.filter((channel) => failedTypes.has(channel.channelType)).length;
          if (!failedCount) return "success";
          return failedCount === migratedChannels.length ? "failed" : "partial";
        };

        await knex.batchInsert(
          TableName.AlertHistory,
          history.map((row) => ({
            id: row.id,
            alertId: alert.id,
            triggeredAt: row.triggeredAt,
            status: toHistoryStatus(failedTypesByHistoryId.get(row.id) as Set<string>),
            error: row.notificationError ? String(row.notificationError).slice(0, 1000) : null
          })),
          INSERT_BATCH_SIZE
        );

        const alertedCertificates = await knex(TableName.PkiAlertHistoryCertificate)
          .whereRaw(`?? = ANY(?::uuid[])`, ["alertHistoryId", history.map((row) => row.id)])
          .select("alertHistoryId", "certificateId");

        await knex.batchInsert(
          TableName.AlertHistoryTarget,
          alertedCertificates.flatMap((row) =>
            migratedChannels.map((channel) => ({
              alertHistoryId: row.alertHistoryId,
              targetId: row.certificateId,
              channelId: channel.id,
              channelType: channel.channelType,
              status: failedTypesByHistoryId.get(row.alertHistoryId)?.has(channel.channelType) ? "failed" : "success"
            }))
          ),
          INSERT_BATCH_SIZE
        );
      }
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.PkiAlertsV2)) {
    const migratedAlertIds = knex(TableName.PkiAlertsV2).whereNotNull("applicationId").select("id");
    const migratedChannelIds = await knex(TableName.AlertChannelMembership)
      .whereIn("alertId", migratedAlertIds)
      .whereIn("channelId", knex(TableName.PkiAlertChannels).select("id"))
      .pluck("channelId");

    await knex(TableName.Alert).where({ resourceType: RESOURCE_TYPE }).whereIn("id", migratedAlertIds).delete();
    if (migratedChannelIds.length) await knex(TableName.AlertChannel).whereIn("id", migratedChannelIds).delete();
  }

  await knex.schema.alterTable(TableName.Alert, (t) => {
    t.dropIndex("orgId");
  });

  const duplicate = await knex(TableName.Alert)
    .where({ resourceType: RESOURCE_TYPE })
    .groupByRaw(`"orgId", COALESCE("projectId", ''), COALESCE("resourceId", ''), "eventType"`)
    .havingRaw("count(*) > 1")
    .first(knex.raw("1"));
  if (duplicate) {
    initLogger();
    logger.warn(
      "Kept the partial alert_unique_scope_resource_event index because application alerts created after the migration share a scope and event"
    );
  } else {
    await knex.schema.raw(`DROP INDEX IF EXISTS "alert_unique_scope_resource_event"`);
    await createUniqueScopeIndex(knex);
  }

  if (await knex.schema.hasColumn(TableName.AlertHistory, "error")) {
    await knex.schema.alterTable(TableName.AlertHistory, (t) => {
      t.dropColumn("error");
    });
  }
}
