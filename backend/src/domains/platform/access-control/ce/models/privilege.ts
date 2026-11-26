import { TAdditionalPrivileges } from "@app/db/schemas";
import { asDate } from "@app/lib/fn/dates";

import { Grant } from "./grant";
import { TemporaryAccess } from "./temporary-access";

export type TPrivilegeRecord = TAdditionalPrivileges;

// Extra permissions on top of roles, org- or project-wide. A folder grant is a privilege on one secret folder that
// holds a folder role instead of rules.
export class Privilege {
  private constructor(
    private readonly record: TPrivilegeRecord,
    private readonly access: TemporaryAccess
  ) {}

  // No validation. Dates can come back as strings from the cache.
  static restore(record: TPrivilegeRecord): Privilege {
    const restored: TPrivilegeRecord = {
      ...record,
      isTemporary: Boolean(record.isTemporary),
      temporaryAccessStartTime: asDate(record.temporaryAccessStartTime),
      temporaryAccessEndTime: asDate(record.temporaryAccessEndTime),
      createdAt: asDate(record.createdAt),
      updatedAt: asDate(record.updatedAt)
    };
    return new Privilege(restored, TemporaryAccess.restore(restored));
  }

  get id(): string {
    return this.record.id;
  }

  get name(): string {
    return this.record.name;
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

  // folderId and folderRole are null for anything but a folder grant.
  get folderId(): string | null {
    return this.record.folderId ?? null;
  }

  get folderRole(): string | null {
    return this.record.folderId ? (this.record.role ?? null) : null;
  }

  get appliesToSubfolders(): boolean {
    return Boolean(this.record.folderId && this.record.appliesToSubfolders);
  }

  isActive(now: Date = new Date()): boolean {
    return this.access.isActive(now);
  }

  toGrant(): Grant {
    return Grant.custom(this.record.permissions);
  }

  toJSON(): TPrivilegeRecord {
    return { ...this.record };
  }
}
