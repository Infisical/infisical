import { createMongoAbility, MongoAbility } from "@casl/ability";

import { projectAdminPermissions, projectMemberPermissions } from "./default-roles";
import {
  orgAdminPermissions,
  orgMemberPermissions,
  OrgPermissionIdentityActions,
  OrgPermissionSet,
  OrgPermissionSubjects
} from "./org-permission";
import { ProjectPermissionIdentityActions, ProjectPermissionSet, ProjectPermissionSub } from "./project-permission";

// Regression guard for the identity auth-method privilege-escalation fix.
// Configuring an identity's auth methods (attach/update) is gated behind the
// dedicated `edit-auth` action. The built-in Member role must NOT receive it,
// otherwise a member could attach a trust-based auth method to a more-privileged
// identity and authenticate as it. Admins must retain it.

describe("Identity edit-auth permission decoupling", () => {
  describe("Project roles", () => {
    const admin = createMongoAbility<MongoAbility<ProjectPermissionSet>>(projectAdminPermissions);
    const member = createMongoAbility<MongoAbility<ProjectPermissionSet>>(projectMemberPermissions);

    test("admin can configure identity auth methods", () => {
      expect(admin.can(ProjectPermissionIdentityActions.EditAuth, ProjectPermissionSub.Identity)).toBe(true);
    });

    test("member cannot configure identity auth methods", () => {
      expect(member.can(ProjectPermissionIdentityActions.EditAuth, ProjectPermissionSub.Identity)).toBe(false);
    });

    test("member still has generic edit on identities (decoupled from auth config)", () => {
      expect(member.can(ProjectPermissionIdentityActions.Edit, ProjectPermissionSub.Identity)).toBe(true);
    });
  });

  describe("Organization roles", () => {
    const admin = createMongoAbility<MongoAbility<OrgPermissionSet>>(orgAdminPermissions);
    const member = createMongoAbility<MongoAbility<OrgPermissionSet>>(orgMemberPermissions);

    test("admin can configure identity auth methods", () => {
      expect(admin.can(OrgPermissionIdentityActions.EditAuth, OrgPermissionSubjects.Identity)).toBe(true);
    });

    test("member cannot configure identity auth methods", () => {
      expect(member.can(OrgPermissionIdentityActions.EditAuth, OrgPermissionSubjects.Identity)).toBe(false);
    });

    test("member still has generic edit on identities (decoupled from auth config)", () => {
      expect(member.can(OrgPermissionIdentityActions.Edit, OrgPermissionSubjects.Identity)).toBe(true);
    });
  });
});
