import { createMongoAbility, MongoAbility } from "@casl/ability";

import {
  ProjectPermissionActions,
  ProjectPermissionCmekActions,
  ProjectPermissionSecretFolderActions,
  ProjectPermissionSub,
  ProjectPermissionV2Schema
} from "./project-permission-set";
import { genericProjectRoles } from "./project-roles";

describe("ProjectPermissionV2Schema secret-folders actions", () => {
  test("should refuse manage-access, which only the folder access flow grants", () => {
    // Action
    const result = ProjectPermissionV2Schema.safeParse({
      subject: ProjectPermissionSub.SecretFolders,
      action: [ProjectPermissionSecretFolderActions.ManageAccess]
    });

    // Assert
    expect(result.success).toBe(false);
  });

  test("should accept the generic create, edit and delete actions", () => {
    // Action
    const result = ProjectPermissionV2Schema.safeParse({
      subject: ProjectPermissionSub.SecretFolders,
      action: [ProjectPermissionActions.Create, ProjectPermissionActions.Edit, ProjectPermissionActions.Delete]
    });

    // Assert
    expect(result.success).toBe(true);
  });
});

describe("ProjectPermissionV2Schema and the generic project roles", () => {
  // Actions the role API refuses because another flow grants them, so a duplicate of a built-in role cannot carry
  // them. The duplicate flow strips them.
  const NON_GRANTABLE_ACTIONS_BY_SUBJECT: Record<string, string[]> = {
    [ProjectPermissionSub.SecretFolders]: [ProjectPermissionSecretFolderActions.ManageAccess]
  };

  test("should accept every certificate application action the generic roles grant", () => {
    // Setup
    const granted = Object.values(genericProjectRoles)
      .flat()
      .filter((rule) => rule.subject === ProjectPermissionSub.Application);

    // Action
    const results = granted.map((rule) => ProjectPermissionV2Schema.safeParse(rule).success);

    // Assert
    expect(granted).not.toHaveLength(0);
    expect(results.every(Boolean)).toBe(true);
  });

  test.each(Object.entries(genericProjectRoles))(
    "should accept every rule of the generic %s role, so duplicating it round-trips",
    (_slug, rules) => {
      // Setup
      const writable = rules.flatMap((rule) => {
        const nonGrantable = NON_GRANTABLE_ACTIONS_BY_SUBJECT[String(rule.subject)] ?? [];
        const action = [rule.action].flat().filter((each) => !nonGrantable.includes(String(each)));
        return action.length ? [{ ...rule, action }] : [];
      });

      // Action
      const rejected = writable.filter((rule) => !ProjectPermissionV2Schema.safeParse(rule).success);

      // Assert
      expect(
        rejected,
        "A generic role grants a subject or action ProjectPermissionV2Schema rejects, so duplicating the role fails. Add it to the schema in project-permission-set.ts, or to NON_GRANTABLE_ACTIONS_BY_SUBJECT here and strip it in the duplicate flow."
      ).toEqual([]);
    }
  );
});

describe("ProjectPermissionV2Schema secret paths", () => {
  test("should store secret path conditions canonically and leave glob patterns alone", () => {
    // Action
    const result = ProjectPermissionV2Schema.parse({
      subject: ProjectPermissionSub.Secrets,
      action: [ProjectPermissionActions.Read],
      conditions: {
        environment: "dev",
        secretPath: { $eq: "//prod/", $in: ["/a//b", "/c"], $glob: "/app//**" }
      }
    });

    // Assert
    expect(result).toMatchObject({
      conditions: { secretPath: { $eq: "/prod", $in: ["/a/b", "/c"], $glob: "/app//**" } }
    });
  });
});

describe("ProjectPermissionCmekActions.PublishPublicKey", () => {
  test("should be granted to the generic admin and written by the role API", () => {
    // Setup
    const rule = { subject: ProjectPermissionSub.Cmek, action: [ProjectPermissionCmekActions.PublishPublicKey] };
    const admin = createMongoAbility<MongoAbility>(genericProjectRoles.admin);
    const member = createMongoAbility<MongoAbility>(genericProjectRoles.member);

    // Action
    const granted = [admin, member].map((ability) =>
      ability.can(ProjectPermissionCmekActions.PublishPublicKey, ProjectPermissionSub.Cmek)
    );

    // Assert
    expect(granted).toEqual([true, false]);
    expect(ProjectPermissionV2Schema.safeParse(rule).success).toBe(true);
  });
});
