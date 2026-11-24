import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TAgentVaultServices, TAgentVaultServicesInsert } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";

import {
  addOauthRequiredScopes,
  compareAndSwapOauthTokens,
  TOauthTokenColumns
} from "../agent-vault-oauth/agent-vault-oauth-token-dal-fns";
import { AgentVaultCredentialType } from "../agent-vault/agent-vault-enums";

export type TAgentVaultSessionInlineServiceDALFactory = ReturnType<typeof agentVaultSessionInlineServiceDALFactory>;

export const DELETE_SECRETS_BATCH_SIZE = 1000;

type TInlineCustomHeaderRow = { name: string; prefix: string };
type TInlineSubstitutionRow = { placeholder: string; surfaces: string[] };

// An inline service as a session read shows it: never with a sealed value.
export type TAgentVaultInlineServiceRow = Omit<TAgentVaultServices, "encryptedCredential" | "encryptedHookSecret"> & {
  sessionId: string;
  position: number;
  customHeaders: TInlineCustomHeaderRow[];
  substitutions: TInlineSubstitutionRow[];
};

// An inline service as resolve reads it, with every sealed value in list order. NULL once its session ended.
export type TAgentVaultInlineServiceSecretsRow = TAgentVaultServices & {
  sessionId: string;
  position: number;
  customHeaders: (TInlineCustomHeaderRow & { encryptedValue: Buffer | null })[];
  substitutions: (TInlineSubstitutionRow & { encryptedValue: Buffer | null })[];
};

export type TAgentVaultInlineServiceInsert = Omit<TAgentVaultServicesInsert, "sessionId" | "position"> & {
  position: number;
  customHeaders: (TInlineCustomHeaderRow & { encryptedValue: Buffer })[];
  substitutions: (TInlineSubstitutionRow & { encryptedValue: Buffer })[];
};

// OAuth tokens sent with a session, refreshed in place on the inline service's row.
const OAUTH_TOKEN_COLUMNS: TOauthTokenColumns = {
  table: TableName.AgentVaultService,
  secretColumn: "encryptedCredential",
  configColumn: "credentialConfig"
};

export type TAgentVaultInlineOauthTokenRow = Pick<
  TAgentVaultServices,
  | "id"
  | "projectId"
  | "sessionId"
  | "hostPattern"
  | "config"
  | "credentialType"
  | "credentialConfig"
  | "encryptedCredential"
>;

const OAUTH_TOKEN_ROW_COLUMNS = [
  "id",
  "projectId",
  "sessionId",
  "hostPattern",
  "config",
  "credentialType",
  "credentialConfig"
];

const SUMMARY_COLUMNS = [
  "id",
  "projectId",
  "sessionId",
  "position",
  "name",
  "description",
  "type",
  "config",
  "hostPattern",
  "allowedMethods",
  "allowedPathPrefixes",
  "allowedTools",
  "memberProvidedFields",
  "credentialType",
  "credentialConfig",
  "secretsDeletedAt",
  "hookUrl",
  "hookId",
  "hookMethods",
  "hookPaths",
  "hookTools",
  "createdAt",
  "updatedAt"
] as const;

/**
 * Services sent with a session. They are rows of agent_vault_services with sessionId set, so they share every column
 * and child table with a project's own services, and only these functions read or write them.
 */
export const agentVaultSessionInlineServiceDALFactory = (db: TDbClient) => {
  const withTransformations = async <TWithValues extends boolean>(
    conn: Knex,
    services: TAgentVaultServices[],
    withValues: TWithValues
  ) => {
    const serviceIds = services.map((service) => service.id);
    const valueColumn = withValues ? ["encryptedValue"] : [];
    const [headers, substitutions] = serviceIds.length
      ? await Promise.all([
          conn(TableName.AgentVaultServiceCustomHeader)
            .whereIn("serviceId", serviceIds)
            .orderBy("position", "asc")
            .select("serviceId", "name", "prefix", ...valueColumn),
          conn(TableName.AgentVaultServiceSubstitution)
            .whereIn("serviceId", serviceIds)
            .orderBy("position", "asc")
            .select("serviceId", "placeholder", "surfaces", ...valueColumn)
        ])
      : [[], []];
    return services.map((service) => ({
      ...service,
      customHeaders: (headers as { serviceId: string }[])
        .filter((row) => row.serviceId === service.id)
        .map(({ serviceId, ...row }) => row),
      substitutions: (substitutions as { serviceId: string }[])
        .filter((row) => row.serviceId === service.id)
        .map(({ serviceId, ...row }) => row)
    }));
  };

  // Never selects a sealed column, so a read that lists sessions holds no secret.
  const findSummariesBySessionIds = async (sessionIds: string[], tx?: Knex): Promise<TAgentVaultInlineServiceRow[]> => {
    if (!sessionIds.length) return [];
    try {
      const conn = tx || db.replicaNode();
      const services = (await conn(TableName.AgentVaultService)
        .whereIn("sessionId", sessionIds)
        .select(...SUMMARY_COLUMNS)
        .orderBy("position", "asc")) as TAgentVaultServices[];
      return (await withTransformations(conn, services, false)) as TAgentVaultInlineServiceRow[];
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault session inline services" });
    }
  };

  // onPrimary is for a session too new for the replica: its inline services were written with it.
  const findBySessionId = async (
    sessionId: string,
    { onPrimary = false }: { onPrimary?: boolean } = {},
    tx?: Knex
  ): Promise<TAgentVaultInlineServiceSecretsRow[]> => {
    try {
      const conn = tx || (onPrimary ? db : db.replicaNode());
      const services = (await conn(TableName.AgentVaultService)
        .where({ sessionId })
        .orderBy("position", "asc")) as TAgentVaultServices[];
      return (await withTransformations(conn, services, true)) as TAgentVaultInlineServiceSecretsRow[];
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault session inline services for resolve" });
    }
  };

  const insertForSession = async (
    { sessionId, services }: { sessionId: string; services: TAgentVaultInlineServiceInsert[] },
    tx: Knex
  ): Promise<TAgentVaultInlineServiceRow[]> => {
    if (!services.length) return [];
    try {
      const inserted = (await tx(TableName.AgentVaultService)
        .insert(services.map(({ customHeaders, substitutions, ...service }) => ({ ...service, sessionId })))
        .returning(SUMMARY_COLUMNS)) as TAgentVaultServices[];
      const idAt = new Map(inserted.map((row) => [row.position!, row.id]));
      const headerRows = services.flatMap((service) =>
        service.customHeaders.map((header, position) => ({
          ...header,
          position,
          serviceId: idAt.get(service.position)!
        }))
      );
      const substitutionRows = services.flatMap((service) =>
        service.substitutions.map((substitution, position) => ({
          ...substitution,
          position,
          serviceId: idAt.get(service.position)!
        }))
      );
      if (headerRows.length) await tx(TableName.AgentVaultServiceCustomHeader).insert(headerRows);
      if (substitutionRows.length) await tx(TableName.AgentVaultServiceSubstitution).insert(substitutionRows);
      return (await withTransformations(tx, inserted, false)) as TAgentVaultInlineServiceRow[];
    } catch (error) {
      throw new DatabaseError({ error, name: "Create agent vault session inline services" });
    }
  };

  // The credential, the hook's signing secret, custom header values and substitution values together, in one
  // transaction, keeping the names and placeholders for history. Never writes the session row, whose updatedAt dates
  // an ownerless session's last logs.
  const deleteSecretsOf = async (serviceIds: string[], tx: Knex) => {
    if (!serviceIds.length) return;
    await tx(TableName.AgentVaultService)
      .whereIn("id", serviceIds)
      .update({ encryptedCredential: null, encryptedHookSecret: null, secretsDeletedAt: new Date() });
    await tx(TableName.AgentVaultServiceCustomHeader).whereIn("serviceId", serviceIds).update({ encryptedValue: null });
    await tx(TableName.AgentVaultServiceSubstitution).whereIn("serviceId", serviceIds).update({ encryptedValue: null });
  };

  const deleteSecretsBySessionId = async (sessionId: string, tx: Knex) => {
    try {
      const rows = (await tx(TableName.AgentVaultService)
        .where({ sessionId })
        .whereNull("secretsDeletedAt")
        .select("id")) as { id: string }[];
      await deleteSecretsOf(
        rows.map((row) => row.id),
        tx
      );
    } catch (error) {
      throw new DatabaseError({ error, name: "Delete agent vault session inline service secrets" });
    }
  };

  /**
   * Deletes the secrets of every inline service whose session can no longer resolve: revoked, expired, or left without
   * its owner or the user it acts for, matching deriveSessionStatus. In batches, each its own transaction, so no one
   * transaction grows with the number of sessions that ended since the last run.
   */
  const deleteSecretsOfEndedSessions = async () => {
    let deleted = 0;
    try {
      for (;;) {
        // eslint-disable-next-line no-await-in-loop
        const batch = await db.transaction(async (tx) => {
          const rows = (await tx(TableName.AgentVaultService)
            .join(
              TableName.AgentVaultSession,
              `${TableName.AgentVaultSession}.id`,
              `${TableName.AgentVaultService}.sessionId`
            )
            .whereNotNull(`${TableName.AgentVaultService}.sessionId`)
            .whereNull(`${TableName.AgentVaultService}.secretsDeletedAt`)
            .where((ended) => {
              void ended
                .whereNotNull(`${TableName.AgentVaultSession}.revokedAt`)
                .orWhere(`${TableName.AgentVaultSession}.expiresAt`, "<=", tx.fn.now())
                .orWhere((ownerless) => {
                  void ownerless
                    .whereNull(`${TableName.AgentVaultSession}.userId`)
                    .whereNull(`${TableName.AgentVaultSession}.identityId`);
                })
                .orWhere((orphaned) => {
                  void orphaned
                    .whereNotNull(`${TableName.AgentVaultSession}.onBehalfOfUserName`)
                    .whereNull(`${TableName.AgentVaultSession}.onBehalfOfUserId`);
                });
            })
            .limit(DELETE_SECRETS_BATCH_SIZE)
            .forUpdate(TableName.AgentVaultService)
            .skipLocked()
            .select(`${TableName.AgentVaultService}.id`)) as { id: string }[];
          await deleteSecretsOf(
            rows.map((row) => row.id),
            tx
          );
          return rows.length;
        });
        deleted += batch;
        if (batch < DELETE_SECRETS_BATCH_SIZE) break;
      }
    } catch (error) {
      throw new DatabaseError({ error, name: "Delete agent vault inline service secrets of ended sessions" });
    }
    if (deleted) {
      logger.info(`frequent-resource-cleanup: deleted the secrets of ${deleted} agent vault inline services`);
    }
  };

  // Refresh reads the primary, so it never refreshes tokens a write has already replaced. Nothing once the session's
  // secrets are deleted.
  const findOauthTokensByIdPrimary = async (id: string): Promise<TAgentVaultInlineOauthTokenRow | undefined> => {
    try {
      return (await db(TableName.AgentVaultService)
        .where({ id, credentialType: AgentVaultCredentialType.OAuth })
        .whereNotNull("sessionId")
        .whereNull("secretsDeletedAt")
        .whereNotNull("encryptedCredential")
        .first(...OAUTH_TOKEN_ROW_COLUMNS, "encryptedCredential")) as TAgentVaultInlineOauthTokenRow | undefined;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault inline service OAuth tokens" });
    }
  };

  // See compareAndSwapOauthTokens. Deleting the session's secrets clears the tokens it compares against, so a refresh
  // that finishes after the session ended writes nothing; the secretsDeletedAt guard says so outright.
  const compareAndSwapOauthTokensOf = async ({
    id,
    expectedEncryptedCredential,
    encryptedCredential,
    credentialConfigPatch,
    keepAdditionalScopesStatus
  }: {
    id: string;
    expectedEncryptedCredential: Buffer;
    encryptedCredential?: Buffer;
    credentialConfigPatch: Record<string, unknown>;
    keepAdditionalScopesStatus?: boolean;
  }) => {
    try {
      return await compareAndSwapOauthTokens<Omit<TAgentVaultInlineOauthTokenRow, "encryptedCredential">>(
        db,
        OAUTH_TOKEN_COLUMNS,
        {
          where: { id, credentialType: AgentVaultCredentialType.OAuth, secretsDeletedAt: null },
          expectedSecret: expectedEncryptedCredential,
          secret: encryptedCredential,
          configPatch: credentialConfigPatch,
          keepAdditionalScopesStatus,
          returning: OAUTH_TOKEN_ROW_COLUMNS
        }
      );
    } catch (error) {
      throw new DatabaseError({ error, name: "Update agent vault inline service OAuth tokens" });
    }
  };

  const addOauthRequiredScopesOf = async ({
    id,
    expectedEncryptedCredential,
    rejectedTokenHash,
    requiredScopes
  }: {
    id: string;
    expectedEncryptedCredential: Buffer;
    rejectedTokenHash: string;
    requiredScopes: string[];
  }) => {
    try {
      return await addOauthRequiredScopes<Pick<TAgentVaultServices, "id">>(db, OAUTH_TOKEN_COLUMNS, {
        where: { id, credentialType: AgentVaultCredentialType.OAuth, secretsDeletedAt: null },
        expectedSecret: expectedEncryptedCredential,
        rejectedTokenHash,
        requiredScopes,
        returning: ["id"]
      });
    } catch (error) {
      throw new DatabaseError({ error, name: "Add agent vault inline service required scopes" });
    }
  };

  return {
    findSummariesBySessionIds,
    findBySessionId,
    findOauthTokensByIdPrimary,
    compareAndSwapOauthTokens: compareAndSwapOauthTokensOf,
    addOauthRequiredScopes: addOauthRequiredScopesOf,
    insertForSession,
    deleteSecretsBySessionId,
    deleteSecretsOfEndedSessions
  };
};
