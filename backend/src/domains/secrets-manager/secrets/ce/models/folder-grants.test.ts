import { createMongoAbility, MongoAbility, RawRuleOf, subject } from "@casl/ability";
import { vi } from "vitest";
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
import { logger } from "@app/lib/logger";

import { FolderGrant, TFolderGrantRecord } from "./folder-grant";
import { FolderGrants } from "./folder-grants";
import { FOLDER_SCOPED_DENY_RULES, FolderRoles } from "./folder-roles";

vi.mock("@app/lib/logger", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));

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

const recursiveRoot = (role: SecretFolderRole) =>
  privilege({ id: "root-grant", folderId: "root-folder", role, secretPath: "/", appliesToSubfolders: true });

const adminRoles = [ProjectMembershipRole.Admin];
const memberRoles = [ProjectMembershipRole.Member];
const viewerRoles = [ProjectMembershipRole.Viewer];
const noAccessRoles = [ProjectMembershipRole.NoAccess];

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

  test.each(Object.values(SecretFolderRole))(
    "should ignore and log a recursive %s grant on a folder other than the root",
    (role) => {
      // Setup
      vi.mocked(logger.warn).mockClear();
      const recursiveSubfolder = privilege({
        id: "subfolder-grant",
        role,
        secretPath: "/a",
        appliesToSubfolders: true
      });
      const exactEdit = privilege({ id: "exact-grant", role: SecretFolderRole.Edit, secretPath: "/b" });

      // Action
      const alone = folderRules([recursiveSubfolder]);
      const withExact = folderRules([recursiveSubfolder, exactEdit]);
      const merged = roleRules(noAccessRoles).then(FolderGrants.inForce([recursiveSubfolder]).rules());

      // Assert
      expect(alone).toEqual([]);
      expect(withExact).toEqual(folderRules([exactEdit]));
      expect(merged.rules).toEqual(roleRules(noAccessRoles).rules);
      expect(logger.warn).toHaveBeenCalledTimes(3);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("grantId=subfolder-grant"));
    }
  );

  test("should accept a recursive grant on the root of each environment", () => {
    // Setup
    const ability = abilityFor(noAccessRoles, [
      recursiveRoot(SecretFolderRole.Edit),
      privilege({
        id: "staging-root-grant",
        role: SecretFolderRole.Read,
        secretPath: "/",
        environmentSlug: "staging",
        appliesToSubfolders: true
      })
    ]);
    const canCreateFoldersIn = (environment: string) =>
      ability.can(
        ProjectPermissionActions.Create,
        subject(ProjectPermissionSub.SecretFolders, { environment, secretPath: "/a" })
      );

    // Assert
    expect(canCreateFoldersIn("dev")).toBe(true);
    expect(canCreateFoldersIn("staging")).toBe(false);
  });

  test("should leave the role rules untouched when there are no folder grants", () => {
    expect(abilityFor(adminRoles, []).rules).toEqual(roleRules(adminRoles).rules);
  });
});

describe("FolderGrants.rules with grants that apply to subfolders", () => {
  const secretsAt = (environment: string, secretPath: string) =>
    subject(ProjectPermissionSub.Secrets, { environment, secretPath });
  const foldersAt = (environment: string, secretPath: string) =>
    subject(ProjectPermissionSub.SecretFolders, { environment, secretPath });

  test("should apply a recursive root grant to every folder of its environment", () => {
    // Setup
    const ability = abilityFor(memberRoles, [recursiveRoot(SecretFolderRole.Read)]);

    // Assert
    ["/", "/a", "/a/b/c"].forEach((secretPath) => {
      expect(ability.can(ProjectPermissionSecretActions.ReadValue, secretsAt("dev", secretPath))).toBe(true);
      expect(ability.can(ProjectPermissionSecretActions.Edit, secretsAt("dev", secretPath))).toBe(false);
    });
    expect(ability.can(ProjectPermissionSecretActions.Edit, secretsAt("staging", "/a/b/c"))).toBe(true);
  });

  test("should let an exact higher-tier grant override the recursive grant at its folder only, in either input order", () => {
    // Setup
    const exactEdit = privilege({ id: "sub-grant", role: SecretFolderRole.Edit, secretPath: "/a/b" });

    [
      [recursiveRoot(SecretFolderRole.Read), exactEdit],
      [exactEdit, recursiveRoot(SecretFolderRole.Read)]
    ].forEach((privileges) => {
      // Action
      const ability = abilityFor(memberRoles, privileges);

      // Assert
      expect(ability.can(ProjectPermissionSecretActions.Create, secretsAt("dev", "/a/b"))).toBe(true);
      expect(ability.can(ProjectPermissionSecretActions.Create, secretsAt("dev", "/a"))).toBe(false);
      expect(ability.can(ProjectPermissionSecretActions.Create, secretsAt("dev", "/a/b/c"))).toBe(false);
      expect(ability.can(ProjectPermissionSecretActions.ReadValue, secretsAt("dev", "/a/b/c"))).toBe(true);
      expect(ability.can(ProjectPermissionSecretFolderActions.ManageAccess, foldersAt("dev", "/a/b"))).toBe(false);
    });
  });

  test("should let an exact lower-tier grant narrow the recursive grant at its folder only", () => {
    // Setup
    const ability = abilityFor(memberRoles, [
      recursiveRoot(SecretFolderRole.Edit),
      privilege({ id: "sub-grant", role: SecretFolderRole.List, secretPath: "/a/b" })
    ]);

    // Assert
    expect(ability.can(ProjectPermissionSecretActions.ReadValue, secretsAt("dev", "/a/b"))).toBe(false);
    expect(ability.can(ProjectPermissionSecretActions.DescribeSecret, secretsAt("dev", "/a/b"))).toBe(true);
    expect(ability.can(ProjectPermissionSecretActions.ReadValue, secretsAt("dev", "/a/b/c"))).toBe(true);
    expect(ability.can(ProjectPermissionSecretActions.Create, secretsAt("dev", "/a"))).toBe(true);
    expect(ability.can(ProjectPermissionActions.Create, foldersAt("dev", "/a/b"))).toBe(false);
    expect(ability.can(ProjectPermissionActions.Create, foldersAt("dev", "/a/b/c"))).toBe(true);
  });

  test("should scope a recursive grant to its environment", () => {
    // Setup
    const ability = abilityFor(memberRoles, [
      recursiveRoot(SecretFolderRole.Read),
      privilege({ id: "staging-root", role: SecretFolderRole.Edit, secretPath: "/", environmentSlug: "staging" })
    ]);

    // Assert
    expect(ability.can(ProjectPermissionSecretActions.Edit, secretsAt("staging", "/"))).toBe(true);
    expect(ability.can(ProjectPermissionSecretActions.Edit, secretsAt("staging", "/a"))).toBe(true);
    expect(ability.can(ProjectPermissionSecretActions.Edit, secretsAt("dev", "/a"))).toBe(false);
    expect(ability.can(ProjectPermissionSecretActions.ReadValue, secretsAt("dev", "/a"))).toBe(true);
  });

  test.each([SecretFolderRole.Edit, SecretFolderRole.Manage, SecretFolderRole.FullAccess])(
    "should let a recursive %s grant create and edit folders across the subtree",
    (role) => {
      // Setup
      const ability = abilityFor(viewerRoles, [recursiveRoot(role)]);

      // Assert
      expect(ability.can(ProjectPermissionActions.Create, foldersAt("dev", "/"))).toBe(true);
      expect(ability.can(ProjectPermissionActions.Create, foldersAt("dev", "/a/b"))).toBe(true);
      expect(ability.can(ProjectPermissionActions.Edit, foldersAt("dev", "/a/b"))).toBe(true);
      expect(ability.can(ProjectPermissionActions.Create, foldersAt("staging", "/"))).toBe(false);
    }
  );

  test.each([SecretFolderRole.List, SecretFolderRole.Read])(
    "should not let a recursive %s grant create or edit folders",
    (role) => {
      // Setup
      const ability = abilityFor(viewerRoles, [recursiveRoot(role)]);

      // Assert
      ["/", "/a/b"].forEach((secretPath) => {
        expect(ability.can(ProjectPermissionActions.Create, foldersAt("dev", secretPath))).toBe(false);
        expect(ability.can(ProjectPermissionActions.Edit, foldersAt("dev", secretPath))).toBe(false);
      });
    }
  );

  describe("folder create and edit under a recursive grant", () => {
    const folderEditingRoles = [SecretFolderRole.Edit, SecretFolderRole.Manage, SecretFolderRole.FullAccess];
    const canEditFoldersAt = (ability: ReturnType<typeof abilityFor>, environment: string, secretPath: string) => ({
      create: ability.can(ProjectPermissionActions.Create, foldersAt(environment, secretPath)),
      edit: ability.can(ProjectPermissionActions.Edit, foldersAt(environment, secretPath))
    });
    const exactPayments = (role: SecretFolderRole) =>
      privilege({ id: "payments-grant", role, secretPath: "/payments" });

    describe.each([
      ["no-access", noAccessRoles],
      ["viewer", viewerRoles],
      ["member", memberRoles]
    ] as const)("on a %s base role", (_, baseRoles) => {
      test.each(
        folderEditingRoles.flatMap((recursiveRole) => folderEditingRoles.map((exactRole) => [recursiveRole, exactRole]))
      )(
        "should keep folder create and edit for a recursive %s grant under an exact %s grant",
        (recursiveRole, exactRole) => {
          // Setup
          const ability = abilityFor(baseRoles, [recursiveRoot(recursiveRole), exactPayments(exactRole)]);

          // Assert
          expect(canEditFoldersAt(ability, "dev", "/payments")).toEqual({ create: true, edit: true });
          expect(canEditFoldersAt(ability, "dev", "/payments/deep")).toEqual({ create: true, edit: true });
        }
      );

      test.each(
        folderEditingRoles.flatMap((recursiveRole) =>
          [SecretFolderRole.List, SecretFolderRole.Read].map((exactRole) => [recursiveRole, exactRole])
        )
      )(
        "should drop folder create and edit for a recursive %s grant under an exact %s grant at that folder only",
        (recursiveRole, exactRole) => {
          // Setup
          const ability = abilityFor(baseRoles, [recursiveRoot(recursiveRole), exactPayments(exactRole)]);

          // Assert
          expect(canEditFoldersAt(ability, "dev", "/payments")).toEqual({ create: false, edit: false });
          expect(canEditFoldersAt(ability, "dev", "/payments/deep")).toEqual({ create: true, edit: true });
        }
      );

      test.each(
        [SecretFolderRole.List, SecretFolderRole.Read].flatMap((recursiveRole) =>
          folderEditingRoles.map((exactRole) => [recursiveRole, exactRole])
        )
      )(
        "should not give folder create or edit from a recursive %s grant to an exact %s grant",
        (recursiveRole, exactRole) => {
          // Setup
          const ability = abilityFor(baseRoles, [recursiveRoot(recursiveRole), exactPayments(exactRole)]);

          // Assert
          expect(canEditFoldersAt(ability, "dev", "/payments")).toEqual({ create: false, edit: false });
        }
      );
    });

    test("should not keep folder create and edit for an exact grant when the recursive grant is in another environment", () => {
      // Setup
      const ability = abilityFor(memberRoles, [
        recursiveRoot(SecretFolderRole.Edit),
        privilege({
          id: "staging-grant",
          role: SecretFolderRole.FullAccess,
          secretPath: "/payments",
          environmentSlug: "staging"
        })
      ]);

      // Assert
      expect(canEditFoldersAt(ability, "staging", "/payments")).toEqual({ create: false, edit: false });
      expect(canEditFoldersAt(ability, "dev", "/payments")).toEqual({ create: true, edit: true });
    });

    test("should keep only folder create and edit from the recursive grant for an exact grant, not its other access", () => {
      // Setup
      const ability = abilityFor(memberRoles, [
        recursiveRoot(SecretFolderRole.FullAccess),
        exactPayments(SecretFolderRole.Edit)
      ]);

      // Assert
      expect(canEditFoldersAt(ability, "dev", "/payments")).toEqual({ create: true, edit: true });
      expect(ability.can(ProjectPermissionSecretFolderActions.ManageAccess, foldersAt("dev", "/payments"))).toBe(false);
      expect(ability.can(ProjectPermissionActions.Delete, foldersAt("dev", "/payments"))).toBe(false);
    });
  });

  test.each(Object.values(SecretFolderRole))(
    "should not open folder create or edit for an exact %s grant on the root",
    (role) => {
      // Setup
      const ability = abilityFor(memberRoles, [privilege({ role, secretPath: "/" })]);

      // Assert
      expect(ability.can(ProjectPermissionActions.Create, foldersAt("dev", "/"))).toBe(false);
      expect(ability.can(ProjectPermissionActions.Edit, foldersAt("dev", "/"))).toBe(false);
      expect(ability.can(ProjectPermissionActions.Create, foldersAt("dev", "/a"))).toBe(true);
    }
  );

  test("should build recursive rules before exact rules, denies before allows within each", () => {
    // Setup
    const grants = [
      privilege({ id: "sub-grant", role: SecretFolderRole.Edit, secretPath: "/a/b" }),
      recursiveRoot(SecretFolderRole.Read)
    ];
    const isRecursiveRule = (rule: RawRuleOf<MongoAbility<ProjectPermissionSet>>) =>
      typeof (rule.conditions as { secretPath?: unknown } | undefined)?.secretPath === "object";

    // Action
    const rules = folderRules(grants);
    const recursiveFlags = rules.map(isRecursiveRule);

    // Assert
    expect(recursiveFlags.lastIndexOf(true)).toBeGreaterThan(-1);
    expect(recursiveFlags.indexOf(false)).toBeGreaterThan(recursiveFlags.lastIndexOf(true));
    rules.filter(isRecursiveRule).forEach((rule) => {
      expect(rule.conditions).toEqual({ environment: "dev", secretPath: { $glob: "/**" } });
    });
    [rules.filter(isRecursiveRule), rules.filter((rule) => !isRecursiveRule(rule))].forEach((group) => {
      const inverted = group.map((rule) => Boolean(rule.inverted));

      expect(inverted.indexOf(false)).toBeGreaterThan(inverted.lastIndexOf(true));
    });
  });
});

describe("FolderGrants.rules with recursive and exact grants together", () => {
  const roles = Object.values(SecretFolderRole);
  const bases = [
    ["no-access", noAccessRoles],
    ["member", memberRoles]
  ] as const;
  const toArray = <T>(value: T | T[]): T[] => (Array.isArray(value) ? value : [value]);
  // Whether an exact grant keeps folder create and edit under a recursive grant is its own rule, tested above.
  const isFolderCreateOrEdit = (subjectName: string, action: string) =>
    subjectName === ProjectPermissionSub.SecretFolders &&
    (action === ProjectPermissionActions.Create || action === ProjectPermissionActions.Edit);
  const probes = FOLDER_SCOPED_DENY_RULES.flatMap((rule) =>
    toArray(rule.subject as string | string[]).flatMap((subjectName) =>
      toArray(rule.action as string | string[])
        .filter((action) => !isFolderCreateOrEdit(subjectName, action))
        .map((action) => ({ subjectName, action }))
    )
  );
  const capabilitiesAt = (ability: ReturnType<typeof abilityFor>, environment: string, secretPath: string) =>
    Object.fromEntries(
      probes.map(({ subjectName, action }) => [
        `${subjectName}:${action}`,
        ability.can(action as never, subject(subjectName, { environment, secretPath }) as never)
      ])
    );
  const exactAt = (role: SecretFolderRole, secretPath: string) =>
    privilege({ id: `exact-${secretPath}`, role, secretPath });
  const secretsAt = (secretPath: string) => subject(ProjectPermissionSub.Secrets, { environment: "dev", secretPath });
  const foldersAt = (secretPath: string) =>
    subject(ProjectPermissionSub.SecretFolders, { environment: "dev", secretPath });

  describe.each(bases)("on a %s base role", (_, baseRoles) => {
    test.each(roles.flatMap((recursiveRole) => roles.map((exactRole) => [recursiveRole, exactRole] as const)))(
      "should let the exact role decide its folder and the recursive role every other folder for recursive %s with exact %s",
      (recursiveRole, exactRole) => {
        // Setup
        const ability = abilityFor(baseRoles, [recursiveRoot(recursiveRole), exactAt(exactRole, "/a/b")]);
        const onlyExact = abilityFor(baseRoles, [exactAt(exactRole, "/a/b")]);
        const onlyRecursive = abilityFor(baseRoles, [recursiveRoot(recursiveRole)]);

        // Assert
        expect(capabilitiesAt(ability, "dev", "/a/b")).toEqual(capabilitiesAt(onlyExact, "dev", "/a/b"));
        ["/", "/a", "/a/b/c", "/x"].forEach((secretPath) => {
          expect(capabilitiesAt(ability, "dev", secretPath)).toEqual(capabilitiesAt(onlyRecursive, "dev", secretPath));
        });
      }
    );

    test.each(roles)(
      "should let a recursive %s grant replace the base role everywhere in its environment",
      (recursiveRole) => {
        // Setup
        const ability = abilityFor(baseRoles, [recursiveRoot(recursiveRole)]);
        const onNoAccess = abilityFor(noAccessRoles, [recursiveRoot(recursiveRole)]);

        // Assert
        ["/", "/a", "/a/b/c"].forEach((secretPath) => {
          expect(capabilitiesAt(ability, "dev", secretPath)).toEqual(capabilitiesAt(onNoAccess, "dev", secretPath));
        });
      }
    );

    test.each(roles)("should leave other environments on the base role for a recursive %s grant", (recursiveRole) => {
      // Setup
      const ability = abilityFor(baseRoles, [recursiveRoot(recursiveRole), exactAt(SecretFolderRole.List, "/a")]);
      const baseOnly = abilityFor(baseRoles);

      // Assert
      ["/", "/a", "/a/b"].forEach((secretPath) => {
        expect(capabilitiesAt(ability, "staging", secretPath)).toEqual(capabilitiesAt(baseOnly, "staging", secretPath));
      });
    });
  });

  test("should give exact grants more than the recursive grant at one folder and less at another", () => {
    // Setup
    const ability = abilityFor(memberRoles, [
      recursiveRoot(SecretFolderRole.Read),
      exactAt(SecretFolderRole.FullAccess, "/payments"),
      exactAt(SecretFolderRole.List, "/billing")
    ]);

    // Assert
    expect(ability.can(ProjectPermissionSecretActions.Delete, secretsAt("/payments"))).toBe(true);
    expect(ability.can(ProjectPermissionSecretFolderActions.ManageAccess, foldersAt("/payments"))).toBe(true);
    expect(ability.can(ProjectPermissionSecretActions.ReadValue, secretsAt("/billing"))).toBe(false);
    expect(ability.can(ProjectPermissionSecretActions.DescribeSecret, secretsAt("/billing"))).toBe(true);
    ["/", "/payments/deep", "/billing/deep", "/other"].forEach((secretPath) => {
      expect(ability.can(ProjectPermissionSecretActions.ReadValue, secretsAt(secretPath))).toBe(true);
      expect(ability.can(ProjectPermissionSecretActions.Delete, secretsAt(secretPath))).toBe(false);
      expect(ability.can(ProjectPermissionSecretFolderActions.ManageAccess, foldersAt(secretPath))).toBe(false);
    });
  });

  test.each(roles)("should reach the root folder only for an exact %s grant on the root", (role) => {
    // Setup
    const ability = abilityFor(noAccessRoles, [privilege({ role, secretPath: "/" })]);
    const baseOnly = abilityFor(noAccessRoles);

    // Assert
    expect(ability.can(ProjectPermissionSecretActions.DescribeSecret, secretsAt("/"))).toBe(true);
    ["/a", "/a/b"].forEach((secretPath) => {
      expect(capabilitiesAt(ability, "dev", secretPath)).toEqual(capabilitiesAt(baseOnly, "dev", secretPath));
    });
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

  test("should drop the folder create and edit denies only for a recursive grant of the edit tier and above", () => {
    // Setup
    const folderDenies = (role: SecretFolderRole, appliesToSubfolders: boolean) =>
      denyActionsFor(
        FolderRoles.filterOverriddenDenyRules(folderRules([privilege({ role, secretPath: "/", appliesToSubfolders })])),
        ProjectPermissionSub.SecretFolders
      ).sort();
    const everyFolderDeny = [
      ProjectPermissionActions.Create,
      ProjectPermissionActions.Edit,
      ProjectPermissionActions.Delete,
      ProjectPermissionSecretFolderActions.ManageAccess
    ].sort();

    // Assert
    expect(folderDenies(SecretFolderRole.Edit, true)).toEqual(
      [ProjectPermissionActions.Delete, ProjectPermissionSecretFolderActions.ManageAccess].sort()
    );
    expect(folderDenies(SecretFolderRole.Read, true)).toEqual(everyFolderDeny);
    expect(folderDenies(SecretFolderRole.Edit, false)).toEqual(everyFolderDeny);
    expect(folderDenies(SecretFolderRole.FullAccess, true)).toEqual([]);
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

  test("should let a recursive root grant bound a grant of the same tier anywhere below it", () => {
    // Setup
    const actor = abilityFor(noAccessRoles, [recursiveRoot(SecretFolderRole.Read)]);

    // Assert
    expect(
      validatePermissionBoundary(actor, grantAbility([privilege({ role: SecretFolderRole.Read, secretPath: "/a/b" })]))
    ).toEqual({ isValid: true });
    expect(validatePermissionBoundary(actor, grantAbility([recursiveRoot(SecretFolderRole.Read)]))).toEqual({
      isValid: true
    });
    expect(
      validatePermissionBoundary(actor, grantAbility([privilege({ role: SecretFolderRole.Edit, secretPath: "/a/b" })]))
        .isValid
    ).toBe(false);
  });

  test("should not let an exact root grant bound a grant below the root or a recursive one", () => {
    // Setup
    const actor = abilityFor(noAccessRoles, [privilege({ role: SecretFolderRole.Read, secretPath: "/" })]);

    // Assert
    expect(
      validatePermissionBoundary(actor, grantAbility([privilege({ role: SecretFolderRole.Read, secretPath: "/a/b" })]))
        .isValid
    ).toBe(false);
    expect(validatePermissionBoundary(actor, grantAbility([recursiveRoot(SecretFolderRole.Read)])).isValid).toBe(false);
  });

  test("should block bounding a recursive grant while a lower-tier exact grant exists anywhere in the environment", () => {
    // Setup
    const actor = abilityFor(memberRoles, [privilege({ role: SecretFolderRole.List, secretPath: "/x" })]);

    // Assert
    expect(validatePermissionBoundary(actor, grantAbility([recursiveRoot(SecretFolderRole.Read)])).isValid).toBe(false);
  });

  test("should stay fail-closed where a recursive deny overlaps an exact grant the actor holds", () => {
    // Setup
    const exactEdit = privilege({ id: "sub-grant", role: SecretFolderRole.Edit, secretPath: "/a/b" });
    const actor = abilityFor(noAccessRoles, [recursiveRoot(SecretFolderRole.List), exactEdit]);

    // Assert
    expect(
      actor.can(
        ProjectPermissionSecretActions.Create,
        subject(ProjectPermissionSub.Secrets, { environment: "dev", secretPath: "/a/b" })
      )
    ).toBe(true);
    expect(validatePermissionBoundary(actor, grantAbility([exactEdit])).isValid).toBe(false);
  });
});
