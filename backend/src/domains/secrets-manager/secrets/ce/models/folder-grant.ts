import { PackRule, packRules } from "@casl/ability/extra";

import { EntityNotFoundError } from "@app/domains/lib/errors";
import { Permission, Privilege, RuleSet, TemporaryAccess } from "@app/domains/platform/access-control/ce/module";
import {
  ProjectPermissionSet,
  TProjectPermissionAuditSource,
  TProjectRule
} from "@app/domains/platform/projects/ce/module";

import {
  FOLDER_EDITING_ROLES,
  FOLDER_SCOPED_DENY_RULES_BY_ROLE,
  FolderRoles,
  RECURSIVE_FOLDER_SCOPED_DENY_RULES_BY_ROLE,
  RECURSIVE_SECRET_FOLDER_ROLE_PERMISSIONS,
  recursiveFolderPathGlob,
  SECRET_FOLDER_ROLE_PERMISSIONS
} from "./folder-roles";

export type TFolderGrantRecord = {
  id: string;
  name: string;
  // The user or identity holding it.
  actorId: string | null;
  folderId: string;
  role: string;
  // Where the folder is: its environment and full path.
  environmentSlug: string;
  secretPath: string;
  // The grant reaches the folders below its folder too. Only a grant on the root folder may.
  appliesToSubfolders?: boolean;
  isTemporary: boolean;
  temporaryAccessStartTime: Date | null;
  temporaryAccessEndTime: Date | null;
};

const asDate = (value: Date | string | null | undefined) => (value ? new Date(value) : null);

// One folder grant: a folder role held on one secret folder, which decides what its holder may do at that folder's
// environment and path (and below it, for a grant on the root folder that applies to subfolders), whatever the
// project roles say there.
export class FolderGrant {
  private constructor(
    private readonly record: TFolderGrantRecord,
    private readonly access: TemporaryAccess
  ) {}

  // Trusts the record. Dates may arrive as strings from a cache. An unknown role is only refused when the grant's
  // rules are built, so a listing still shows it.
  static restore(record: TFolderGrantRecord): FolderGrant {
    const restored: TFolderGrantRecord = {
      ...record,
      appliesToSubfolders: Boolean(record.appliesToSubfolders),
      isTemporary: Boolean(record.isTemporary),
      temporaryAccessStartTime: asDate(record.temporaryAccessStartTime),
      temporaryAccessEndTime: asDate(record.temporaryAccessEndTime)
    };
    return new FolderGrant(restored, TemporaryAccess.restore(restored));
  }

  // A folder grant privilege at its folder's location. Null when the privilege is not a folder grant or holds no
  // role, since it grants nothing.
  static fromPrivilege(
    privilege: Privilege,
    location: { environmentSlug: string; secretPath: string }
  ): FolderGrant | null {
    const { folderId, folderRole } = privilege;
    if (!folderId || !folderRole) return null;
    const { actorUserId, actorIdentityId } = privilege.toJSON();
    return FolderGrant.restore({
      id: privilege.id,
      name: privilege.name,
      actorId: actorUserId ?? actorIdentityId ?? null,
      folderId,
      role: folderRole,
      environmentSlug: location.environmentSlug,
      secretPath: location.secretPath,
      appliesToSubfolders: privilege.appliesToSubfolders,
      isTemporary: privilege.isTemporary,
      temporaryAccessStartTime: privilege.temporaryAccessStartTime,
      temporaryAccessEndTime: privilege.temporaryAccessEndTime
    });
  }

  get id(): string {
    return this.record.id;
  }

  get actorId(): string | null {
    return this.record.actorId;
  }

  get folderId(): string {
    return this.record.folderId;
  }

  get role(): string {
    return this.record.role;
  }

  get environmentSlug(): string {
    return this.record.environmentSlug;
  }

  get secretPath(): string {
    return this.record.secretPath;
  }

  get appliesToSubfolders(): boolean {
    return Boolean(this.record.appliesToSubfolders);
  }

  // A grant that applies to subfolders anywhere but the root folder is invalid data: it grants nothing.
  get isIgnored(): boolean {
    return this.appliesToSubfolders && this.record.secretPath !== "/";
  }

  // Whether this grant lets its holder create and edit folders across its environment.
  get editsFoldersAcrossEnvironment(): boolean {
    return this.appliesToSubfolders && !this.isIgnored && FOLDER_EDITING_ROLES.has(this.knownRole());
  }

  isActive(now: Date = new Date()): boolean {
    return this.access.isActive(now);
  }

  // What the folder role does not allow, denied at the folder (and below it, for a grant that applies to
  // subfolders): it resets whatever the project roles allowed there. `recursiveTables` picks the role tables that
  // also let the edit tier and above create and edit folders, which a grant that applies to subfolders always uses.
  denyBlock({ recursiveTables = this.appliesToSubfolders }: { recursiveTables?: boolean } = {}): RuleSet<TProjectRule> {
    const role = this.knownRole();
    if (this.isIgnored) return RuleSet.of([]);
    return this.atFolder(
      (recursiveTables ? RECURSIVE_FOLDER_SCOPED_DENY_RULES_BY_ROLE : FOLDER_SCOPED_DENY_RULES_BY_ROLE)[role]
    );
  }

  // What the folder role allows, at the folder (and below it, for a grant that applies to subfolders).
  allowBlock({
    recursiveTables = this.appliesToSubfolders
  }: { recursiveTables?: boolean } = {}): RuleSet<TProjectRule> {
    const role = this.knownRole();
    if (this.isIgnored) return RuleSet.of([]);
    return this.atFolder(
      (recursiveTables ? RECURSIVE_SECRET_FOLDER_ROLE_PERMISSIONS : SECRET_FOLDER_ROLE_PERMISSIONS)[role]
    );
  }

  // This grant alone: its denies, then its allows.
  rules(): RuleSet<TProjectRule> {
    return this.denyBlock().then(this.allowBlock());
  }

  // What the grant gives, without the denies, for a privilege boundary: the boundary reads every rule as a grant, so
  // the deny half would make the holder look barred from the folder the grant opens.
  allowPermission(): Permission<ProjectPermissionSet> {
    return Permission.fromRules<ProjectPermissionSet>({ rules: this.allowBlock() });
  }

  // The grant as one of the sources a member's permission audit lists.
  toAuditSource(): TProjectPermissionAuditSource {
    return {
      id: this.record.id,
      type: "additional_privilege",
      name: this.record.name || "Folder Access",
      isTemporary: this.record.isTemporary,
      temporaryAccessStartTime: this.record.temporaryAccessStartTime?.toISOString(),
      temporaryAccessEndTime: this.record.temporaryAccessEndTime?.toISOString(),
      permissions: packRules(this.rules().rules) as PackRule<TProjectRule>[]
    };
  }

  toJSON(): TFolderGrantRecord {
    return { ...this.record };
  }

  private knownRole() {
    const { role, id } = this.record;
    if (!FolderRoles.isKnown(role)) {
      throw new EntityNotFoundError({
        name: "FolderRoleInvalid",
        message: `Folder access role '${role}' on grant with ID '${id}' not found`
      });
    }
    return role;
  }

  private atFolder(rules: TProjectRule[]): RuleSet<TProjectRule> {
    const conditions = {
      environment: this.record.environmentSlug,
      secretPath: this.appliesToSubfolders
        ? { $glob: recursiveFolderPathGlob(this.record.secretPath) }
        : this.record.secretPath
    };
    return RuleSet.of(rules.map((rule) => ({ ...rule, conditions }) as TProjectRule));
  }
}
