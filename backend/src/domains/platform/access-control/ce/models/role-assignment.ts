import { TMembershipRoles } from "@app/db/schemas";
import { asDate } from "@app/lib/fn/dates";

import { Grant } from "./grant";
import { TemporaryAccess } from "./temporary-access";

export type TRoleAssignmentRecord = Pick<
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
  // Read with the assignment when customRoleId is set: the custom role's slug, name and packed rules.
  customRoleSlug?: string | null;
  customRoleName?: string | null;
  customRolePermissions?: unknown;
};

// One role a membership holds: a built-in slug, or "custom" with the custom role it names.
export class RoleAssignment {
  private constructor(
    private readonly record: TRoleAssignmentRecord,
    private readonly access: TemporaryAccess
  ) {}

  // Dates may arrive as strings from a cache.
  static restore(record: TRoleAssignmentRecord): RoleAssignment {
    const restored: TRoleAssignmentRecord = {
      ...record,
      isTemporary: Boolean(record.isTemporary),
      temporaryAccessStartTime: asDate(record.temporaryAccessStartTime),
      temporaryAccessEndTime: asDate(record.temporaryAccessEndTime),
      createdAt: asDate(record.createdAt),
      updatedAt: asDate(record.updatedAt)
    };
    return new RoleAssignment(restored, TemporaryAccess.restore(restored));
  }

  get id(): string {
    return this.record.id;
  }

  // The stored slug: a built-in role, or "custom" for a custom role.
  get role(): string {
    return this.record.role;
  }

  get customRoleId(): string | null {
    return this.record.customRoleId ?? null;
  }

  get isTemporary(): boolean {
    return Boolean(this.record.isTemporary);
  }

  get temporaryAccessStartTime(): Date | null {
    return this.record.temporaryAccessStartTime ?? null;
  }

  get temporaryAccessEndTime(): Date | null {
    return this.record.temporaryAccessEndTime ?? null;
  }

  // A custom role's own name, for display; null for a built-in role.
  get customRoleName(): string | null {
    return this.record.customRoleName ?? null;
  }

  get customRoleSlug(): string | null {
    return this.record.customRoleSlug ?? null;
  }

  // The slug the role is known by: the custom role's own slug, or the built-in slug.
  get effectiveSlug(): string {
    return this.record.customRoleSlug || this.record.role;
  }

  isActive(now: Date = new Date()): boolean {
    return this.access.isActive(now);
  }

  // Decided by the stored slug, as Grant decides it, so the answer always matches the rules the role grants.
  get isCustom(): boolean {
    return this.toGrant().isCustom();
  }

  isBuiltIn(slug: string): boolean {
    return this.toGrant().isBuiltIn(slug);
  }

  // What a listing calls the role: a custom role's own name (or slug), otherwise the built-in slug.
  get displayName(): string {
    if (!this.isCustom) return this.record.role;
    return this.record.customRoleName || this.record.customRoleSlug || "Custom";
  }

  toGrant(): Grant {
    return Grant.restore({ slug: this.record.role, packedRules: this.record.customRolePermissions });
  }

  toJSON(): TRoleAssignmentRecord {
    return { ...this.record };
  }
}
