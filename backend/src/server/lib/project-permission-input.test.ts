import { ProjectPermissionMemberActions, ProjectPermissionSub } from "@app/domains/platform/projects/ce/module";

import { checkForInvalidPermissionCombination } from "./project-permission-input";

describe("checkForInvalidPermissionCombination", () => {
  test("should accept a userEmail condition on member assume-privileges", () => {
    // Setup
    const permissions = [
      {
        subject: ProjectPermissionSub.Member,
        action: [ProjectPermissionMemberActions.AssumePrivileges],
        conditions: { userEmail: "admin@example.com" }
      }
    ];

    // Action
    const check = () => checkForInvalidPermissionCombination(permissions as never);

    // Assert
    expect(check).not.toThrow();
  });

  test("should refuse conditions on member assume-privileges other than userEmail", () => {
    // Setup
    const permissions = [
      {
        subject: ProjectPermissionSub.Member,
        action: [ProjectPermissionMemberActions.AssumePrivileges],
        conditions: { assignableRole: "admin" }
      }
    ];

    // Action
    const check = () => checkForInvalidPermissionCombination(permissions as never);

    // Assert
    expect(check).toThrow(
      'Condition "assignableRole" is not allowed for action "assume-privileges" on subject "member"'
    );
  });

  test("should refuse conditions when assume-privileges shares a rule with an action that allows them", () => {
    // Setup
    const permissions = [
      {
        subject: ProjectPermissionSub.Member,
        action: [ProjectPermissionMemberActions.AssignRole, ProjectPermissionMemberActions.AssumePrivileges],
        conditions: { userEmail: "admin@example.com", assignableRole: "admin" }
      }
    ];

    // Action
    const check = () => checkForInvalidPermissionCombination(permissions as never);

    // Assert
    expect(check).toThrow(
      'Condition "assignableRole" is not allowed for action "assume-privileges" on subject "member"'
    );
  });

  test("should accept member assume-privileges without conditions", () => {
    // Setup
    const permissions = [
      { subject: ProjectPermissionSub.Member, action: [ProjectPermissionMemberActions.AssumePrivileges] }
    ];

    // Action
    const check = () => checkForInvalidPermissionCombination(permissions as never);

    // Assert
    expect(check).not.toThrow();
  });
});
