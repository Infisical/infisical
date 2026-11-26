import { AbilityTuple, MongoAbility } from "@casl/ability";

import { PERMISSION_BOUNDARY_ERROR_NAME, PermissionDeniedError } from "@app/domains/lib/errors";
import { validatePermissionBoundary } from "@app/lib/casl/boundary";

import { Permission, TPermissionRule, TRuleSource } from "./permission";

// A change to another actor's roles or privileges. One target per role, so a rule can scope the change to a role
// via its `assignableRole` field.
export type TBoundsCheck<TSet extends AbilityTuple> = {
  actions: TSet[0] | TSet[0][];
  subject: Extract<TSet[1], string>;
  fields?: Record<string, unknown>;
  targets: { permission: Permission<AbilityTuple>; roleSlug?: string }[];
};

export type TMissingPermission = { action: string; subject: string; conditions?: unknown };

// New privilege system: the change's own permission refused it. Old system: the actor holds less than the target.
export const permissionBoundsMessage = ({
  message,
  usesNewPrivilegeSystem,
  action,
  subject
}: {
  message: string;
  usesNewPrivilegeSystem: boolean;
  action: string;
  subject: string;
}) =>
  `${message}${
    usesNewPrivilegeSystem
      ? `. Permission denied: ${action} on ${subject}. Check that the actor's role grants this permission and that all permission conditions are met.`
      : ". Actor privilege level is not high enough to perform this action"
  }`;

// The requesting actor's permission. Knows which privilege system the org uses so it can bound changes the actor
// makes to another actor's grants.
export class ActorPermission<TSet extends AbilityTuple> extends Permission<TSet> {
  protected constructor(
    ability: MongoAbility<TSet>,
    private readonly usesNewPrivilegeSystem: boolean
  ) {
    super(ability);
  }

  static of<T extends AbilityTuple>({
    rules,
    usesNewPrivilegeSystem
  }: {
    rules: TPermissionRule<T>[] | TRuleSource;
    usesNewPrivilegeSystem: boolean;
  }): ActorPermission<T> {
    return new ActorPermission<T>(Permission.abilityOf<T>(rules), usesNewPrivilegeSystem);
  }

  // New privilege system: the change's own permission decides (any action passes, first one reported). Old system:
  // the actor must hold everything each target role holds. No targets counts as holding nothing.
  boundsViolations({ actions, subject, fields, targets }: TBoundsCheck<TSet>): TMissingPermission[] {
    const actionList = Array.isArray(actions) ? actions : [actions];
    const measured = targets.length ? targets : [{ permission: Permission.none<AbilityTuple>() }];

    for (const target of measured) {
      const targetFields = target.roleSlug ? { ...fields, assignableRole: target.roleSlug } : fields;
      const missing = this.usesNewPrivilegeSystem
        ? this.missingChangePermission(actionList, subject, targetFields)
        : this.missingHeldPermission(target.permission);
      if (missing.length) return missing;
    }
    return [];
  }

  // `message` says what was refused; the reason gets appended.
  assertBounds({ message, ...check }: TBoundsCheck<TSet> & { message: string }): void {
    const missingPermissions = this.boundsViolations(check);
    if (!missingPermissions.length) return;

    const action = Array.isArray(check.actions) ? check.actions[0] : check.actions;
    throw new PermissionDeniedError({
      name: PERMISSION_BOUNDARY_ERROR_NAME,
      message: permissionBoundsMessage({
        message,
        usesNewPrivilegeSystem: this.usesNewPrivilegeSystem,
        action: action as string,
        subject: check.subject
      }),
      details: { missingPermissions }
    });
  }

  private missingHeldPermission(target: Permission<AbilityTuple>): TMissingPermission[] {
    const boundary = validatePermissionBoundary(this.toAbility() as MongoAbility, target.toAbility() as MongoAbility);
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
}
