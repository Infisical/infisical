import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ProjectPermissionActions,
  ProjectPermissionSecretActions,
  ProjectPermissionSecretFolderActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { TProjectRole } from "@app/hooks/api/roles/types";

import { sanitizeDuplicateRolePermissions } from "./DuplicateProjectRoleModal.utils";

// The built-in role definitions live in the backend and are served over the API, so the shape the
// duplicate flow receives for the Admin role is mirrored here.
const adminLikePermissions: TProjectRole["permissions"] = [
  {
    subject: ProjectPermissionSub.Secrets,
    action: [
      ProjectPermissionSecretActions.DescribeSecret,
      ProjectPermissionSecretActions.DescribeAndReadValue,
      ProjectPermissionSecretActions.ReadValue,
      ProjectPermissionSecretActions.Create,
      ProjectPermissionSecretActions.Edit,
      ProjectPermissionSecretActions.Delete
    ]
  },
  {
    subject: ProjectPermissionSub.SecretFolders,
    action: [
      ProjectPermissionActions.Edit,
      ProjectPermissionActions.Create,
      ProjectPermissionActions.Delete,
      ProjectPermissionSecretFolderActions.ManageAccess
    ]
  },
  {
    subject: ProjectPermissionSub.Role,
    action: [
      ProjectPermissionActions.Read,
      ProjectPermissionActions.Edit,
      ProjectPermissionActions.Create,
      ProjectPermissionActions.Delete
    ]
  }
];

const ruleFor = (permissions: TProjectRole["permissions"], subject: string) =>
  permissions.find((permission) => permission.subject === subject);

describe("duplicate project role permission sanitization", () => {
  it("submits no non-grantable folder action for an Admin-like role", () => {
    const submitted = sanitizeDuplicateRolePermissions(adminLikePermissions);

    submitted.forEach((permission) => {
      assert.ok(
        ![permission.action].flat().includes(ProjectPermissionSecretFolderActions.ManageAccess),
        `rule for ${String(permission.subject)} still carries manage-access`
      );
      assert.ok(
        [permission.action].flat().length > 0,
        `rule for ${String(permission.subject)} has no actions left`
      );
    });

    assert.deepEqual(ruleFor(submitted, ProjectPermissionSub.SecretFolders)?.action, [
      ProjectPermissionActions.Edit,
      ProjectPermissionActions.Create,
      ProjectPermissionActions.Delete
    ]);
  });

  it("drops a folder rule whose only action is manage-access", () => {
    const submitted = sanitizeDuplicateRolePermissions([
      {
        subject: ProjectPermissionSub.SecretFolders,
        action: [ProjectPermissionSecretFolderActions.ManageAccess]
      },
      {
        subject: ProjectPermissionSub.SecretFolders,
        action: ProjectPermissionSecretFolderActions.ManageAccess
      }
    ]);

    assert.deepEqual(submitted, []);
  });

  it("strips describeAndReadValue from a secrets rule that also describes or reads values", () => {
    assert.deepEqual(ruleFor(adminLikePermissions, ProjectPermissionSub.Secrets)?.action, [
      ProjectPermissionSecretActions.DescribeSecret,
      ProjectPermissionSecretActions.DescribeAndReadValue,
      ProjectPermissionSecretActions.ReadValue,
      ProjectPermissionSecretActions.Create,
      ProjectPermissionSecretActions.Edit,
      ProjectPermissionSecretActions.Delete
    ]);

    assert.deepEqual(
      ruleFor(sanitizeDuplicateRolePermissions(adminLikePermissions), ProjectPermissionSub.Secrets)
        ?.action,
      [
        ProjectPermissionSecretActions.DescribeSecret,
        ProjectPermissionSecretActions.ReadValue,
        ProjectPermissionSecretActions.Create,
        ProjectPermissionSecretActions.Edit,
        ProjectPermissionSecretActions.Delete
      ]
    );
  });

  it("keeps describeAndReadValue on a secrets rule that grants nothing else", () => {
    const permissions: TProjectRole["permissions"] = [
      {
        subject: ProjectPermissionSub.Secrets,
        action: [ProjectPermissionSecretActions.DescribeAndReadValue]
      }
    ];

    assert.deepEqual(sanitizeDuplicateRolePermissions(permissions), permissions);
  });

  it("passes rules for other subjects through untouched", () => {
    const permissions: TProjectRole["permissions"] = [
      {
        subject: ProjectPermissionSub.Member,
        action: [ProjectPermissionActions.Read],
        conditions: { userEmail: { $eq: "user@example.com" } },
        inverted: true
      },
      {
        subject: ProjectPermissionSub.DynamicSecrets,
        action: ProjectPermissionActions.Read
      }
    ];

    assert.deepEqual(sanitizeDuplicateRolePermissions(permissions), permissions);
  });
});
