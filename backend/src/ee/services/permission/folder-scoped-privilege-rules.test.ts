import { createMongoAbility, MongoAbility, RawRuleOf, subject } from "@casl/ability";
import { z } from "zod";

import { ProjectMembershipRole, ProjectType, SecretFolderRole } from "@app/db/schemas";
import { conditionsMatcher } from "@app/lib/casl";
import { NotFoundError } from "@app/lib/errors";

import { FOLDER_SCOPED_DENY_RULES } from "./folder-roles";
import { buildFolderScopedPrivilegeRules } from "./permission-fns";
import { buildProjectPermissionRules } from "./permission-service";
import { TProjectFolderScopedPrivilege } from "./permission-service-types";
import {
  ProjectPermissionActions,
  ProjectPermissionCommitsActions,
  ProjectPermissionDynamicSecretActions,
  ProjectPermissionHoneyTokenActions,
  ProjectPermissionProjectFolderGrantActions,
  ProjectPermissionProxiedServiceActions,
  ProjectPermissionSecretActions,
  ProjectPermissionSecretApprovalRequestActions,
  ProjectPermissionSecretEventActions,
  ProjectPermissionSecretFolderActions,
  ProjectPermissionSecretRotationActions,
  ProjectPermissionSecretSyncActions,
  ProjectPermissionSet,
  ProjectPermissionSub,
  ProjectPermissionV2Schema
} from "./project-permission";

const privilege = (overrides: Partial<TProjectFolderScopedPrivilege> = {}): TProjectFolderScopedPrivilege => ({
  id: "privilege-id",
  folderId: "folder-id",
  role: SecretFolderRole.Read,
  environmentSlug: "dev",
  secretPath: "/a/b",
  ...overrides
});

const adminRoles = [{ role: ProjectMembershipRole.Admin, permissions: [] }];
const viewerRoles = [{ role: ProjectMembershipRole.Viewer, permissions: [] }];

const abilityFor = (roles: { role: string; permissions?: unknown }[], privileges?: TProjectFolderScopedPrivilege[]) =>
  createMongoAbility<ProjectPermissionSet>(
    buildProjectPermissionRules(roles, ProjectType.SecretManager, privileges) as RawRuleOf<
      MongoAbility<ProjectPermissionSet>
    >[],
    { conditionsMatcher }
  );

describe("folder-scoped privilege deny coverage", () => {
  // Subjects that support a secretPath condition but are deliberately NOT denied at granted folder
  // paths: no folder role tier re-allows them, so the base project role keeps applying there.
  const DENY_EXEMPT_SUBJECTS: string[] = [ProjectPermissionSub.ProxiedServices];

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

  test("every deny rule is inverted and every subject appears exactly once", () => {
    expect(FOLDER_SCOPED_DENY_RULES.every((rule) => rule.inverted)).toBe(true);
    expect(FOLDER_SCOPED_DENY_RULES).toHaveLength(Object.keys(deniedActionsBySubject).length);
  });

  test("every secretPath-scoped subject is denied at the granted folder path", () => {
    expect(
      [...new Set(Object.keys(deniedActionsBySubject))].sort(),
      "A subject that supports a secretPath condition was added or removed. Update FOLDER_SCOPED_DENY_RULES in folder-roles.ts and review whether the SECRET_FOLDER_ROLE_PERMISSIONS tiers should grant the new subject's actions."
    ).toEqual([...new Set(secretPathScopedSubjects)].sort());
  });

  const ALL_ACTIONS_BY_SUBJECT: Record<string, string[]> = {
    [ProjectPermissionSub.Secrets]: Object.values(ProjectPermissionSecretActions),
    [ProjectPermissionSub.SecretFolders]: Object.values(ProjectPermissionActions),
    [ProjectPermissionSub.SecretImports]: Object.values(ProjectPermissionActions),
    [ProjectPermissionSub.DynamicSecrets]: Object.values(ProjectPermissionDynamicSecretActions),
    [ProjectPermissionSub.SecretSyncs]: Object.values(ProjectPermissionSecretSyncActions),
    [ProjectPermissionSub.SecretRotation]: Object.values(ProjectPermissionSecretRotationActions),
    [ProjectPermissionSub.SecretEventSubscriptions]: Object.values(ProjectPermissionSecretEventActions),
    [ProjectPermissionSub.Commits]: Object.values(ProjectPermissionCommitsActions),
    [ProjectPermissionSub.HoneyTokens]: Object.values(ProjectPermissionHoneyTokenActions),
    [ProjectPermissionSub.ProxiedServices]: Object.values(ProjectPermissionProxiedServiceActions),
    [ProjectPermissionSub.ProjectFolderGrant]: Object.values(ProjectPermissionProjectFolderGrantActions)
  };

  test.each(FOLDER_SCOPED_DENY_RULES.map((rule) => String(rule.subject)))(
    "the deny list covers every action of %s",
    (deniedSubject) => {
      expect(
        [...(deniedActionsBySubject[deniedSubject] ?? [])].sort(),
        `A new action was added to the '${deniedSubject}' subject. Add it to FOLDER_SCOPED_DENY_RULES in folder-roles.ts and review whether the SECRET_FOLDER_ROLE_PERMISSIONS tiers should grant it.`
      ).toEqual([...(ALL_ACTIONS_BY_SUBJECT[deniedSubject] ?? [])].sort());
    }
  );
});

describe("folder-scoped privilege precedence", () => {
  test("a read grant overrides an admin's base permissions at the granted path only", () => {
    const ability = abilityFor(adminRoles, [privilege({ role: SecretFolderRole.Read })]);

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

  test("subjects without a secretPath condition are exempt by construction", () => {
    const ability = abilityFor(adminRoles, [privilege({ role: SecretFolderRole.Read })]);

    expect(
      ability.can(ProjectPermissionSecretApprovalRequestActions.Read, ProjectPermissionSub.SecretApprovalRequest)
    ).toBe(true);
    expect(ability.can(ProjectPermissionActions.Read, ProjectPermissionSub.SecretApproval)).toBe(true);
  });

  test("secret event subscriptions at the path require the read tier", () => {
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

  test("an edit grant gives a viewer more than their base role at the granted path", () => {
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

  test("only a full-access grant can delegate access", () => {
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

  test("two grants on the same path union their tiers", () => {
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

  test("grants on different paths are scoped independently", () => {
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

  test("an unknown grant role fails closed", () => {
    expect(() => buildFolderScopedPrivilegeRules([privilege({ role: "superuser" })])).toThrow(NotFoundError);
  });

  test("no folder grants leaves the rules untouched", () => {
    expect(buildProjectPermissionRules(adminRoles, ProjectType.SecretManager, [])).toEqual(
      buildProjectPermissionRules(adminRoles, ProjectType.SecretManager)
    );
  });
});
