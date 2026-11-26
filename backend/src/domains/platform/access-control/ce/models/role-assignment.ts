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
  // Joined in from the custom role when customRoleId is set.
  customRoleSlug?: string | null;
  customRoleName?: string | null;
  customRolePermissions?: unknown;
};

export class RoleAssignment {
  private constructor(
    private readonly record: TRoleAssignmentRecord,
    private readonly access: TemporaryAccess
  ) {}

  // Dates can come back as strings from the cache.
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

  // A built-in slug, or "custom" for a custom role (see effectiveSlug).
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

  get customRoleName(): string | null {
    return this.record.customRoleName ?? null;
  }

  get customRoleSlug(): string | null {
    return this.record.customRoleSlug ?? null;
  }

  get effectiveSlug(): string {
    return this.record.customRoleSlug || this.record.role;
  }

  isActive(now: Date = new Date()): boolean {
    return this.access.isActive(now);
  }

  // Goes through Grant so this always agrees with the rules the role actually grants.
  get isCustom(): boolean {
    return this.toGrant().isCustom();
  }

  isBuiltIn(slug: string): boolean {
    return this.toGrant().isBuiltIn(slug);
  }

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
