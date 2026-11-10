import { AbilityTuple, AnyAbility, createMongoAbility, MongoAbility, RawRuleOf } from "@casl/ability";
import { PackRule, unpackRules } from "@casl/ability/extra";

import { conditionsMatcher } from "@app/lib/casl";
import { logger } from "@app/lib/logger";

import { TGrantEntry } from "../model/actor-grants";

export type TRawRule<TAbility extends AnyAbility> = RawRuleOf<TAbility>;

// A scope owner's built-in roles: the rules for a slug, or undefined when the slug is not one of them.
export type TRoleRuleResolver<TAbility extends AnyAbility> = (role: string) => TRawRule<TAbility>[] | undefined;

export type TBuildRulesInput<TAbility extends AnyAbility> = {
  entries: TGrantEntry[];
  // The slug that carries packed rules: custom roles and privileges.
  customRoleSlug: string;
  resolveRole: TRoleRuleResolver<TAbility>;
  // A slug that is neither built in nor custom: "skip" grants nothing for it (a role whose product was removed),
  // "throw" refuses the whole build.
  onUnknownRole: "skip" | ((role: string) => Error);
};

export const unpackCustomRules = <TAbility extends AnyAbility>(permissions: unknown): TRawRule<TAbility>[] =>
  unpackRules<TRawRule<TAbility>>((permissions ?? []) as PackRule<TRawRule<TAbility>>[]);

// Inverted (cannot) rules sort after the rest: CASL gives the last matching rule precedence.
export const sortInvertedLast = <TRule extends { inverted?: boolean }>(rules: TRule[]): TRule[] =>
  [...rules].sort((a, b) => Number(Boolean(a.inverted)) - Number(Boolean(b.inverted)));

export const buildRules = <TAbility extends AnyAbility>({
  entries,
  customRoleSlug,
  resolveRole,
  onUnknownRole
}: TBuildRulesInput<TAbility>): TRawRule<TAbility>[] =>
  sortInvertedLast(
    entries.flatMap(({ role, permissions }) => {
      if (role === customRoleSlug) return unpackCustomRules<TAbility>(permissions);
      const rules = resolveRole(role);
      if (rules) return rules;
      if (onUnknownRole === "skip") {
        // The logger is only initialised by the server; tests and scripts run without it.
        logger?.warn(`Access Control: unknown role slug, granting no rules [role=${role}]`);
        return [];
      }
      throw onUnknownRole(role);
    })
  );

export const createAbility = <TSet extends AbilityTuple>(rules: RawRuleOf<MongoAbility<TSet>>[]): MongoAbility<TSet> =>
  createMongoAbility<TSet>(rules, { conditionsMatcher });

// An ability that allows nothing.
export const denyAll = <TSet extends AbilityTuple>(): MongoAbility<TSet> => createAbility<TSet>([]);
