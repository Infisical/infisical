import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TAgentVaultServices } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

import { MAX_OAUTH_SCOPES } from "../agent-vault-oauth/agent-vault-oauth-discovery-fns";
import { AgentVaultCredentialType, AgentVaultOauthStatus } from "../agent-vault/agent-vault-enums";

export type TAgentVaultServiceDALFactory = ReturnType<typeof agentVaultServiceDALFactory>;

export const agentVaultServiceDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.AgentVaultService);

  const findByAccessBundleId = async (accessBundleId: string, tx?: Knex): Promise<TAgentVaultServices[]> => {
    try {
      return (await (tx || db.replicaNode())(TableName.AgentVaultService)
        .where({ accessBundleId })
        .orderBy("name", "asc")) as TAgentVaultServices[];
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault services" });
    }
  };

  // In id order, so two transactions locking the same services queue for them the same way.
  const lockByAccessBundleId = async (accessBundleId: string, tx: Knex): Promise<{ id: string }[]> => {
    try {
      return (await tx(TableName.AgentVaultService)
        .where({ accessBundleId })
        .orderBy("id", "asc")
        .forUpdate()
        .select("id")) as { id: string }[];
    } catch (error) {
      throw new DatabaseError({ error, name: "Lock agent vault services" });
    }
  };

  // Reads the primary even without a tx, so the row is never older than the last committed save.
  const findByIdInAccessBundle = async (
    { id, accessBundleId }: { id: string; accessBundleId: string },
    tx?: Knex
  ): Promise<TAgentVaultServices | undefined> => {
    try {
      return await (tx || db)(TableName.AgentVaultService).where({ id, accessBundleId }).first();
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault service" });
    }
  };

  // A scope report or token refresh is a single UPDATE that only checks the sealed credential, so a save that read
  // the row without this lock could write over one that committed in between.
  const lockByIdInAccessBundle = async (
    { id, accessBundleId }: { id: string; accessBundleId: string },
    tx: Knex
  ): Promise<TAgentVaultServices | undefined> => {
    try {
      return await tx(TableName.AgentVaultService).where({ id, accessBundleId }).forUpdate().first();
    } catch (error) {
      throw new DatabaseError({ error, name: "Lock agent vault service" });
    }
  };

  const findByIdPrimary = async (id: string, tx?: Knex): Promise<TAgentVaultServices | undefined> => {
    try {
      return await (tx || db)(TableName.AgentVaultService).where({ id }).first();
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault service" });
    }
  };

  // A refresh writes only if the sealed credential is still the one it read, so an admin reauthorizing in
  // between keeps the newer tokens. The config is a jsonb merge, so it only touches the keys it names.
  // `keepAdditionalScopesStatus` is decided against the row being written, not the one the caller read: a scope report
  // leaves the sealed credential alone, so it passes the compare, and its status must not be overwritten.
  const compareAndSwapCredential = async (
    {
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
    },
    tx?: Knex
  ): Promise<Pick<TAgentVaultServices, "id" | "hostPattern" | "config" | "credentialConfig"> | undefined> => {
    try {
      const patch = JSON.stringify(credentialConfigPatch);
      const credentialConfig = keepAdditionalScopesStatus
        ? db.raw(
            `CASE WHEN "credentialConfig"->>'status' = ? THEN COALESCE("credentialConfig", '{}'::jsonb) || (?::jsonb - 'status') ELSE COALESCE("credentialConfig", '{}'::jsonb) || ?::jsonb END`,
            [AgentVaultOauthStatus.NeedsAdditionalScopes, patch, patch]
          )
        : db.raw(`COALESCE("credentialConfig", '{}'::jsonb) || ?::jsonb`, [patch]);
      const [row] = await (tx || db)(TableName.AgentVaultService)
        .where({ id, encryptedCredential: expectedEncryptedCredential })
        .update({
          ...(encryptedCredential ? { encryptedCredential } : {}),
          credentialConfig
        })
        .returning(["id", "hostPattern", "config", "credentialConfig"]);
      return row as Pick<TAgentVaultServices, "id" | "hostPattern" | "config" | "credentialConfig"> | undefined;
    } catch (error) {
      throw new DatabaseError({ error, name: "Update agent vault service credential" });
    }
  };

  // The union is taken in the UPDATE, against the row being written: two reports for the same token both pass a
  // compare on the sealed credential, so a union computed from what each one read would let the last erase the other.
  // Servers usually list every scope a call needs, so scopes already granted are skipped, and a report naming only
  // those writes nothing. The list stops growing at MAX_OAUTH_SCOPES, since this row is read on every resolve.
  const addRequiredScopes = async (
    {
      id,
      expectedEncryptedCredential,
      rejectedTokenHash,
      requiredScopes
    }: { id: string; expectedEncryptedCredential: Buffer; rejectedTokenHash: string; requiredScopes: string[] },
    tx?: Knex
  ): Promise<Pick<TAgentVaultServices, "id" | "hostPattern" | "config" | "credentialConfig"> | undefined> => {
    try {
      const stored = `COALESCE("credentialConfig"->'requiredScopes', '[]'::jsonb)`;
      const granted = `COALESCE("credentialConfig"->'grantedScopes', '[]'::jsonb)`;
      const reported = JSON.stringify([...new Set(requiredScopes)]);
      const [row] = await (tx || db)(TableName.AgentVaultService)
        .where({ id, encryptedCredential: expectedEncryptedCredential, credentialType: AgentVaultCredentialType.OAuth })
        .whereRaw(`"credentialConfig"->>'accessTokenHash' = ?`, [rejectedTokenHash])
        .whereRaw(`"credentialConfig"->>'status' IS DISTINCT FROM ?`, [AgentVaultOauthStatus.NeedsReauthorization])
        .whereRaw(
          `EXISTS (SELECT 1 FROM jsonb_array_elements_text(?::jsonb) AS reported(scope) WHERE NOT ${granted} @> jsonb_build_array(reported.scope))`,
          [reported]
        )
        .update({
          credentialConfig: db.raw(
            `COALESCE("credentialConfig", '{}'::jsonb) || jsonb_build_object('status', ?::text, 'requiredScopes', ${stored} || COALESCE((SELECT jsonb_agg(added.scope ORDER BY added.ord) FROM (SELECT reported.scope, reported.ord, row_number() OVER (ORDER BY reported.ord) AS position FROM jsonb_array_elements_text(?::jsonb) WITH ORDINALITY AS reported(scope, ord) WHERE NOT ${stored} @> jsonb_build_array(reported.scope) AND NOT ${granted} @> jsonb_build_array(reported.scope)) AS added WHERE added.position <= ?::int - jsonb_array_length(${stored})), '[]'::jsonb))`,
            [AgentVaultOauthStatus.NeedsAdditionalScopes, reported, MAX_OAUTH_SCOPES]
          )
        })
        .returning(["id", "hostPattern", "config", "credentialConfig"]);
      return row as Pick<TAgentVaultServices, "id" | "hostPattern" | "config" | "credentialConfig"> | undefined;
    } catch (error) {
      throw new DatabaseError({ error, name: "Add agent vault service required scopes" });
    }
  };

  // Reads the primary even without a tx, like findByIdInAccessBundle.
  const findByIdInProject = async (
    { id, projectId }: { id: string; projectId: string },
    tx?: Knex
  ): Promise<(TAgentVaultServices & { accessBundleName: string }) | undefined> => {
    try {
      return (await (tx || db)(TableName.AgentVaultService)
        .join(
          TableName.AgentVaultAccessBundle,
          `${TableName.AgentVaultService}.accessBundleId`,
          `${TableName.AgentVaultAccessBundle}.id`
        )
        .where(`${TableName.AgentVaultService}.id`, id)
        .where(`${TableName.AgentVaultAccessBundle}.projectId`, projectId)
        .first(
          `${TableName.AgentVaultService}.*`,
          db.ref("name").withSchema(TableName.AgentVaultAccessBundle).as("accessBundleName")
        )) as (TAgentVaultServices & { accessBundleName: string }) | undefined;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault service in project" });
    }
  };

  // A personal values save holds this until it commits. A service update writes the row, so it waits for the
  // save, and a save that starts after the update reads the fields the update left.
  const lockForPersonalValues = async (
    id: string,
    tx: Knex
  ): Promise<Pick<TAgentVaultServices, "id" | "credentialType" | "memberProvidedFields"> | undefined> => {
    try {
      return (await tx(TableName.AgentVaultService)
        .where({ id })
        .forShare()
        .first("id", "credentialType", "memberProvidedFields")) as
        | Pick<TAgentVaultServices, "id" | "credentialType" | "memberProvidedFields">
        | undefined;
    } catch (error) {
      throw new DatabaseError({ error, name: "Lock agent vault service for personal values" });
    }
  };

  return {
    ...orm,
    findByAccessBundleId,
    lockByAccessBundleId,
    findByIdInAccessBundle,
    lockByIdInAccessBundle,
    findByIdPrimary,
    findByIdInProject,
    lockForPersonalValues,
    compareAndSwapCredential,
    addRequiredScopes
  };
};
