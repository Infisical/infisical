import { AbilityTuple, ForbiddenError, MongoAbility, RawRuleOf, subject as caslSubject } from "@casl/ability";
import { PackRule, packRules } from "@casl/ability/extra";

import { createAbility } from "../service/ability-builder";

export type TPermissionRule<TSet extends AbilityTuple> = RawRuleOf<MongoAbility<TSet>>;

// One check: an action on a subject, optionally on an object of that subject described by its fields (an
// environment and secret path, a key name). Fields are what CASL conditions match against.
export type TPermissionCheck<TSet extends AbilityTuple> = {
  action: TSet[0];
  subject: Extract<TSet[1], string>;
  fields?: Record<string, unknown>;
};

// What an actor may do in one scope, built by that scope's owner. Wraps a CASL ability so callers check with
// objects and never handle CASL directly; owners extend it with their own facts (the project, the admin role).
export class Permission<TSet extends AbilityTuple> {
  protected constructor(private readonly ability: MongoAbility<TSet>) {}

  static fromRules<T extends AbilityTuple>({ rules }: { rules: TPermissionRule<T>[] }): Permission<T> {
    return new Permission<T>(createAbility<T>(rules));
  }

  // Allows nothing.
  static none<T extends AbilityTuple>(): Permission<T> {
    return new Permission<T>(createAbility<T>([]));
  }

  // The subject CASL checks: the bare subject type, or the fields tagged with it. Copied, so the caller's
  // object is never tagged.
  private static target<T extends AbilityTuple>({ subject, fields }: TPermissionCheck<T>) {
    return fields ? caslSubject(subject, { ...fields }) : subject;
  }

  can(check: TPermissionCheck<TSet>): boolean {
    return (this.ability as MongoAbility).can(check.action as string, Permission.target(check));
  }

  cannot(check: TPermissionCheck<TSet>): boolean {
    return !this.can(check);
  }

  // Throws CASL's ForbiddenError when the check fails: the error handler turns it into the 403 response, and the
  // permission-denied audit hook reads it.
  assert(check: TPermissionCheck<TSet>): void {
    ForbiddenError.from(this.ability as MongoAbility).throwUnlessCan(check.action as string, Permission.target(check));
  }

  get rules(): TPermissionRule<TSet>[] {
    return this.ability.rules as TPermissionRule<TSet>[];
  }

  // The rules packed for an API response.
  pack(): PackRule<TPermissionRule<TSet>>[] {
    return packRules(this.rules);
  }

  // The CASL ability, for code that has not moved to Permission yet.
  toAbility(): MongoAbility<TSet> {
    return this.ability;
  }
}
