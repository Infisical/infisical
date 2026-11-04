import { Knex } from "knex";

import { ForbiddenRequestError } from "@app/lib/errors";
import { TGenericPermission } from "@app/lib/types";
import { ActorType } from "@app/services/auth/auth-type";

// A personal variable or a personal value belongs to exactly one user or machine identity, the actor a session names.
export type TAgentVaultOwner = { userId: string; identityId?: never } | { identityId: string; userId?: never };

// Null for any other actor, which keeps no values of its own.
export const ownerOrNullOf = (ctx: TGenericPermission): TAgentVaultOwner | null => {
  if (ctx.actor === ActorType.USER) return { userId: ctx.actorId };
  if (ctx.actor === ActorType.IDENTITY) return { identityId: ctx.actorId };
  return null;
};

export const ownerOf = (ctx: TGenericPermission): TAgentVaultOwner => {
  const owner = ownerOrNullOf(ctx);
  if (owner) return owner;
  throw new ForbiddenRequestError({
    message: "Only a user or a machine identity can keep their own Agent Vault variables and values"
  });
};

export const ownerColumns = (owner: TAgentVaultOwner | null) => {
  if (!owner) return { userId: null, identityId: null };
  return owner.userId ? { userId: owner.userId, identityId: null } : { userId: null, identityId: owner.identityId! };
};

// `null` matches the rows no one owns, the global ones.
export const whereOwner = <T extends Knex.QueryBuilder>(query: T, table: string, owner: TAgentVaultOwner | null) => {
  if (!owner) return query.whereNull(`${table}.userId`).whereNull(`${table}.identityId`);
  return owner.userId
    ? query.where(`${table}.userId`, owner.userId)
    : query.where(`${table}.identityId`, owner.identityId as string);
};
