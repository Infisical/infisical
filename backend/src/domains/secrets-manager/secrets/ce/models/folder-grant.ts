import { PackRule, packRules } from "@casl/ability/extra";

import { EntityNotFoundError } from "@app/domains/lib/errors";
import { Permission, Privilege, RuleSet, TemporaryAccess } from "@app/domains/platform/access-control/ce/module";
import {
  ProjectPermissionSet,
  TProjectPermissionAuditSource,
  TProjectRule
} from "@app/domains/platform/projects/ce/module";
import { asDate } from "@app/lib/fn/dates";

import {
  canonicalFolderPath,
  FOLDER_EDITING_ROLES,
  FOLDER_SCOPED_DENY_RULES_BY_ROLE,
  FolderRoles,
  RECURSIVE_FOLDER_SCOPED_DENY_RULES_BY_ROLE,
  RECURSIVE_SECRET_FOLDER_ROLE_PERMISSIONS,
  recursiveFolderPathGlob,
  SECRET_FOLDER_ROLE_PERMISSIONS
} from "./permissions/folder-roles";

export type TFolderGrantRecord = {
  id: string;
  name: string;
  actorId: string | null;
  folderId: string;
  role: string;
  environmentSlug: string;
  secretPath: string;
  appliesToSubfolders?: boolean;
  isTemporary: boolean;
  temporaryAccessStartTime: Date | null;
  temporaryAccessEndTime: Date | null;
};

// A folder role held on one folder. Overrides the project roles there (and below, if it applies to subfolders).
export class FolderGrant {
  private constructor(
    private readonly record: TFolderGrantRecord,
    private readonly access: TemporaryAccess
  ) {}

  // Dates can come back as strings from the cache. Unknown roles only throw once rules get built, so listings still
  // show them.
  static restore(record: TFolderGrantRecord): FolderGrant {
    const restored: TFolderGrantRecord = {
      ...record,
      appliesToSubfolders: Boolean(record.appliesToSubfolders),
      isTemporary: Boolean(record.isTemporary),
      temporaryAccessStartTime: asDate(record.temporaryAccessStartTime) ?? null,
      temporaryAccessEndTime: asDate(record.temporaryAccessEndTime) ?? null
    };
    return new FolderGrant(restored, TemporaryAccess.restore(restored));
  }

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

  // Canonical, since the grant's conditions match against it.
  get folderPath(): string {
    return canonicalFolderPath(this.record.secretPath);
  }

  get depth(): number {
    return this.folderPath.split("/").filter(Boolean).length;
  }

  // A recursive grant with this lets its holder create and edit folders across the subtree.
  get editsFolders(): boolean {
    return FOLDER_EDITING_ROLES.has(this.knownRole());
  }

  isActive(now: Date = new Date()): boolean {
    return this.access.isActive(now);
  }

  // Denies what the role doesn't allow at the folder, resetting whatever project roles allowed there.
  // `recursiveTables` picks the tables where edit and above can also create/edit folders (recursive grants always do).
  denyBlock({ recursiveTables = this.appliesToSubfolders }: { recursiveTables?: boolean } = {}): RuleSet<TProjectRule> {
    const role = this.knownRole();
    return this.atFolder(
      (recursiveTables ? RECURSIVE_FOLDER_SCOPED_DENY_RULES_BY_ROLE : FOLDER_SCOPED_DENY_RULES_BY_ROLE)[role]
    );
  }

  allowBlock({
    recursiveTables = this.appliesToSubfolders
  }: { recursiveTables?: boolean } = {}): RuleSet<TProjectRule> {
    const role = this.knownRole();
    return this.atFolder(
      (recursiveTables ? RECURSIVE_SECRET_FOLDER_ROLE_PERMISSIONS : SECRET_FOLDER_ROLE_PERMISSIONS)[role]
    );
  }

  rules(options: { recursiveTables?: boolean } = {}): RuleSet<TProjectRule> {
    return this.denyBlock(options).then(this.allowBlock(options));
  }

  // Allows only, for privilege boundaries: they read every rule as a grant, so the denies would make the holder look
  // barred from the folder the grant opens.
  allowPermission(): Permission<ProjectPermissionSet> {
    return Permission.fromRules<ProjectPermissionSet>({ rules: this.allowBlock() });
  }

  // Pass `rules` from FolderGrants.rulesByGrant to show what it adds beside the holder's other grants.
  toAuditSource(rules: RuleSet<TProjectRule> = this.rules()): TProjectPermissionAuditSource {
    return {
      id: this.record.id,
      type: "additional_privilege",
      name: this.record.name || "Folder Access",
      isTemporary: this.record.isTemporary,
      temporaryAccessStartTime: this.record.temporaryAccessStartTime?.toISOString(),
      temporaryAccessEndTime: this.record.temporaryAccessEndTime?.toISOString(),
      permissions: packRules(rules.rules) as PackRule<TProjectRule>[]
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
      secretPath: this.appliesToSubfolders ? { $glob: recursiveFolderPathGlob(this.folderPath) } : this.folderPath
    };
    return RuleSet.of(rules.map((rule) => ({ ...rule, conditions }) as TProjectRule));
  }
}
