import { ProjectType } from "@app/db/schemas";
import { getPredefinedRoles } from "@app/services/project-role/project-role-fns";

import { projectAdminPermissions, projectMemberPermissions, projectViewerPermission } from "./default-roles";
import {
  ProjectPermissionActions,
  ProjectPermissionSecretFolderActions,
  ProjectPermissionSub,
  ProjectPermissionV2Schema
} from "./project-permission";

describe("ProjectPermissionV2Schema secret-folders actions", () => {
  test("rejects manage-access, which is only obtainable through the folder access flow", () => {
    const result = ProjectPermissionV2Schema.safeParse({
      subject: ProjectPermissionSub.SecretFolders,
      action: [ProjectPermissionSecretFolderActions.ManageAccess]
    });

    expect(result.success).toBe(false);
  });

  test("accepts the generic CRUD actions", () => {
    const result = ProjectPermissionV2Schema.safeParse({
      subject: ProjectPermissionSub.SecretFolders,
      action: [ProjectPermissionActions.Create, ProjectPermissionActions.Edit, ProjectPermissionActions.Delete]
    });

    expect(result.success).toBe(true);
  });
});

describe("ProjectPermissionV2Schema certificate-application actions", () => {
  test("accepts every action the built-in roles grant, so duplicating them round-trips", () => {
    const granted = [...projectAdminPermissions, ...projectMemberPermissions, ...projectViewerPermission].filter(
      (rule) => rule.subject === ProjectPermissionSub.Application
    );

    expect(granted).not.toHaveLength(0);
    granted.forEach((rule) => {
      expect(ProjectPermissionV2Schema.safeParse(rule).success).toBe(true);
    });
  });
});

describe("built-in project roles round-trip through the role API schema", () => {
  // Actions the role API deliberately refuses because they are only obtainable through another
  // flow, so a duplicate of a built-in role cannot carry them. The duplicate flow strips them.
  const NON_GRANTABLE_ACTIONS_BY_SUBJECT: Record<string, string[]> = {
    [ProjectPermissionSub.SecretFolders]: [ProjectPermissionSecretFolderActions.ManageAccess]
  };

  // The roles tab lists whatever getPredefinedRoles returns and duplicates a role by re-submitting
  // its rules, so enumerate that rather than hardcoding a list of built-in roles here.
  const builtInRoles = [
    ...new Map(
      Object.values(ProjectType)
        .flatMap((projectType) => getPredefinedRoles({ projectId: "project-id", projectType }))
        .map((role) => [role.slug, role.permissions])
    ).entries()
  ];

  test.each(builtInRoles)("every rule of the built-in %s role is writable", (_slug, permissions) => {
    permissions.forEach((rule) => {
      const nonGrantableActions = NON_GRANTABLE_ACTIONS_BY_SUBJECT[String(rule.subject)] ?? [];
      const action = [rule.action].flat().filter((el) => !nonGrantableActions.includes(String(el)));
      if (!action.length) return;

      const result = ProjectPermissionV2Schema.safeParse({ ...rule, action });

      expect(
        result.success,
        `The built-in roles grant '${String(rule.subject)}' but ProjectPermissionV2Schema rejects it, so duplicating the role fails. Add the subject or action to the schema in project-permission.ts, or add it to NON_GRANTABLE_ACTIONS_BY_SUBJECT here and strip it in the duplicate flow.`
      ).toBe(true);
    });
  });
});
