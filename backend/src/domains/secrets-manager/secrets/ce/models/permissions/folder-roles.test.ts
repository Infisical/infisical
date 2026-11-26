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

import { RECURSIVE_SECRET_FOLDER_ROLE_PERMISSIONS, SECRET_FOLDER_ROLE_PERMISSIONS } from "./folder-roles";

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

      // Each tier applies the one below first, so the lower tier's rules must be a verbatim prefix.
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

describe("RECURSIVE_SECRET_FOLDER_ROLE_PERMISSIONS", () => {
  const recursiveAbilityFor = (role: SecretFolderRole) =>
    createMongoAbility<MongoAbility<ProjectPermissionSet>>(RECURSIVE_SECRET_FOLDER_ROLE_PERMISSIONS[role]);

  describe("cumulative containment", () => {
    LADDER.slice(1).forEach((role, idx) => {
      const lowerRole = LADDER[idx];

      test(`should grant ${role} everything ${lowerRole} grants`, () => {
        // Setup
        const lower = RECURSIVE_SECRET_FOLDER_ROLE_PERMISSIONS[lowerRole];

        // Action
        const head = RECURSIVE_SECRET_FOLDER_ROLE_PERMISSIONS[role].slice(0, lower.length);

        // Assert
        expect(head).toEqual(lower);
      });

      test(`should grant ${role} strictly more than ${lowerRole}`, () => {
        // Assert
        expect(RECURSIVE_SECRET_FOLDER_ROLE_PERMISSIONS[role].length).toBeGreaterThan(
          RECURSIVE_SECRET_FOLDER_ROLE_PERMISSIONS[lowerRole].length
        );
      });
    });
  });

  describe("tier boundaries", () => {
    test("should let list describe secrets but never read their values", () => {
      // Setup
      const list = recursiveAbilityFor(SecretFolderRole.List);

      // Assert
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
      // Setup
      const read = recursiveAbilityFor(SecretFolderRole.Read);

      // Assert
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
      // Setup
      const edit = recursiveAbilityFor(SecretFolderRole.Edit);

      // Assert
      expect(edit.can(ProjectPermissionSecretActions.Create, ProjectPermissionSub.Secrets)).toBe(true);
      expect(
        edit.can(ProjectPermissionDynamicSecretActions.CreateRootCredential, ProjectPermissionSub.DynamicSecrets)
      ).toBe(false);
    });

    test("should let manage configure high-privilege resources but not delegate access", () => {
      // Setup
      const manage = recursiveAbilityFor(SecretFolderRole.Manage);

      // Assert
      expect(
        manage.can(ProjectPermissionDynamicSecretActions.CreateRootCredential, ProjectPermissionSub.DynamicSecrets)
      ).toBe(true);
      expect(manage.can(ProjectPermissionSecretFolderActions.ManageAccess, ProjectPermissionSub.SecretFolders)).toBe(
        false
      );
    });

    test("should let only full access delegate access", () => {
      // Setup
      const fullAccess = recursiveAbilityFor(SecretFolderRole.FullAccess);

      // Assert
      expect(
        fullAccess.can(ProjectPermissionSecretFolderActions.ManageAccess, ProjectPermissionSub.SecretFolders)
      ).toBe(true);
    });

    test("should let no tier perform a commit rollback", () => {
      LADDER.forEach((role) => {
        expect(
          recursiveAbilityFor(role).can(ProjectPermissionCommitsActions.PerformRollback, ProjectPermissionSub.Commits),
          `recursive folder role '${role}' must not grant commit rollback`
        ).toBe(false);
      });
    });

    test("should let only full access delete a folder", () => {
      LADDER.forEach((role) => {
        expect(recursiveAbilityFor(role).can(ProjectPermissionActions.Delete, ProjectPermissionSub.SecretFolders)).toBe(
          role === SecretFolderRole.FullAccess
        );
      });
    });
  });

  describe("folder create and edit", () => {
    test("should leave list and read the same as the exact tiers", () => {
      // Assert
      expect(RECURSIVE_SECRET_FOLDER_ROLE_PERMISSIONS[SecretFolderRole.List]).toEqual(
        SECRET_FOLDER_ROLE_PERMISSIONS[SecretFolderRole.List]
      );
      expect(RECURSIVE_SECRET_FOLDER_ROLE_PERMISSIONS[SecretFolderRole.Read]).toEqual(
        SECRET_FOLDER_ROLE_PERMISSIONS[SecretFolderRole.Read]
      );
    });

    test("should extend the exact edit tier for recursive edit", () => {
      // Setup
      const exactEdit = SECRET_FOLDER_ROLE_PERMISSIONS[SecretFolderRole.Edit];

      // Action
      const recursiveEdit = RECURSIVE_SECRET_FOLDER_ROLE_PERMISSIONS[SecretFolderRole.Edit];

      // Assert
      expect(recursiveEdit.slice(0, exactEdit.length)).toEqual(exactEdit);
      expect(recursiveEdit.length).toBeGreaterThan(exactEdit.length);
    });

    test.each([SecretFolderRole.Edit, SecretFolderRole.Manage])(
      "should let recursive %s create and edit folders but not delete them or delegate access",
      (role) => {
        // Setup
        const ability = recursiveAbilityFor(role);

        // Assert
        expect(ability.can(ProjectPermissionActions.Create, ProjectPermissionSub.SecretFolders)).toBe(true);
        expect(ability.can(ProjectPermissionActions.Edit, ProjectPermissionSub.SecretFolders)).toBe(true);
        expect(ability.can(ProjectPermissionActions.Delete, ProjectPermissionSub.SecretFolders)).toBe(false);
        expect(ability.can(ProjectPermissionSecretFolderActions.ManageAccess, ProjectPermissionSub.SecretFolders)).toBe(
          false
        );
      }
    );

    test("should let recursive full access create, edit and delete folders and delegate access", () => {
      // Setup
      const ability = recursiveAbilityFor(SecretFolderRole.FullAccess);

      // Assert
      expect(ability.can(ProjectPermissionActions.Create, ProjectPermissionSub.SecretFolders)).toBe(true);
      expect(ability.can(ProjectPermissionActions.Edit, ProjectPermissionSub.SecretFolders)).toBe(true);
      expect(ability.can(ProjectPermissionActions.Delete, ProjectPermissionSub.SecretFolders)).toBe(true);
      expect(ability.can(ProjectPermissionSecretFolderActions.ManageAccess, ProjectPermissionSub.SecretFolders)).toBe(
        true
      );
    });

    test.each([SecretFolderRole.List, SecretFolderRole.Read])(
      "should not let recursive %s create or edit folders",
      (role) => {
        // Setup
        const ability = recursiveAbilityFor(role);

        // Assert
        expect(ability.can(ProjectPermissionActions.Create, ProjectPermissionSub.SecretFolders)).toBe(false);
        expect(ability.can(ProjectPermissionActions.Edit, ProjectPermissionSub.SecretFolders)).toBe(false);
      }
    );

    test.each(LADDER)("should not let exact %s create or edit folders", (role) => {
      // Setup
      const ability = abilityFor(role);

      // Assert
      expect(ability.can(ProjectPermissionActions.Create, ProjectPermissionSub.SecretFolders)).toBe(false);
      expect(ability.can(ProjectPermissionActions.Edit, ProjectPermissionSub.SecretFolders)).toBe(false);
    });
  });
});
