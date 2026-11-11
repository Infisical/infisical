import { TMembershipRoles } from "@app/db/schemas";

export type TRoleAssignmentProps = Pick<
  TMembershipRoles,
  | "id"
  | "role"
  | "customRoleId"
  | "isTemporary"
  | "temporaryMode"
  | "temporaryRange"
  | "temporaryAccessStartTime"
  | "temporaryAccessEndTime"
  | "createdAt"
  | "updatedAt"
> & {
  // Present when customRoleId is set: the custom role's slug, name and packed rules.
  customRoleSlug?: string | null;
  customRoleName?: string | null;
  customRolePermissions?: unknown;
};

// One role a membership holds: a built-in slug, or the custom slug with the custom role's packed rules.
export class RoleAssignment {
  private constructor(private readonly props: TRoleAssignmentProps) {}

  static restore(props: TRoleAssignmentProps): RoleAssignment {
    return new RoleAssignment({ ...props, isTemporary: Boolean(props.isTemporary) });
  }

  get id(): string {
    return this.props.id;
  }

  // The stored slug: a built-in role, or the custom slug ("custom") for a custom role.
  get role(): string {
    return this.props.role;
  }

  get customRoleId(): string | null {
    return this.props.customRoleId ?? null;
  }

  get customRoleSlug(): string | null {
    return this.props.customRoleSlug ?? null;
  }

  get customRoleName(): string | null {
    return this.props.customRoleName ?? null;
  }

  get isTemporary(): boolean {
    return Boolean(this.props.isTemporary);
  }

  get temporaryAccessStartTime(): Date | null {
    return this.props.temporaryAccessStartTime ?? null;
  }

  get temporaryAccessEndTime(): Date | null {
    return this.props.temporaryAccessEndTime ?? null;
  }

  get customRolePermissions(): unknown {
    return this.props.customRolePermissions;
  }

  // The slug the role is known by: the custom role's own slug, or the built-in slug.
  get effectiveSlug(): string {
    return this.props.customRoleSlug || this.props.role;
  }

  // Permanent, or temporary and not yet ended. A temporary role without an end time never applies.
  isActive(now: Date = new Date()): boolean {
    if (!this.props.isTemporary) return true;
    return Boolean(this.props.temporaryAccessEndTime && now < this.props.temporaryAccessEndTime);
  }

  toJSON(): TRoleAssignmentProps {
    return { ...this.props };
  }
}
