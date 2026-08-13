import { Knex } from "knex";

import { initLogger, logger } from "@app/lib/logger";

import { AccessScope, TableName } from "../schemas";

// Inlined rather than imported from identity-credential-alert-provider: a migration has to keep
// meaning the same thing if that constant is ever renamed.
const IDENTITY_AUTHENTICATION_RESOURCE_TYPE = "identity.authentication";
const BATCH_SIZE = 500;

// alerts."resourceId" is a plain varchar with no FK (a provider's resourceType can point at any
// table), so deleting an identity never cascaded to its alerts. Until the reap was wired into every
// identity delete and detach path, three leaks accumulated:
//
//   1. the identity row is gone and the alert survives, matching no targets and linking to a 404
//   2. the identity left the alert's org or project, so the engine's join can never match it again
//   3. the alert's channel outlives it: alert_channel_memberships cascades when an alert is deleted,
//      alert_channels does not, leaving an encrypted config nothing references
//
// Both alert sweeps below leave their channels behind by design; the channel sweep collects them.
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.Alert))) return;

  initLogger();

  const identityAlerts = () =>
    knex(TableName.Alert)
      .where(`${TableName.Alert}.resourceType`, IDENTITY_AUTHENTICATION_RESOURCE_TYPE)
      .whereNotNull(`${TableName.Alert}.resourceId`);

  // The cast is on the identity side: "resourceId" is varchar and identities.id is uuid, so casting
  // the varchar would throw on a non-uuid value instead of reaping the row it belongs to.
  const identityExists = (qb: Knex.QueryBuilder) => {
    void qb
      .select(knex.raw("1"))
      .from(TableName.Identity)
      .whereRaw(`"${TableName.Identity}"."id"::text = "${TableName.Alert}"."resourceId"`);
  };

  const membershipInScope = (qb: Knex.QueryBuilder, scope: AccessScope) => {
    void qb
      .select(knex.raw("1"))
      .from(TableName.Membership)
      .where(`${TableName.Membership}.scope`, scope)
      .whereRaw(`"${TableName.Membership}"."actorIdentityId"::text = "${TableName.Alert}"."resourceId"`);
  };

  // 1. Identity row is gone. Unscoped on purpose: the same identity can be watched from another org
  // (a root-org identity invited into a child org), and those rows are orphaned too.
  const deletedIdentityAlerts = (await identityAlerts()
    .whereNotExists(identityExists)
    .select(`${TableName.Alert}.id`)) as { id: string }[];

  // 2. Identity still exists but no longer holds the membership the alert's scope needs. This mirrors
  // the engine's own join (findExpiringUaClientSecrets): an org-scope membership in alerts."orgId" is
  // required for every alert, plus a project-scope membership in alerts."projectId" when the alert is
  // project-scoped. Without both, findDueTargets can never match the identity again. Requiring the
  // identity to exist keeps this set disjoint from sweep 1, so the two counts don't double-report.
  const outOfScopeAlerts = (await identityAlerts()
    .whereExists(identityExists)
    .where((scopeQb) => {
      void scopeQb
        .whereNotExists((orgQb) => {
          membershipInScope(orgQb, AccessScope.Organization);
          void orgQb.whereRaw(`"${TableName.Membership}"."scopeOrgId" = "${TableName.Alert}"."orgId"`);
        })
        .orWhere((projectQb) => {
          void projectQb.whereNotNull(`${TableName.Alert}.projectId`).whereNotExists((memberQb) => {
            membershipInScope(memberQb, AccessScope.Project);
            void memberQb.whereRaw(`"${TableName.Membership}"."scopeProjectId" = "${TableName.Alert}"."projectId"`);
          });
        });
    })
    .select(`${TableName.Alert}.id`)) as { id: string }[];

  const alertIds = [...deletedIdentityAlerts, ...outOfScopeAlerts].map((alert) => alert.id);
  for (let i = 0; i < alertIds.length; i += BATCH_SIZE) {
    // eslint-disable-next-line no-await-in-loop -- one connection; bounded batches keep locks short
    await knex(TableName.Alert)
      .whereIn("id", alertIds.slice(i, i + BATCH_SIZE))
      .delete();
  }

  // 3. Channels with no membership row. Channels are only ever created inline by their owning alert
  // (there is no standalone channel API), so a membership-less channel cannot be a user's deliberate
  // creation: it is always a leftover, including the ones the two sweeps above just detached. Safe to
  // run against live traffic, since createAlert writes the channel and its membership in one
  // transaction, so a concurrent create is never half-visible here.
  let orphanedChannelCount = 0;
  if (await knex.schema.hasTable(TableName.AlertChannel)) {
    const orphanedChannels = (await knex(TableName.AlertChannel)
      .whereNotExists((qb) => {
        void qb
          .select(knex.raw("1"))
          .from(TableName.AlertChannelMembership)
          .whereRaw(`"${TableName.AlertChannelMembership}"."channelId" = "${TableName.AlertChannel}"."id"`);
      })
      .select(`${TableName.AlertChannel}.id`)) as { id: string }[];

    orphanedChannelCount = orphanedChannels.length;
    for (let i = 0; i < orphanedChannels.length; i += BATCH_SIZE) {
      // eslint-disable-next-line no-await-in-loop -- one connection; bounded batches keep locks short
      await knex(TableName.AlertChannel)
        .whereIn(
          "id",
          orphanedChannels.slice(i, i + BATCH_SIZE).map((channel) => channel.id)
        )
        .delete();
    }
  }

  if (alertIds.length || orphanedChannelCount) {
    logger.info(
      `Reaped orphaned identity alerts [deletedIdentity=${deletedIdentityAlerts.length}] [outOfScope=${outOfScopeAlerts.length}] [orphanedChannels=${orphanedChannelCount}]`
    );
  }
}

export async function down(): Promise<void> {
  // Deleted alerts and channels cannot be reconstructed (channel configs were encrypted with the
  // org/project data key and are gone with the row), so down is a no-op.
}
