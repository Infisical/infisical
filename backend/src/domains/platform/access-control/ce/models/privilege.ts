import { TAdditionalPrivileges } from "@app/db/schemas";

import { Grant } from "./grant";
import { TemporaryAccess } from "./temporary-access";

export type TPrivilegeRecord = TAdditionalPrivileges;

const asDate = <T extends Date | string | null | undefined>(value: T) =>
  (value ? new Date(value) : value) as T extends string ? Date : T;

// Permissions granted to one user or identity on top of their roles, org-wide or project-wide. A folder grant is a
// privilege on one secret folder, holding a folder role instead of rules.
export class Privilege {
  private constructor(
    private readonly record: TPrivilegeRecord,
    private readonly access: TemporaryAccess
  ) {}

  // Trusts the row. Dates may arrive as strings from a cache.
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

  // The folder a folder grant is on, and the folder role it holds; null for other privileges.
  get folderId(): string | null {
    return this.record.folderId ?? null;
  }

  get folderRole(): string | null {
    return this.record.folderId ? (this.record.role ?? null) : null;
  }

  // Whether a folder grant reaches the folders below its folder too.
  get appliesToSubfolders(): boolean {
    return Boolean(this.record.folderId && this.record.appliesToSubfolders);
  }

  isActive(now: Date = new Date()): boolean {
    return this.access.isActive(now);
  }

  // A privilege grants its rules the way a custom role does.
  toGrant(): Grant {
    return Grant.restore({ slug: "custom", packedRules: this.record.permissions });
  }

  toJSON(): TPrivilegeRecord {
    return { ...this.record };
  }
}
