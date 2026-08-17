import { createMongoAbility, MongoAbility } from "@casl/ability";

import { SecretFolderRole } from "@app/db/schemas";

import { SECRET_FOLDER_ROLE_PERMISSIONS } from "./default-roles";
import {
  ProjectPermissionActions,
  ProjectPermissionCommitsActions,
  ProjectPermissionDynamicSecretActions,
  ProjectPermissionManageAccessActions,
  ProjectPermissionSecretActions,
  ProjectPermissionSet,
  ProjectPermissionSub
} from "./project-permission";

const abilityFor = (role: SecretFolderRole) =>
  createMongoAbility<MongoAbility<ProjectPermissionSet>>(SECRET_FOLDER_ROLE_PERMISSIONS[role]);

const LADDER = [
  SecretFolderRole.List,
  SecretFolderRole.Read,
  SecretFolderRole.Edit,
  SecretFolderRole.Manage,
  SecretFolderRole.FullAccess
] as const;

describe("Secret folder roles", () => {
  describe("cumulative containment", () => {
    LADDER.slice(1).forEach((role, idx) => {
      const lowerRole = LADDER[idx];

      // Each tier is built by applying the tier below it first, so the lower tier's rules must
      // appear verbatim at the head of the higher tier's. A reorder or a dropped rule breaks this.
      test(`${role} grants everything ${lowerRole} does`, () => {
        const lower = SECRET_FOLDER_ROLE_PERMISSIONS[lowerRole];

        expect(SECRET_FOLDER_ROLE_PERMISSIONS[role].slice(0, lower.length)).toEqual(lower);
      });

      test(`${role} grants strictly more than ${lowerRole}`, () => {
        expect(SECRET_FOLDER_ROLE_PERMISSIONS[role].length).toBeGreaterThan(
          SECRET_FOLDER_ROLE_PERMISSIONS[lowerRole].length
        );
      });
    });
  });

  describe("tier boundaries", () => {
    test("List can describe secrets but never read their values", () => {
      const list = abilityFor(SecretFolderRole.List);

      expect(list.can(ProjectPermissionSecretActions.DescribeSecret, ProjectPermissionSub.Secrets)).toBe(true);
      expect(list.can(ProjectPermissionSecretActions.ReadValue, ProjectPermissionSub.Secrets)).toBe(false);
    });

    test("Read can read values and lease dynamic secrets, but not mutate", () => {
      const read = abilityFor(SecretFolderRole.Read);

      expect(read.can(ProjectPermissionSecretActions.ReadValue, ProjectPermissionSub.Secrets)).toBe(true);
      expect(read.can(ProjectPermissionCommitsActions.Read, ProjectPermissionSub.Commits)).toBe(true);
      expect(read.can(ProjectPermissionDynamicSecretActions.Lease, ProjectPermissionSub.DynamicSecrets)).toBe(true);
      expect(read.can(ProjectPermissionSecretActions.Edit, ProjectPermissionSub.Secrets)).toBe(false);
    });

    test("Edit can mutate secrets but cannot configure dynamic secret root credentials", () => {
      const edit = abilityFor(SecretFolderRole.Edit);

      expect(edit.can(ProjectPermissionSecretActions.Create, ProjectPermissionSub.Secrets)).toBe(true);
      expect(edit.can(ProjectPermissionActions.Create, ProjectPermissionSub.SecretFolders)).toBe(true);
      expect(
        edit.can(ProjectPermissionDynamicSecretActions.CreateRootCredential, ProjectPermissionSub.DynamicSecrets)
      ).toBe(false);
    });

    test("Manage can configure high-privilege resources but cannot delegate access", () => {
      const manage = abilityFor(SecretFolderRole.Manage);

      expect(
        manage.can(ProjectPermissionDynamicSecretActions.CreateRootCredential, ProjectPermissionSub.DynamicSecrets)
      ).toBe(true);
      expect(manage.can(ProjectPermissionManageAccessActions.Grant, ProjectPermissionSub.ManageAccess)).toBe(false);
    });

    test("only Full Access can delegate access", () => {
      const fullAccess = abilityFor(SecretFolderRole.FullAccess);

      expect(fullAccess.can(ProjectPermissionManageAccessActions.Grant, ProjectPermissionSub.ManageAccess)).toBe(true);
      expect(fullAccess.can(ProjectPermissionManageAccessActions.Revoke, ProjectPermissionSub.ManageAccess)).toBe(true);
    });

    test("no tier can delete a folder", () => {
      LADDER.forEach((role) => {
        expect(abilityFor(role).can(ProjectPermissionActions.Delete, ProjectPermissionSub.SecretFolders)).toBe(false);
      });
    });
  });
});
