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
import { validatePermissionBoundary } from "@app/lib/casl/boundary";

export type TPermissionRule<TSet extends AbilityTuple> = RawRuleOf<MongoAbility<TSet>>;

// Anything holding rules in order: a RuleSet of any rule type.
export type TRuleSource = { readonly rules: object[] };

// One check: an action on a subject, optionally on an object of that subject described by its fields (an
// environment and secret path, a key name). Fields are what CASL conditions match against.
export type TPermissionCheck<TSet extends AbilityTuple> = {
  action: TSet[0];
  subject: Extract<TSet[1], string>;
  fields?: Record<string, unknown>;
};

// A change to what another actor holds (their roles or privileges): the change asked for and what the target holds,
// one entry per role, so a rule can scope the change to a role through its `assignableRole` field.
export type TBoundsCheck<TSet extends AbilityTuple> = {
  actions: TSet[0] | TSet[0][];
  subject: Extract<TSet[1], string>;
  fields?: Record<string, unknown>;
  targets: { permission: Permission<AbilityTuple>; roleSlug?: string }[];
  usesNewPrivilegeSystem: boolean;
};

export type TMissingPermission = { action: string; subject: string; conditions?: unknown };

// What an actor may do in one scope, built by that scope's owner. Wraps a CASL ability so callers check with objects
// and never handle CASL; owners extend it with their own facts (the project, the admin role).
export class Permission<TSet extends AbilityTuple> {
  protected constructor(private readonly ability: MongoAbility<TSet>) {}

  static fromRules<T extends AbilityTuple>({ rules }: { rules: TPermissionRule<T>[] | TRuleSource }): Permission<T> {
    return new Permission<T>(Permission.abilityOf<T>(rules));
  }

  // Allows nothing.
  static none<T extends AbilityTuple>(): Permission<T> {
    return new Permission<T>(Permission.abilityOf<T>([]));
  }

  protected static abilityOf<T extends AbilityTuple>(rules: TPermissionRule<T>[] | TRuleSource): MongoAbility<T> {
    const list = (Array.isArray(rules) ? rules : rules.rules) as TPermissionRule<T>[];
    return createMongoAbility<T>(list, { conditionsMatcher });
  }

  // The subject CASL checks: the bare subject type, or the fields tagged with it. Copied, so the caller's object is
  // never tagged.
  private static target<T extends AbilityTuple>({ subject, fields }: TPermissionCheck<T>) {
    return fields ? caslSubject(subject, { ...fields }) : subject;
  }

  can(check: TPermissionCheck<TSet>): boolean {
    return (this.ability as MongoAbility).can(check.action as string, Permission.target(check));
  }

  cannot(check: TPermissionCheck<TSet>): boolean {
    return !this.can(check);
  }

  // Throws PermissionDeniedError naming the refused check and the rules that matched it, which the 403 response and
  // the permission-denied audit log report.
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

  // What stops this actor making the change, empty when nothing does. Under the org's new privilege system the
  // change's own permission decides (any of the actions, the first reported); otherwise the actor must hold at least
  // everything each target role holds. A target with no roles is measured as holding nothing.
  boundsViolations({
    actions,
    subject,
    fields,
    targets,
    usesNewPrivilegeSystem
  }: TBoundsCheck<TSet>): TMissingPermission[] {
    const actionList = Array.isArray(actions) ? actions : [actions];
    const measured = targets.length ? targets : [{ permission: Permission.none<AbilityTuple>() }];

    for (const target of measured) {
      const targetFields = target.roleSlug ? { ...fields, assignableRole: target.roleSlug } : fields;
      const missing = usesNewPrivilegeSystem
        ? this.missingChangePermission(actionList, subject, targetFields)
        : this.missingHeldPermission(target.permission);
      if (missing.length) return missing;
    }
    return [];
  }

  private missingHeldPermission(target: Permission<AbilityTuple>): TMissingPermission[] {
    const boundary = validatePermissionBoundary(this.ability as MongoAbility, target.toAbility() as MongoAbility);
    return boundary.missingPermissions ?? [];
  }

  private missingChangePermission(
    actions: TSet[0][],
    subject: Extract<TSet[1], string>,
    fields?: Record<string, unknown>
  ): TMissingPermission[] {
    if (actions.some((action) => this.can({ action, subject, fields }))) return [];
    return [{ action: actions[0] as string, subject }];
  }

  get rules(): TPermissionRule<TSet>[] {
    return this.ability.rules as TPermissionRule<TSet>[];
  }

  // The rules packed for an API response.
  pack(): PackRule<TPermissionRule<TSet>>[] {
    return packRules(this.rules);
  }

  // The CASL ability, for legacy code that still reads one.
  toAbility(): MongoAbility<TSet> {
    return this.ability;
  }
}
