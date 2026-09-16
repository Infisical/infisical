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
