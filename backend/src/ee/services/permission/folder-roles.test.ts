import { createMongoAbility, MongoAbility, RawRuleOf } from "@casl/ability";

import { SecretFolderRole } from "@app/db/schemas";

import { RECURSIVE_SECRET_FOLDER_ROLE_PERMISSIONS, SECRET_FOLDER_ROLE_PERMISSIONS } from "./folder-roles";
import {
  ProjectPermissionActions,
  ProjectPermissionCommitsActions,
  ProjectPermissionDynamicSecretActions,
  ProjectPermissionSecretActions,
  ProjectPermissionSecretEventActions,
  ProjectPermissionSecretFolderActions,
  ProjectPermissionSet,
  ProjectPermissionSub
} from "./project-permission";

type TFolderRoleTable = Record<SecretFolderRole, RawRuleOf<MongoAbility<ProjectPermissionSet>>[]>;

const abilityFor = (table: TFolderRoleTable, role: SecretFolderRole) =>
  createMongoAbility<MongoAbility<ProjectPermissionSet>>(table[role]);

const LADDER = [
  SecretFolderRole.List,
  SecretFolderRole.Read,
  SecretFolderRole.Edit,
  SecretFolderRole.Manage,
  SecretFolderRole.FullAccess
] as const;

describe.each([
  { grant: "exact", table: SECRET_FOLDER_ROLE_PERMISSIONS },
  { grant: "recursive", table: RECURSIVE_SECRET_FOLDER_ROLE_PERMISSIONS }
])("Secret folder roles ($grant grants)", ({ table }) => {
  describe("cumulative containment", () => {
    LADDER.slice(1).forEach((role, idx) => {
      const lowerRole = LADDER[idx];

      // Each tier is built by applying the tier below it first, so the lower tier's rules must
      // appear verbatim at the head of the higher tier's. A reorder or a dropped rule breaks this.
      test(`${role} grants everything ${lowerRole} does`, () => {
        const lower = table[lowerRole];

        expect(table[role].slice(0, lower.length)).toEqual(lower);
      });

      test(`${role} grants strictly more than ${lowerRole}`, () => {
        expect(table[role].length).toBeGreaterThan(table[lowerRole].length);
      });
    });
  });

  describe("tier boundaries", () => {
    test("List can describe secrets but never read their values", () => {
      const list = abilityFor(table, SecretFolderRole.List);

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

    test("Read can read values and lease dynamic secrets, but not mutate", () => {
      const read = abilityFor(table, SecretFolderRole.Read);

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

    test("Edit can mutate secrets but cannot configure dynamic secret root credentials", () => {
      const edit = abilityFor(table, SecretFolderRole.Edit);

      expect(edit.can(ProjectPermissionSecretActions.Create, ProjectPermissionSub.Secrets)).toBe(true);
      expect(
        edit.can(ProjectPermissionDynamicSecretActions.CreateRootCredential, ProjectPermissionSub.DynamicSecrets)
      ).toBe(false);
    });

    test("Manage can configure high-privilege resources but cannot delegate access", () => {
      const manage = abilityFor(table, SecretFolderRole.Manage);

      expect(
        manage.can(ProjectPermissionDynamicSecretActions.CreateRootCredential, ProjectPermissionSub.DynamicSecrets)
      ).toBe(true);
      expect(manage.can(ProjectPermissionSecretFolderActions.ManageAccess, ProjectPermissionSub.SecretFolders)).toBe(
        false
      );
    });

    test("only Full Access can delegate access", () => {
      const fullAccess = abilityFor(table, SecretFolderRole.FullAccess);

      expect(
        fullAccess.can(ProjectPermissionSecretFolderActions.ManageAccess, ProjectPermissionSub.SecretFolders)
      ).toBe(true);
    });

    test("no tier can perform a commit rollback", () => {
      LADDER.forEach((role) => {
        expect(
          abilityFor(table, role).can(ProjectPermissionCommitsActions.PerformRollback, ProjectPermissionSub.Commits),
          `folder role '${role}' must not grant commit rollback`
        ).toBe(false);
      });
    });

    test("only Full Access can delete a folder", () => {
      LADDER.forEach((role) => {
        expect(abilityFor(table, role).can(ProjectPermissionActions.Delete, ProjectPermissionSub.SecretFolders)).toBe(
          role === SecretFolderRole.FullAccess
        );
      });
    });
  });
});

describe("Secret folder roles (recursive folder create and edit)", () => {
  test("List and Read are the exact tiers", () => {
    expect(RECURSIVE_SECRET_FOLDER_ROLE_PERMISSIONS[SecretFolderRole.List]).toEqual(
      SECRET_FOLDER_ROLE_PERMISSIONS[SecretFolderRole.List]
    );
    expect(RECURSIVE_SECRET_FOLDER_ROLE_PERMISSIONS[SecretFolderRole.Read]).toEqual(
      SECRET_FOLDER_ROLE_PERMISSIONS[SecretFolderRole.Read]
    );
  });

  test("recursive Edit extends the exact Edit tier", () => {
    const exactEdit = SECRET_FOLDER_ROLE_PERMISSIONS[SecretFolderRole.Edit];
    const recursiveEdit = RECURSIVE_SECRET_FOLDER_ROLE_PERMISSIONS[SecretFolderRole.Edit];

    expect(recursiveEdit.slice(0, exactEdit.length)).toEqual(exactEdit);
    expect(recursiveEdit.length).toBeGreaterThan(exactEdit.length);
  });

  test.each([SecretFolderRole.Edit, SecretFolderRole.Manage])(
    "recursive %s can create and edit folders but not delete them or delegate access",
    (role) => {
      const ability = abilityFor(RECURSIVE_SECRET_FOLDER_ROLE_PERMISSIONS, role);

      expect(ability.can(ProjectPermissionActions.Create, ProjectPermissionSub.SecretFolders)).toBe(true);
      expect(ability.can(ProjectPermissionActions.Edit, ProjectPermissionSub.SecretFolders)).toBe(true);
      expect(ability.can(ProjectPermissionActions.Delete, ProjectPermissionSub.SecretFolders)).toBe(false);
      expect(ability.can(ProjectPermissionSecretFolderActions.ManageAccess, ProjectPermissionSub.SecretFolders)).toBe(
        false
      );
    }
  );

  test("recursive Full Access can create, edit and delete folders and delegate access", () => {
    const ability = abilityFor(RECURSIVE_SECRET_FOLDER_ROLE_PERMISSIONS, SecretFolderRole.FullAccess);

    expect(ability.can(ProjectPermissionActions.Create, ProjectPermissionSub.SecretFolders)).toBe(true);
    expect(ability.can(ProjectPermissionActions.Edit, ProjectPermissionSub.SecretFolders)).toBe(true);
    expect(ability.can(ProjectPermissionActions.Delete, ProjectPermissionSub.SecretFolders)).toBe(true);
    expect(ability.can(ProjectPermissionSecretFolderActions.ManageAccess, ProjectPermissionSub.SecretFolders)).toBe(
      true
    );
  });

  test.each([SecretFolderRole.List, SecretFolderRole.Read])("recursive %s cannot create or edit folders", (role) => {
    const ability = abilityFor(RECURSIVE_SECRET_FOLDER_ROLE_PERMISSIONS, role);

    expect(ability.can(ProjectPermissionActions.Create, ProjectPermissionSub.SecretFolders)).toBe(false);
    expect(ability.can(ProjectPermissionActions.Edit, ProjectPermissionSub.SecretFolders)).toBe(false);
  });

  test.each(LADDER)("exact %s cannot create or edit folders", (role) => {
    const ability = abilityFor(SECRET_FOLDER_ROLE_PERMISSIONS, role);

    expect(ability.can(ProjectPermissionActions.Create, ProjectPermissionSub.SecretFolders)).toBe(false);
    expect(ability.can(ProjectPermissionActions.Edit, ProjectPermissionSub.SecretFolders)).toBe(false);
  });
});
