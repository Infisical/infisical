import { createMongoAbility, MongoAbility, RawRuleOf, subject } from "@casl/ability";
import { z } from "zod";

import { ProjectMembershipRole, ProjectType, SecretFolderRole } from "@app/db/schemas";
import { EntityNotFoundError } from "@app/domains/lib/errors";
import { Grant, Permission } from "@app/domains/platform/access-control/ce/module";
import {
  ProjectAccess,
  ProjectPermissionActions,
  ProjectPermissionCommitsActions,
  ProjectPermissionDynamicSecretActions,
  ProjectPermissionHoneyTokenActions,
  ProjectPermissionSecretActions,
  ProjectPermissionSecretApprovalRequestActions,
  ProjectPermissionSecretEventActions,
  ProjectPermissionSecretFolderActions,
  ProjectPermissionSecretRotationActions,
  ProjectPermissionSecretSyncActions,
  ProjectPermissionSet,
  ProjectPermissionSub,
  ProjectPermissionV2Schema,
  StandardProjectRoles
} from "@app/domains/platform/projects/ce/module";
import { conditionsMatcher } from "@app/lib/casl";
import { validatePermissionBoundary } from "@app/lib/casl/boundary";

import { FolderGrant, TFolderGrantRecord } from "./folder-grant";
import { FolderGrants } from "./folder-grants";
import { FOLDER_SCOPED_DENY_RULES, FolderRoles } from "./folder-roles";

const privilege = (overrides: Partial<TFolderGrantRecord> = {}): FolderGrant =>
  FolderGrant.restore({
    id: "privilege-id",
    name: "grant",
    actorId: "actor-id",
    folderId: "folder-id",
    role: SecretFolderRole.Read,
    environmentSlug: "dev",
    secretPath: "/a/b",
    isTemporary: false,
    temporaryAccessStartTime: null,
    temporaryAccessEndTime: null,
    ...overrides
  });

const adminRoles = [ProjectMembershipRole.Admin];
const memberRoles = [ProjectMembershipRole.Member];
const viewerRoles = [ProjectMembershipRole.Viewer];

// Secret Manager projects use the standard project roles; folder grants decide at their folders, as
// getSecretsPermission layers them.
const roleRules = (roles: string[]) =>
  ProjectAccess.rulesOf(
    roles.map((slug) => Grant.restore({ slug })),
    StandardProjectRoles.generic(ProjectType.SecretManager)
  );

const abilityFor = (roles: string[], privileges: FolderGrant[] = []) =>
  Permission.fromRules<ProjectPermissionSet>({
    rules: roleRules(roles).then(FolderGrants.inForce(privileges).rules())
  }).toAbility();

const folderRules = (privileges: FolderGrant[]) => FolderGrants.inForce(privileges).rules().rules;

describe("FOLDER_SCOPED_DENY_RULES", () => {
  // Subjects that support a secretPath condition but are deliberately NOT denied at granted folder
  // paths, so the base project role keeps applying there.
  const DENY_EXEMPT_SUBJECTS: string[] = [
    ProjectPermissionSub.ProxiedServices,
    ProjectPermissionSub.ProjectFolderGrant
  ];

  // The single source of truth for "which subjects can be scoped by secretPath" is the permission
  // API schema itself, so enumerate it rather than hardcoding the list here.
  const secretPathScopedSubjects = ProjectPermissionV2Schema.options.flatMap((option) => {
    const shape = (option as z.AnyZodObject).shape as Record<string, z.ZodTypeAny | undefined>;
    const subjectValue = (shape.subject as z.ZodLiteral<string>).value;
    if (!(Object.values(ProjectPermissionSub) as string[]).includes(subjectValue)) return [];
    if (DENY_EXEMPT_SUBJECTS.includes(subjectValue)) return [];

    const conditionsSchema = shape.conditions;
    const inner = conditionsSchema instanceof z.ZodOptional ? (conditionsSchema.unwrap() as z.ZodTypeAny) : undefined;
    if (!(inner instanceof z.ZodObject) || !("secretPath" in inner.shape)) return [];

    return [subjectValue];
  });

  const deniedActionsBySubject = Object.fromEntries(
    FOLDER_SCOPED_DENY_RULES.map((rule) => [String(rule.subject), [rule.action].flat().map(String)])
  );

  test("should hold only inverted rules, one per subject", () => {
    expect(FOLDER_SCOPED_DENY_RULES.every((rule) => rule.inverted)).toBe(true);
    expect(FOLDER_SCOPED_DENY_RULES).toHaveLength(Object.keys(deniedActionsBySubject).length);
  });

  test("should deny every secretPath-scoped subject at the granted folder", () => {
    expect(
      [...new Set(Object.keys(deniedActionsBySubject))].sort(),
      "A subject that supports a secretPath condition was added or removed. Update FOLDER_SCOPED_DENY_RULES in folder-roles.ts and review whether the SECRET_FOLDER_ROLE_PERMISSIONS tiers should grant the new subject's actions."
    ).toEqual([...new Set(secretPathScopedSubjects)].sort());
  });

  const ALL_ACTIONS_BY_SUBJECT: Record<string, string[]> = {
    [ProjectPermissionSub.Secrets]: Object.values(ProjectPermissionSecretActions),
    [ProjectPermissionSub.SecretFolders]: [
      ProjectPermissionActions.Create,
      ProjectPermissionActions.Edit,
      ProjectPermissionActions.Delete,
      ProjectPermissionSecretFolderActions.ManageAccess
    ],
    [ProjectPermissionSub.SecretImports]: Object.values(ProjectPermissionActions),
    [ProjectPermissionSub.DynamicSecrets]: Object.values(ProjectPermissionDynamicSecretActions),
    [ProjectPermissionSub.SecretSyncs]: Object.values(ProjectPermissionSecretSyncActions),
    [ProjectPermissionSub.SecretRotation]: Object.values(ProjectPermissionSecretRotationActions),
    [ProjectPermissionSub.SecretEventSubscriptions]: Object.values(ProjectPermissionSecretEventActions),
    [ProjectPermissionSub.HoneyTokens]: Object.values(ProjectPermissionHoneyTokenActions),
    [ProjectPermissionSub.Commits]: Object.values(ProjectPermissionCommitsActions)
  };

  test.each(FOLDER_SCOPED_DENY_RULES.map((rule) => String(rule.subject)))(
    "should deny every action of %s",
    (deniedSubject) => {
      expect(
        [...(deniedActionsBySubject[deniedSubject] ?? [])].sort(),
        `A new action was added to the '${deniedSubject}' subject. Add it to FOLDER_SCOPED_DENY_RULES in folder-roles.ts and review whether the SECRET_FOLDER_ROLE_PERMISSIONS tiers should grant it.`
      ).toEqual([...(ALL_ACTIONS_BY_SUBJECT[deniedSubject] ?? [])].sort());
    }
  );
});

describe("FolderGrants.rules", () => {
  test("should let a read grant override a member's base permissions at the granted path only", () => {
    const ability = abilityFor(memberRoles, [privilege({ role: SecretFolderRole.Read })]);

    const grantedPath = { environment: "dev", secretPath: "/a/b" };
    expect(
      ability.can(ProjectPermissionSecretActions.ReadValue, subject(ProjectPermissionSub.Secrets, grantedPath))
    ).toBe(true);
    expect(ability.can(ProjectPermissionSecretActions.Edit, subject(ProjectPermissionSub.Secrets, grantedPath))).toBe(
      false
    );
    expect(ability.can(ProjectPermissionSecretActions.Delete, subject(ProjectPermissionSub.Secrets, grantedPath))).toBe(
      false
    );

    expect(
      ability.can(
        ProjectPermissionSecretActions.Edit,
        subject(ProjectPermissionSub.Secrets, { environment: "dev", secretPath: "/other" })
      )
    ).toBe(true);
    expect(
      ability.can(
        ProjectPermissionSecretActions.Edit,
        subject(ProjectPermissionSub.Secrets, { environment: "staging", secretPath: "/a/b" })
      )
    ).toBe(true);
    // folder-only scope: subfolders fall back to the base permissions
    expect(
      ability.can(
        ProjectPermissionSecretActions.Edit,
        subject(ProjectPermissionSub.Secrets, { environment: "dev", secretPath: "/a/b/c" })
      )
    ).toBe(true);
  });

  test("should leave subjects without a secretPath condition to the base role", () => {
    const ability = abilityFor(adminRoles, [privilege({ role: SecretFolderRole.Read })]);

    expect(
      ability.can(ProjectPermissionSecretApprovalRequestActions.Read, ProjectPermissionSub.SecretApprovalRequest)
    ).toBe(true);
    expect(ability.can(ProjectPermissionActions.Read, ProjectPermissionSub.SecretApproval)).toBe(true);
  });

  test("should require the read tier for secret event subscriptions at the path", () => {
    const grantedPath = { environment: "dev", secretPath: "/a/b" };

    const readAbility = abilityFor(adminRoles, [privilege({ role: SecretFolderRole.Read })]);
    expect(
      readAbility.can(
        ProjectPermissionSecretEventActions.SubscribeToCreationEvents,
        subject(ProjectPermissionSub.SecretEventSubscriptions, grantedPath)
      )
    ).toBe(true);

    const listAbility = abilityFor(adminRoles, [privilege({ role: SecretFolderRole.List })]);
    expect(
      listAbility.can(
        ProjectPermissionSecretEventActions.SubscribeToCreationEvents,
        subject(ProjectPermissionSub.SecretEventSubscriptions, grantedPath)
      )
    ).toBe(false);
  });

  test("should require the read tier for commit history at the path", () => {
    const grantedPath = { environment: "dev", secretPath: "/a/b" };

    const readAbility = abilityFor(adminRoles, [privilege({ role: SecretFolderRole.Read })]);
    expect(
      readAbility.can(ProjectPermissionCommitsActions.Read, subject(ProjectPermissionSub.Commits, grantedPath))
    ).toBe(true);

    const listAbility = abilityFor(adminRoles, [privilege({ role: SecretFolderRole.List })]);
    expect(
      listAbility.can(ProjectPermissionCommitsActions.Read, subject(ProjectPermissionSub.Commits, grantedPath))
    ).toBe(false);
  });

  test("should strip commit rollback at the granted path only", () => {
    const ability = abilityFor(adminRoles, [privilege({ role: SecretFolderRole.Read })]);

    expect(
      ability.can(
        ProjectPermissionCommitsActions.PerformRollback,
        subject(ProjectPermissionSub.Commits, { environment: "dev", secretPath: "/a/b" })
      )
    ).toBe(false);

    expect(
      ability.can(
        ProjectPermissionCommitsActions.PerformRollback,
        subject(ProjectPermissionSub.Commits, { environment: "dev", secretPath: "/other" })
      )
    ).toBe(true);
    expect(
      ability.can(
        ProjectPermissionCommitsActions.PerformRollback,
        subject(ProjectPermissionSub.Commits, { environment: "staging", secretPath: "/a/b" })
      )
    ).toBe(true);
    expect(
      ability.can(
        ProjectPermissionCommitsActions.PerformRollback,
        subject(ProjectPermissionSub.Commits, { environment: "dev", secretPath: "/a/b/c" })
      )
    ).toBe(true);
  });

  test("should let no folder role tier perform a commit rollback at the granted path", () => {
    const grantedPath = { environment: "dev", secretPath: "/a/b" };

    Object.values(SecretFolderRole).forEach((role) => {
      const ability = abilityFor(adminRoles, [privilege({ role })]);

      expect(
        ability.can(
          ProjectPermissionCommitsActions.PerformRollback,
          subject(ProjectPermissionSub.Commits, grantedPath)
        ),
        `folder role '${role}' must not grant commit rollback at the granted path`
      ).toBe(false);
    });
  });

  test("should let an edit grant give a viewer more than their base role at the granted path", () => {
    const ability = abilityFor(viewerRoles, [privilege({ role: SecretFolderRole.Edit })]);

    const grantedPath = { environment: "dev", secretPath: "/a/b" };
    expect(ability.can(ProjectPermissionSecretActions.Create, subject(ProjectPermissionSub.Secrets, grantedPath))).toBe(
      true
    );
    expect(
      ability.can(ProjectPermissionSecretActions.ReadValue, subject(ProjectPermissionSub.Secrets, grantedPath))
    ).toBe(true);
    expect(
      ability.can(
        ProjectPermissionSecretFolderActions.ManageAccess,
        subject(ProjectPermissionSub.SecretFolders, { environment: "dev", secretPath: "/a/b" })
      )
    ).toBe(false);
  });

  test("should let only a full-access grant delegate access", () => {
    const ability = abilityFor(viewerRoles, [privilege({ role: SecretFolderRole.FullAccess })]);

    const grantedPath = { environment: "dev", secretPath: "/a/b" };
    expect(
      ability.can(
        ProjectPermissionSecretFolderActions.ManageAccess,
        subject(ProjectPermissionSub.SecretFolders, grantedPath)
      )
    ).toBe(true);
    expect(
      ability.can(
        ProjectPermissionSecretFolderActions.ManageAccess,
        subject(ProjectPermissionSub.SecretFolders, { environment: "dev", secretPath: "/other" })
      )
    ).toBe(false);
  });

  test("should union the tiers of two grants on the same path", () => {
    const ability = abilityFor(viewerRoles, [
      privilege({ id: "privilege-1", role: SecretFolderRole.List }),
      privilege({ id: "privilege-2", role: SecretFolderRole.Edit })
    ]);

    const grantedPath = { environment: "dev", secretPath: "/a/b" };
    expect(
      ability.can(ProjectPermissionSecretActions.DescribeSecret, subject(ProjectPermissionSub.Secrets, grantedPath))
    ).toBe(true);
    expect(ability.can(ProjectPermissionSecretActions.Create, subject(ProjectPermissionSub.Secrets, grantedPath))).toBe(
      true
    );
  });

  test("should scope grants on different paths independently", () => {
    const ability = abilityFor(adminRoles, [
      privilege({ id: "privilege-1", role: SecretFolderRole.Read, secretPath: "/a/b" }),
      privilege({ id: "privilege-2", role: SecretFolderRole.Edit, secretPath: "/x" })
    ]);

    expect(
      ability.can(
        ProjectPermissionSecretActions.Edit,
        subject(ProjectPermissionSub.Secrets, { environment: "dev", secretPath: "/a/b" })
      )
    ).toBe(false);
    expect(
      ability.can(
        ProjectPermissionSecretActions.ReadValue,
        subject(ProjectPermissionSub.Secrets, { environment: "dev", secretPath: "/a/b" })
      )
    ).toBe(true);
    expect(
      ability.can(
        ProjectPermissionSecretActions.Edit,
        subject(ProjectPermissionSub.Secrets, { environment: "dev", secretPath: "/x" })
      )
    ).toBe(true);
  });

  test("should refuse an unknown folder role", () => {
    const build = () => folderRules([privilege(), privilege({ id: "bad-grant", role: "superuser" })]);

    expect(build).toThrow(EntityNotFoundError);
    expect(build).toThrow(
      expect.objectContaining({
        name: "FolderRoleInvalid",
        message: "Folder access role 'superuser' on grant with ID 'bad-grant' not found"
      }) as Error
    );
  });

  test("should leave the role rules untouched when there are no folder grants", () => {
    expect(abilityFor(adminRoles, []).rules).toEqual(roleRules(adminRoles).rules);
  });
});

describe("FolderRoles.filterOverriddenDenyRules", () => {
  const denyActionsFor = (rules: RawRuleOf<MongoAbility<ProjectPermissionSet>>[], sub: string) =>
    rules
      .filter((rule) => rule.inverted && String(rule.subject) === sub)
      .flatMap((rule) => [rule.action].flat().map(String));

  test("should drop only the deny actions the folder role re-allows", () => {
    const rules = folderRules([privilege({ role: SecretFolderRole.Read })]);
    const filtered = FolderRoles.filterOverriddenDenyRules(rules);

    expect(denyActionsFor(filtered, ProjectPermissionSub.Secrets).sort()).toEqual(
      [
        ProjectPermissionSecretActions.DescribeAndReadValue,
        ProjectPermissionSecretActions.Create,
        ProjectPermissionSecretActions.Edit,
        ProjectPermissionSecretActions.Delete
      ].sort()
    );
    expect(denyActionsFor(filtered, ProjectPermissionSub.SecretFolders).sort()).toEqual(
      [
        ProjectPermissionActions.Create,
        ProjectPermissionActions.Edit,
        ProjectPermissionActions.Delete,
        ProjectPermissionSecretFolderActions.ManageAccess
      ].sort()
    );
  });

  test("should keep every allow rule and drop a fully re-allowed deny rule", () => {
    const rules = folderRules([privilege({ role: SecretFolderRole.Read })]);
    const filtered = FolderRoles.filterOverriddenDenyRules(rules);

    expect(filtered.filter((rule) => !rule.inverted)).toEqual(rules.filter((rule) => !rule.inverted));
    expect(denyActionsFor(filtered, ProjectPermissionSub.SecretEventSubscriptions)).toEqual([]);
  });

  test("should keep the commit rollback deny on every tier and drop the read deny from the read tier up", () => {
    const readTier = FolderRoles.filterOverriddenDenyRules(folderRules([privilege({ role: SecretFolderRole.Read })]));
    expect(denyActionsFor(readTier, ProjectPermissionSub.Commits)).toEqual([
      ProjectPermissionCommitsActions.PerformRollback
    ]);

    const listTier = FolderRoles.filterOverriddenDenyRules(folderRules([privilege({ role: SecretFolderRole.List })]));
    expect(denyActionsFor(listTier, ProjectPermissionSub.Commits).sort()).toEqual(
      [ProjectPermissionCommitsActions.Read, ProjectPermissionCommitsActions.PerformRollback].sort()
    );
  });
});

// The boundary reads an ability literally, with no notion of CASL's last-match-wins, so the deny half
// of a folder grant used to make its own holder look barred from the path the grant opens.
describe("FolderGrant.allowPermission", () => {
  // How `$folderScopedGrantAbilities` presents a target's grant: the denies are dropped because the
  // boundary walks the subset's rules as if each were a grant.
  const grantAbility = (privileges: FolderGrant[]) => privileges[0].allowPermission().toAbility();

  test("should not let a grant bound out an identical grant", () => {
    const actor = abilityFor(memberRoles, [privilege()]);

    expect(validatePermissionBoundary(actor, grantAbility([privilege()]))).toEqual({ isValid: true });
  });

  test("should hold equal access on the list tier, whose denies are only partly re-allowed", () => {
    const actor = abilityFor(memberRoles, [privilege({ role: SecretFolderRole.List })]);

    expect(validatePermissionBoundary(actor, grantAbility([privilege({ role: SecretFolderRole.List })]))).toEqual({
      isValid: true
    });
  });

  test("should not let a lower tier bound a higher one at the same path", () => {
    const actor = abilityFor(memberRoles, [privilege({ role: SecretFolderRole.Read })]);

    expect(validatePermissionBoundary(actor, grantAbility([privilege({ role: SecretFolderRole.Edit })])).isValid).toBe(
      false
    );
  });

  test("should not let a grant on another path bound one at the granted path", () => {
    const actor = abilityFor(viewerRoles, [privilege({ secretPath: "/x" })]);

    expect(validatePermissionBoundary(actor, grantAbility([privilege({ secretPath: "/a/b" })])).isValid).toBe(false);
  });

  // The deny half still has to strip the base role at the granted path: a member reads every path
  // except the one their grant narrows to list-only.
  test("should still strip what the base role would have allowed at the granted path", () => {
    const actor = abilityFor(memberRoles, [privilege({ role: SecretFolderRole.List })]);
    const target = createMongoAbility<ProjectPermissionSet>(
      [
        {
          action: ProjectPermissionSecretActions.ReadValue,
          subject: ProjectPermissionSub.Secrets,
          conditions: { environment: "dev", secretPath: "/a/b" }
        }
      ] as RawRuleOf<MongoAbility<ProjectPermissionSet>>[],
      { conditionsMatcher }
    );

    expect(validatePermissionBoundary(actor, target).isValid).toBe(false);
  });
});
