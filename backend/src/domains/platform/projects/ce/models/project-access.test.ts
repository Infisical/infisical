import { randomUUID } from "node:crypto";

import { packRules } from "@casl/ability/extra";

import { AccessScope, ProjectMembershipRole, ProjectType } from "@app/db/schemas";
import { Grant, Permission, RuleIdentity, RuleSet } from "@app/domains/platform/access-control/ce/module";
import { buildAccessControl } from "@app/domains/platform/access-control/ce/testing/build-access-control";
import { PAST, TSeedRole } from "@app/domains/platform/access-control/ce/testing/grant-fixture";
import { userPrincipal } from "@app/domains/platform/organizations/ce/testing/actor-context-fixture";
import { ActorType } from "@app/lib/auth/actor-types";

import {
  ProjectPermissionActions,
  ProjectPermissionGroupActions,
  ProjectPermissionIdentityActions,
  ProjectPermissionMemberActions,
  ProjectPermissionSecretActions,
  ProjectPermissionSet,
  ProjectPermissionSub
} from "./permissions/project-permission-set";
import { Project } from "./project";
import { ProjectAccess } from "./project-access";
import { StandardProjectRoles, TProjectRule } from "./standard-project-roles";

const roles = StandardProjectRoles.generic(ProjectType.SecretManager);

const custom = (rules: TProjectRule[]) =>
  Grant.restore({ slug: ProjectMembershipRole.Custom, packedRules: packRules(rules) });
const builtIn = (slug: string) => Grant.restore({ slug });
const permissionOf = (rules: RuleSet<TProjectRule>) => Permission.fromRules<ProjectPermissionSet>({ rules });

const secrets = (action: ProjectPermissionSecretActions, fields = { environment: "prod", secretPath: "/" }) =>
  ({ action, subject: ProjectPermissionSub.Secrets, fields }) as const;

const accessWith = async (seededRoles: TSeedRole[], customRules?: TProjectRule[]) => {
  const { grantStore, seed } = buildAccessControl();
  const orgId = randomUUID();
  const projectId = randomUUID();
  const userId = randomUUID();
  const role = customRules
    ? await seed.role({ owner: { projectId }, slug: "admin", permissions: packRules(customRules) })
    : null;
  await seed.membership({
    scope: AccessScope.Project,
    orgId,
    projectId,
    actor: { userId },
    roles: role ? [...seededRoles, { role: ProjectMembershipRole.Custom, customRoleId: role.id }] : seededRoles
  });
  const grants = await grantStore.findActorGrants(
    { type: ActorType.USER, id: userId },
    { scope: AccessScope.Project, orgId, projectId }
  );
  return ProjectAccess.create({
    project: Project.restore({ id: projectId, name: "p", slug: "p", orgId, type: ProjectType.SecretManager }),
    grants,
    roles,
    principal: userPrincipal({ id: userId }),
    identity: RuleIdentity.create({ id: userId, username: "ada", metadata: {} }),
    usesNewPrivilegeSystem: false
  });
};

describe("ProjectAccess.rulesOf", () => {
  test("should widen a forbid on a split secret action to the legacy action it came from", () => {
    // Setup
    const grants = [
      builtIn(ProjectMembershipRole.Member),
      custom([
        { action: ProjectPermissionSecretActions.ReadValue, subject: ProjectPermissionSub.Secrets, inverted: true }
      ])
    ];

    // Action
    const permission = permissionOf(ProjectAccess.rulesOf(grants, roles));

    // Assert
    expect(permission.can(secrets(ProjectPermissionSecretActions.DescribeAndReadValue))).toBe(false);
    expect(permission.can(secrets(ProjectPermissionSecretActions.Edit))).toBe(true);
  });

  test("should widen a forbid on assigning a member role to the legacy grant-privileges action", () => {
    // Setup
    const grants = [
      builtIn(ProjectMembershipRole.Admin),
      custom([
        { action: ProjectPermissionMemberActions.AssignRole, subject: ProjectPermissionSub.Member, inverted: true }
      ])
    ];

    // Action
    const permission = permissionOf(ProjectAccess.rulesOf(grants, roles));

    // Assert
    expect(
      permission.can({ action: ProjectPermissionMemberActions.GrantPrivileges, subject: ProjectPermissionSub.Member })
    ).toBe(false);
  });

  test("should leave alone an allow, a forbid already naming the legacy action, and a forbid on several subjects", () => {
    // Setup
    const allow: TProjectRule = {
      action: [ProjectPermissionGroupActions.AssignRole],
      subject: ProjectPermissionSub.Groups
    };
    const named: TProjectRule = {
      action: [ProjectPermissionGroupActions.AssignRole, ProjectPermissionGroupActions.GrantPrivileges],
      subject: ProjectPermissionSub.Groups,
      inverted: true
    };
    const several = {
      action: [ProjectPermissionGroupActions.AssignRole],
      subject: [ProjectPermissionSub.Groups, ProjectPermissionSub.Member],
      inverted: true
    } as unknown as TProjectRule;

    // Action
    const { rules } = ProjectAccess.rulesOf([custom([allow, named, several])], roles);

    // Assert
    expect(rules.map((rule) => rule.action)).toEqual([
      [ProjectPermissionGroupActions.AssignRole],
      [ProjectPermissionGroupActions.AssignRole, ProjectPermissionGroupActions.GrantPrivileges],
      [ProjectPermissionGroupActions.AssignRole]
    ]);
  });

  test.each([
    [
      ProjectPermissionSub.Secrets,
      ProjectPermissionSecretActions.DescribeSecret,
      ProjectPermissionSecretActions.DescribeAndReadValue
    ],
    [
      ProjectPermissionSub.Identity,
      ProjectPermissionIdentityActions.AssignAdditionalPrivileges,
      ProjectPermissionIdentityActions.GrantPrivileges
    ],
    [
      ProjectPermissionSub.Groups,
      ProjectPermissionGroupActions.AssignRole,
      ProjectPermissionGroupActions.GrantPrivileges
    ]
  ])("should widen a forbid on %s %s to also forbid the legacy action %s", (subject, action, legacyAction) => {
    // Setup
    const forbid = { action: [action], subject, inverted: true } as unknown as TProjectRule;

    // Action
    const { rules } = ProjectAccess.rulesOf([custom([forbid])], roles);

    // Assert
    expect(rules.map((rule) => rule.action)).toEqual([[action, legacyAction]]);
  });

  test("should keep the conditions of a forbid it widens", () => {
    // Setup
    const forbid = {
      action: [ProjectPermissionSecretActions.ReadValue],
      subject: ProjectPermissionSub.Secrets,
      conditions: { environment: "dev" },
      inverted: true
    } as TProjectRule;

    // Action
    const { rules } = ProjectAccess.rulesOf([custom([forbid])], roles);

    // Assert
    expect(rules.map((rule) => rule.action)).toEqual([
      [ProjectPermissionSecretActions.ReadValue, ProjectPermissionSecretActions.DescribeAndReadValue]
    ]);
    expect(rules[0].conditions).toEqual({ environment: "dev" });
  });

  test.each([
    [
      "a forbid that already names the legacy action",
      ProjectPermissionSub.Secrets,
      [ProjectPermissionSecretActions.ReadValue, ProjectPermissionSecretActions.DescribeAndReadValue]
    ],
    [
      "a forbid on secret actions that have no legacy action",
      ProjectPermissionSub.Secrets,
      [ProjectPermissionSecretActions.Create, ProjectPermissionSecretActions.Edit]
    ],
    ["a forbid on a subject with no legacy action", ProjectPermissionSub.Webhooks, [ProjectPermissionActions.Read]]
  ])("should leave alone %s", (_name, subject, action) => {
    // Setup
    const forbid = { action, subject, inverted: true } as unknown as TProjectRule;

    // Action
    const { rules } = ProjectAccess.rulesOf([custom([forbid])], roles);

    // Assert
    expect(rules.map((rule) => rule.action)).toEqual([action]);
  });

  test("should deny the legacy read action where a widened forbid matches and allow it elsewhere", () => {
    // Setup
    const grant = custom([
      {
        action: [
          ProjectPermissionSecretActions.DescribeAndReadValue,
          ProjectPermissionSecretActions.ReadValue,
          ProjectPermissionSecretActions.DescribeSecret
        ],
        subject: ProjectPermissionSub.Secrets
      },
      {
        action: [ProjectPermissionSecretActions.ReadValue, ProjectPermissionSecretActions.DescribeSecret],
        subject: ProjectPermissionSub.Secrets,
        conditions: { environment: "dev" },
        inverted: true
      }
    ] as TProjectRule[]);
    const permission = permissionOf(ProjectAccess.rulesOf([grant], roles));

    // Action
    const inDev = [
      ProjectPermissionSecretActions.ReadValue,
      ProjectPermissionSecretActions.DescribeSecret,
      ProjectPermissionSecretActions.DescribeAndReadValue
    ].map((action) => permission.can(secrets(action, { environment: "dev", secretPath: "/" })));
    const inProd = [ProjectPermissionSecretActions.ReadValue, ProjectPermissionSecretActions.DescribeAndReadValue].map(
      (action) => permission.can(secrets(action))
    );

    // Assert
    expect(inDev).toEqual([false, false, false]);
    expect(inProd).toEqual([true, true]);
  });

  test("should put every cannot rule after the allow rules, so one role's deny is not undone by another's allow", () => {
    // Setup
    const grants = [
      custom([{ action: ProjectPermissionActions.Edit, subject: ProjectPermissionSub.Tags, inverted: true }]),
      builtIn(ProjectMembershipRole.Admin)
    ];

    // Action
    const { rules } = ProjectAccess.rulesOf(grants, roles);

    // Assert
    const polarity = rules.map((rule) => Boolean(rule.inverted));
    expect(polarity.indexOf(true)).toBeGreaterThan(polarity.lastIndexOf(false));
    expect(
      permissionOf(RuleSet.of(rules)).can({
        action: ProjectPermissionActions.Edit,
        subject: ProjectPermissionSub.Tags
      })
    ).toBe(false);
  });
});

describe("ProjectAccess.holdsBuiltInAdmin", () => {
  test("should be true for the built-in admin role only", async () => {
    // Setup
    const [admin, lookalike, expired] = await Promise.all([
      accessWith([{ role: ProjectMembershipRole.Admin }]),
      accessWith([], [{ action: ProjectPermissionActions.Read, subject: ProjectPermissionSub.Tags }]),
      accessWith([{ role: ProjectMembershipRole.Admin, temporaryAccessEndTime: PAST() }, { role: "viewer" }])
    ]);

    // Action
    const isAdmin = [admin, lookalike, expired].map((access) => access.holdsBuiltInAdmin);

    // Assert
    expect(isAdmin).toEqual([true, false, false]);
  });
});

describe("ProjectAccess.toPermission", () => {
  test("should let overrides decide wherever their conditions match and leave the roles everywhere else", async () => {
    // Setup
    const access = await accessWith([{ role: ProjectMembershipRole.Member }]);
    const overrides = RuleSet.of<TProjectRule>([
      {
        action: ProjectPermissionSecretActions.ReadValue,
        subject: ProjectPermissionSub.Secrets,
        conditions: { environment: "prod", secretPath: { $glob: "/locked/**" } },
        inverted: true
      } as TProjectRule
    ]);

    // Action
    const permission = access.toPermission({ overrides });

    // Assert
    expect(
      permission.can(
        secrets(ProjectPermissionSecretActions.ReadValue, { environment: "prod", secretPath: "/locked/a" })
      )
    ).toBe(false);
    expect(
      permission.can(secrets(ProjectPermissionSecretActions.ReadValue, { environment: "prod", secretPath: "/open" }))
    ).toBe(true);
  });

  test("should let an override allow what the roles deny where it matches", async () => {
    // Setup
    const access = await accessWith([{ role: ProjectMembershipRole.NoAccess }]);
    const overrides = RuleSet.of<TProjectRule>([
      {
        action: ProjectPermissionSecretActions.ReadValue,
        subject: ProjectPermissionSub.Secrets,
        conditions: { environment: "dev" }
      } as TProjectRule
    ]);

    // Action
    const permission = access.toPermission({ overrides });

    // Assert
    expect(
      permission.can(secrets(ProjectPermissionSecretActions.ReadValue, { environment: "dev", secretPath: "/" }))
    ).toBe(true);
    expect(permission.can(secrets(ProjectPermissionSecretActions.ReadValue))).toBe(false);
  });

  test("should give the roles' permission alone when there are no overrides", async () => {
    // Setup
    const access = await accessWith([{ role: ProjectMembershipRole.Viewer }]);

    // Action
    const permission = access.toPermission();

    // Assert
    expect(permission.rules).toEqual(access.roleRules().rules);
    expect(permission.project.id).toBe(access.project.id);
  });
});
