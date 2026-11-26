import {
  AbilityTuple,
  createMongoAbility,
  MongoAbility,
  PureAbility,
  RawRuleOf,
  subject as caslSubject
} from "@casl/ability";
import { PackRule, packRules } from "@casl/ability/extra";

import { PermissionDeniedError } from "@app/domains/lib/errors";
import { conditionsMatcher } from "@app/lib/casl";

export type TPermissionRule<TSet extends AbilityTuple> = RawRuleOf<MongoAbility<TSet>>;

// Any ordered rule holder, e.g. a RuleSet of any rule type.
export type TRuleSource = { readonly rules: object[] };

// `fields` describe the object (env and secret path, key name, ...) and are what CASL conditions match against.
export type TPermissionCheck<TSet extends AbilityTuple> = {
  action: TSet[0];
  subject: Extract<TSet[1], string>;
  fields?: Record<string, unknown>;
};

// Built by the scope owner. Wraps CASL so callers never touch it; owners subclass to add their own facts (project,
// admin role).
export class Permission<TSet extends AbilityTuple> {
  protected constructor(private readonly ability: MongoAbility<TSet>) {}

  static fromRules<T extends AbilityTuple>({ rules }: { rules: TPermissionRule<T>[] | TRuleSource }): Permission<T> {
    return new Permission<T>(Permission.abilityOf<T>(rules));
  }

  static none<T extends AbilityTuple>(): Permission<T> {
    return new Permission<T>(Permission.abilityOf<T>([]));
  }

  protected static abilityOf<T extends AbilityTuple>(rules: TPermissionRule<T>[] | TRuleSource): MongoAbility<T> {
    const list = (Array.isArray(rules) ? rules : rules.rules) as TPermissionRule<T>[];
    return createMongoAbility<T>(list, { conditionsMatcher });
  }

  // Copy the fields so CASL doesn't tag the caller's object.
  private static target<T extends AbilityTuple>({ subject, fields }: TPermissionCheck<T>) {
    return fields ? caslSubject(subject, { ...fields }) : subject;
  }

  can(check: TPermissionCheck<TSet>): boolean {
    return (this.ability as MongoAbility).can(check.action as string, Permission.target(check));
  }

  cannot(check: TPermissionCheck<TSet>): boolean {
    return !this.can(check);
  }

  // The matched rules end up in the 403 response and the permission-denied audit log.
  assert(check: TPermissionCheck<TSet>): void {
    if (this.can(check)) return;
    const action = check.action as string;
    const matchedRules = (this.ability as PureAbility).rulesFor(action, check.subject).map((rule) => ({
      action: rule.action,
      inverted: rule.inverted,
      subject: rule.subject,
      conditions: rule.conditions
    }));
    throw new PermissionDeniedError({
      denial: { action, subject: check.subject, subjectFields: check.fields, matchedRules }
    });
  }

  get rules(): TPermissionRule<TSet>[] {
    return this.ability.rules as TPermissionRule<TSet>[];
  }

  pack(): PackRule<TPermissionRule<TSet>>[] {
    return packRules(this.rules);
  }

  // For legacy code that still needs a raw CASL ability.
  toAbility(): MongoAbility<TSet> {
    return this.ability;
  }
}
