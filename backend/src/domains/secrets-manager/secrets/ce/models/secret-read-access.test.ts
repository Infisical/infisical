import { MongoAbility, RawRuleOf } from "@casl/ability";

import { PermissionDeniedError } from "@app/domains/lib/errors";
import { Permission } from "@app/domains/platform/access-control/ce/module";
import {
  ProjectPermissionSecretActions,
  ProjectPermissionSet,
  ProjectPermissionSub
} from "@app/domains/platform/projects/ce/module";

import { SecretReadAccess } from "./secret-read-access";

type TRule = RawRuleOf<MongoAbility<ProjectPermissionSet>>;

const permissionOf = (rules: TRule[]) => Permission.fromRules<ProjectPermissionSet>({ rules });

const allow = (action: ProjectPermissionSecretActions[], conditions?: Record<string, unknown>): TRule =>
  ({ action, subject: ProjectPermissionSub.Secrets, ...(conditions ? { conditions } : {}) }) as TRule;

const caught = (fn: () => void) => {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return undefined;
};

describe("SecretReadAccess.assert", () => {
  test("should pass when the actor has the requested action", () => {
    // Setup
    const permission = permissionOf([allow([ProjectPermissionSecretActions.DescribeSecret])]);

    // Action
    const check = () => SecretReadAccess.assert(permission, ProjectPermissionSecretActions.DescribeSecret);

    // Assert
    expect(check).not.toThrow();
  });

  test("should pass when the actor only has the combined read action", () => {
    // Setup
    const permission = permissionOf([allow([ProjectPermissionSecretActions.DescribeAndReadValue])]);

    // Action
    const check = () => SecretReadAccess.assert(permission, ProjectPermissionSecretActions.DescribeSecret);

    // Assert
    expect(check).not.toThrow();
  });

  test("should refuse when the actor only has write actions", () => {
    // Setup
    const permission = permissionOf([
      allow([
        ProjectPermissionSecretActions.Create,
        ProjectPermissionSecretActions.Edit,
        ProjectPermissionSecretActions.Delete
      ])
    ]);

    // Action
    const check = () => SecretReadAccess.assert(permission, ProjectPermissionSecretActions.DescribeSecret);

    // Assert
    expect(check).toThrow(PermissionDeniedError);
  });

  test("should name the requested action in the denial, not the combined one", () => {
    // Setup
    const permission = permissionOf([]);

    // Action
    const error = caught(() =>
      SecretReadAccess.assert(permission, ProjectPermissionSecretActions.ReadValue, {
        environment: "prod",
        secretPath: "/"
      })
    );

    // Assert
    expect(error).toBeInstanceOf(PermissionDeniedError);
    expect((error as PermissionDeniedError).denial).toMatchObject({
      action: ProjectPermissionSecretActions.ReadValue,
      subject: ProjectPermissionSub.Secrets,
      subjectFields: { environment: "prod", secretPath: "/" }
    });
  });

  test("should respect conditions on the rule", () => {
    // Setup
    const permission = permissionOf([allow([ProjectPermissionSecretActions.DescribeSecret], { environment: "dev" })]);

    // Action
    const inDev = () =>
      SecretReadAccess.assert(permission, ProjectPermissionSecretActions.DescribeSecret, {
        environment: "dev",
        secretPath: "/"
      });
    const inProd = () =>
      SecretReadAccess.assert(permission, ProjectPermissionSecretActions.DescribeSecret, {
        environment: "prod",
        secretPath: "/"
      });

    // Assert
    expect(inDev).not.toThrow();
    expect(inProd).toThrow(PermissionDeniedError);
  });
});

describe("SecretReadAccess.can", () => {
  test("should accept the requested action or the combined one, and nothing else", () => {
    // Setup
    const fields = { environment: "prod", secretPath: "/" };

    // Action
    const viaNew = SecretReadAccess.can(
      permissionOf([allow([ProjectPermissionSecretActions.ReadValue])]),
      ProjectPermissionSecretActions.ReadValue,
      fields
    );
    const viaCombined = SecretReadAccess.can(
      permissionOf([allow([ProjectPermissionSecretActions.DescribeAndReadValue])]),
      ProjectPermissionSecretActions.ReadValue,
      fields
    );
    const viaOther = SecretReadAccess.can(
      permissionOf([allow([ProjectPermissionSecretActions.DescribeSecret])]),
      ProjectPermissionSecretActions.ReadValue,
      fields
    );

    // Assert
    expect(viaNew).toBe(true);
    expect(viaCombined).toBe(true);
    expect(viaOther).toBe(false);
  });
});

describe("SecretReadAccess.assertMove", () => {
  const move = {
    sourceEnvironment: "dev",
    sourceSecretPath: "/a",
    destinationEnvironment: "prod",
    destinationSecretPath: "/b"
  };

  test("should pass with delete and read at the source and create and edit at the destination", () => {
    // Setup
    const permission = permissionOf([
      allow(
        [
          ProjectPermissionSecretActions.Delete,
          ProjectPermissionSecretActions.DescribeSecret,
          ProjectPermissionSecretActions.ReadValue
        ],
        { environment: "dev", secretPath: "/a" }
      ),
      allow([ProjectPermissionSecretActions.Create, ProjectPermissionSecretActions.Edit], {
        environment: "prod",
        secretPath: "/b"
      })
    ]);

    // Action
    const check = () => SecretReadAccess.assertMove(permission, move);

    // Assert
    expect(check).not.toThrow();
  });

  test("should refuse on the destination's create first", () => {
    // Setup
    const permission = permissionOf([]);

    // Action
    const error = caught(() => SecretReadAccess.assertMove(permission, move));

    // Assert
    expect((error as PermissionDeniedError).denial).toMatchObject({
      action: ProjectPermissionSecretActions.Create,
      subjectFields: { environment: "prod", secretPath: "/b" }
    });
  });

  test("should refuse reading the value at the source when only describe is held there", () => {
    // Setup
    const permission = permissionOf([
      allow([ProjectPermissionSecretActions.Delete, ProjectPermissionSecretActions.DescribeSecret], {
        environment: "dev",
        secretPath: "/a"
      }),
      allow([ProjectPermissionSecretActions.Create, ProjectPermissionSecretActions.Edit], {
        environment: "prod",
        secretPath: "/b"
      })
    ]);

    // Action
    const error = caught(() => SecretReadAccess.assertMove(permission, move));

    // Assert
    expect((error as PermissionDeniedError).denial).toMatchObject({
      action: ProjectPermissionSecretActions.ReadValue,
      subjectFields: { environment: "dev", secretPath: "/a" }
    });
  });
});
