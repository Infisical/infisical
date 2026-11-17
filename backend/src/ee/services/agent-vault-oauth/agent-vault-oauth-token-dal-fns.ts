import { Knex } from "knex";

import { TDbClient } from "@app/db";

import { AgentVaultOauthStatus } from "../agent-vault/agent-vault-enums";
import { MAX_OAUTH_SCOPES } from "./agent-vault-oauth-discovery-fns";

// Where a set of OAuth tokens lives: a service row (its sealed credential and credentialConfig) or a member's personal
// value row (its encryptedValue and oauthConfig). Refresh and scope reports run the same SQL against either.
export type TOauthTokenColumns = { table: string; secretColumn: string; configColumn: string };

/**
 * A refresh writes only if the sealed tokens are still the ones it read, so a reauthorization in between keeps the
 * newer tokens. The config is a jsonb merge, so it only touches the keys it names. `keepAdditionalScopesStatus` is
 * decided against the row being written, not the one the caller read: a scope report leaves the sealed tokens alone,
 * so it passes the compare, and its status must not be overwritten.
 */
export const compareAndSwapOauthTokens = async <TRow>(
  db: TDbClient,
  { table, secretColumn, configColumn }: TOauthTokenColumns,
  {
    where,
    expectedSecret,
    secret,
    configPatch,
    keepAdditionalScopesStatus,
    returning
  }: {
    where: Record<string, unknown>;
    expectedSecret: Buffer;
    secret?: Buffer;
    configPatch: Record<string, unknown>;
    keepAdditionalScopesStatus?: boolean;
    returning: string[];
  },
  tx?: Knex
): Promise<TRow | undefined> => {
  const patch = JSON.stringify(configPatch);
  const config = keepAdditionalScopesStatus
    ? db.raw(
        `CASE WHEN ??->>'status' = ? THEN COALESCE(??, '{}'::jsonb) || (?::jsonb - 'status') ELSE COALESCE(??, '{}'::jsonb) || ?::jsonb END`,
        [configColumn, AgentVaultOauthStatus.NeedsAdditionalScopes, configColumn, patch, configColumn, patch]
      )
    : db.raw(`COALESCE(??, '{}'::jsonb) || ?::jsonb`, [configColumn, patch]);
  const rows = (await (tx || db)(table)
    .where({ ...where, [secretColumn]: expectedSecret })
    .update({ ...(secret ? { [secretColumn]: secret } : {}), [configColumn]: config })
    .returning(returning)) as TRow[];
  return rows[0];
};

/**
 * The union is taken in the UPDATE, against the row being written: two reports for the same token both pass a compare
 * on the sealed tokens, so a union computed from what each one read would let the last erase the other. Servers
 * usually list every scope a call needs, so scopes already granted are skipped, and a report naming only those writes
 * nothing. The list stops growing at MAX_OAUTH_SCOPES, since this row is read on every resolve.
 */
export const addOauthRequiredScopes = async <TRow>(
  db: TDbClient,
  { table, secretColumn, configColumn }: TOauthTokenColumns,
  {
    where,
    expectedSecret,
    rejectedTokenHash,
    requiredScopes,
    returning
  }: {
    where: Record<string, unknown>;
    expectedSecret: Buffer;
    rejectedTokenHash: string;
    requiredScopes: string[];
    returning: string[];
  },
  tx?: Knex
): Promise<TRow | undefined> => {
  const column = `"${configColumn}"`;
  const stored = `COALESCE(${column}->'requiredScopes', '[]'::jsonb)`;
  const granted = `COALESCE(${column}->'grantedScopes', '[]'::jsonb)`;
  const reported = JSON.stringify([...new Set(requiredScopes)]);
  const rows = (await (tx || db)(table)
    .where({ ...where, [secretColumn]: expectedSecret })
    .whereRaw(`${column}->>'accessTokenHash' = ?`, [rejectedTokenHash])
    .whereRaw(`${column}->>'status' IS DISTINCT FROM ?`, [AgentVaultOauthStatus.NeedsReauthorization])
    .whereRaw(
      `EXISTS (SELECT 1 FROM jsonb_array_elements_text(?::jsonb) AS reported(scope) WHERE NOT ${granted} @> jsonb_build_array(reported.scope))`,
      [reported]
    )
    .update({
      [configColumn]: db.raw(
        `COALESCE(${column}, '{}'::jsonb) || jsonb_build_object('status', ?::text, 'requiredScopes', ${stored} || COALESCE((SELECT jsonb_agg(added.scope ORDER BY added.ord) FROM (SELECT reported.scope, reported.ord, row_number() OVER (ORDER BY reported.ord) AS position FROM jsonb_array_elements_text(?::jsonb) WITH ORDINALITY AS reported(scope, ord) WHERE NOT ${stored} @> jsonb_build_array(reported.scope) AND NOT ${granted} @> jsonb_build_array(reported.scope)) AS added WHERE added.position <= ?::int - jsonb_array_length(${stored})), '[]'::jsonb))`,
        [AgentVaultOauthStatus.NeedsAdditionalScopes, reported, MAX_OAUTH_SCOPES]
      )
    })
    .returning(returning)) as TRow[];
  return rows[0];
};
