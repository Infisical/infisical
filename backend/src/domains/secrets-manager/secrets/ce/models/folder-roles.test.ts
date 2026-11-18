import { createMongoAbility, MongoAbility } from "@casl/ability";

import { SecretFolderRole } from "@app/db/schemas";
import {
  ProjectPermissionActions,
  ProjectPermissionCommitsActions,
  ProjectPermissionDynamicSecretActions,
  ProjectPermissionSecretActions,
  ProjectPermissionSecretEventActions,
  ProjectPermissionSecretFolderActions,
  ProjectPermissionSet,
  ProjectPermissionSub
} from "@app/domains/platform/projects/ce/module";

import { SECRET_FOLDER_ROLE_PERMISSIONS } from "./folder-roles";

const abilityFor = (role: SecretFolderRole) =>
  createMongoAbility<MongoAbility<ProjectPermissionSet>>(SECRET_FOLDER_ROLE_PERMISSIONS[role]);

const LADDER = [
  SecretFolderRole.List,
  SecretFolderRole.Read,
  SecretFolderRole.Edit,
  SecretFolderRole.Manage,
  SecretFolderRole.FullAccess
] as const;

describe("SECRET_FOLDER_ROLE_PERMISSIONS", () => {
  describe("cumulative containment", () => {
    LADDER.slice(1).forEach((role, idx) => {
      const lowerRole = LADDER[idx];

      // Each tier is built by applying the tier below it first, so the lower tier's rules must
      // appear verbatim at the head of the higher tier's. A reorder or a dropped rule breaks this.
      test(`should grant ${role} everything ${lowerRole} grants`, () => {
        const lower = SECRET_FOLDER_ROLE_PERMISSIONS[lowerRole];

        expect(SECRET_FOLDER_ROLE_PERMISSIONS[role].slice(0, lower.length)).toEqual(lower);
      });

      test(`should grant ${role} strictly more than ${lowerRole}`, () => {
        expect(SECRET_FOLDER_ROLE_PERMISSIONS[role].length).toBeGreaterThan(
          SECRET_FOLDER_ROLE_PERMISSIONS[lowerRole].length
        );
      });
    });
  });

  describe("tier boundaries", () => {
    test("should let list describe secrets but never read their values", () => {
      const list = abilityFor(SecretFolderRole.List);

      expect(list.can(ProjectPermissionSecretActions.DescribeSecret, ProjectPermissionSub.Secrets)).toBe(true);
      expect(list.can(ProjectPermissionSecretActions.ReadValue, ProjectPermissionSub.Secrets)).toBe(false);
      expect(list.can(ProjectPermissionCommitsActions.Read, ProjectPermissionSub.Commits)).toBe(false);
      expect(
        list.can(
          ProjectPermissionSecretEventActions.SubscribeToCreationEvents,
          ProjectPermissionSub.SecretEventSubscriptions
        )
      ).toBe(false);
    });

    test("should let read read values and lease dynamic secrets, but not mutate", () => {
      const read = abilityFor(SecretFolderRole.Read);

      expect(read.can(ProjectPermissionSecretActions.ReadValue, ProjectPermissionSub.Secrets)).toBe(true);
      expect(read.can(ProjectPermissionCommitsActions.Read, ProjectPermissionSub.Commits)).toBe(true);
      expect(read.can(ProjectPermissionDynamicSecretActions.Lease, ProjectPermissionSub.DynamicSecrets)).toBe(true);
      expect(
        read.can(
          ProjectPermissionSecretEventActions.SubscribeToCreationEvents,
          ProjectPermissionSub.SecretEventSubscriptions
        )
      ).toBe(true);
      expect(read.can(ProjectPermissionSecretActions.Edit, ProjectPermissionSub.Secrets)).toBe(false);
    });

    test("should let edit mutate secrets but not configure dynamic secret root credentials", () => {
      const edit = abilityFor(SecretFolderRole.Edit);

      expect(edit.can(ProjectPermissionSecretActions.Create, ProjectPermissionSub.Secrets)).toBe(true);
      expect(edit.cannot(ProjectPermissionActions.Create, ProjectPermissionSub.SecretFolders)).toBe(true);
      expect(
        edit.can(ProjectPermissionDynamicSecretActions.CreateRootCredential, ProjectPermissionSub.DynamicSecrets)
      ).toBe(false);
    });

    test("should let manage configure high-privilege resources but not delegate access", () => {
      const manage = abilityFor(SecretFolderRole.Manage);

      expect(
        manage.can(ProjectPermissionDynamicSecretActions.CreateRootCredential, ProjectPermissionSub.DynamicSecrets)
      ).toBe(true);
      expect(manage.can(ProjectPermissionSecretFolderActions.ManageAccess, ProjectPermissionSub.SecretFolders)).toBe(
        false
      );
    });

    test("should let only full access delegate access", () => {
      const fullAccess = abilityFor(SecretFolderRole.FullAccess);

      expect(
        fullAccess.can(ProjectPermissionSecretFolderActions.ManageAccess, ProjectPermissionSub.SecretFolders)
      ).toBe(true);
    });

    test("should let no tier perform a commit rollback", () => {
      LADDER.forEach((role) => {
        expect(
          abilityFor(role).can(ProjectPermissionCommitsActions.PerformRollback, ProjectPermissionSub.Commits),
          `folder role '${role}' must not grant commit rollback`
        ).toBe(false);
      });
    });

    test("should let only full access delete a folder", () => {
      LADDER.forEach((role) => {
        expect(abilityFor(role).can(ProjectPermissionActions.Delete, ProjectPermissionSub.SecretFolders)).toBe(
          role === SecretFolderRole.FullAccess
        );
      });
    });
  });
});
