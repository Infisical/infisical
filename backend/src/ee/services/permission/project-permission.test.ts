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
