import { randomUUID } from "node:crypto";

import { createMongoAbility, MongoAbility } from "@casl/ability";

import { AccessScope, ProjectMembershipRole, ProjectType } from "@app/db/schemas";
import { ActorGrants, RuleIdentity, RuleSet } from "@app/domains/platform/access-control/ce/module";
import { buildAccessControl } from "@app/domains/platform/access-control/ce/testing/build-access-control";
import { userPrincipal } from "@app/domains/platform/organizations/ce/testing/actor-context-fixture";
import { ActorType } from "@app/lib/auth/actor-types";
import type { TPrincipal } from "@app/lib/auth/principal";

import { Project } from "./project";
import { ProjectPermission } from "./project-permission";
import {
  ProjectPermissionActions,
  ProjectPermissionIdentityActions,
  ProjectPermissionMemberActions,
  ProjectPermissionSecretActions,
  ProjectPermissionSet,
  ProjectPermissionSub
} from "./project-permission-set";
import { projectAdminPermissions, projectMemberPermissions } from "./project-roles";
import { TProjectRule } from "./standard-project-roles";

const project = (overrides: Partial<Parameters<typeof Project.restore>[0]> = {}) =>
  Project.restore({
    id: randomUUID(),
    name: "payments",
    slug: "payments",
    orgId: randomUUID(),
    type: ProjectType.SecretManager,
    ...overrides
  });

const readValue = (fields: Record<string, unknown>) =>
  ({ action: ProjectPermissionSecretActions.ReadValue, subject: ProjectPermissionSub.Secrets, fields }) as const;
const createMember = { action: ProjectPermissionMemberActions.Create, subject: ProjectPermissionSub.Member } as const;

const adminGrants = async () => {
  const { grantStore, seed } = buildAccessControl();
  const orgId = randomUUID();
  const projectId = randomUUID();
  const userId = randomUUID();
  await seed.membership({
    scope: AccessScope.Project,
    orgId,
    projectId,
    actor: { userId },
    roles: [{ role: ProjectMembershipRole.Admin }]
  });
  return grantStore.findActorGrants(
    { type: ActorType.USER, id: userId },
    { scope: AccessScope.Project, orgId, projectId }
  );
};

const build = ({
  rules,
  grants = ActorGrants.empty(),
  principal = userPrincipal(),
  identity = RuleIdentity.create({ id: principal.id, username: "ada", metadata: {} })
}: {
  rules: TProjectRule[];
  grants?: ActorGrants;
  principal?: TPrincipal;
  identity?: RuleIdentity;
}) => ProjectPermission.build({ rules: RuleSet.of(rules), project: project(), grants, principal, identity });

describe("ProjectPermission.build", () => {
  test("should fill the identity's username, metadata and auth into conditions", () => {
    // Setup
    const rules = [
      {
        action: ProjectPermissionSecretActions.ReadValue,
        subject: ProjectPermissionSub.Secrets,
        conditions: {
          environment: "{{identity.metadata.env}}",
          secretPath: "/{{identity.username}}/{{identity.auth.kubernetes.namespace}}"
        }
      } as TProjectRule
    ];
    const identity = RuleIdentity.create({
      id: randomUUID(),
      username: "deployer",
      metadata: { env: "prod" },
      auth: { kubernetes: { namespace: "billing" } }
    });

    // Action
    const permission = build({ rules, identity });

    // Assert
    expect(permission.can(readValue({ environment: "prod", secretPath: "/deployer/billing" }))).toBe(true);
    expect(permission.can(readValue({ environment: "prod", secretPath: "/deployer/other" }))).toBe(false);
  });

  test("should keep a metadata placeholder the identity cannot fill, so it matches nothing", () => {
    // Setup
    const rules = [
      {
        action: ProjectPermissionSecretActions.ReadValue,
        subject: ProjectPermissionSub.Secrets,
        conditions: { secretPath: "/{{identity.metadata.team}}" }
      } as TProjectRule
    ];

    // Action
    const permission = build({ rules });

    // Assert
    expect(permission.can(readValue({ environment: "prod", secretPath: "/" }))).toBe(false);
    expect(permission.rules[0].conditions).toEqual({ secretPath: "/{{identity.metadata.team}}" });
  });

  test("should leave a delegated OAuth token secret reads only, even for an admin, keeping deny rules", () => {
    // Setup
    const deny = {
      action: ProjectPermissionSecretActions.ReadValue,
      subject: ProjectPermissionSub.Secrets,
      conditions: { environment: "prod" },
      inverted: true
    } as TProjectRule;
    const principal = userPrincipal({ oauth: { clientId: "client", scopes: ["secrets:read"] } });

    // Action
    const permission = build({ rules: [...projectAdminPermissions, deny], principal });

    // Assert
    expect(permission.can(readValue({ environment: "dev", secretPath: "/" }))).toBe(true);
    expect(permission.can(readValue({ environment: "prod", secretPath: "/" }))).toBe(false);
    expect(permission.can(createMember)).toBe(false);
    expect(permission.can({ action: ProjectPermissionActions.Read, subject: ProjectPermissionSub.SecretImports })).toBe(
      true
    );
    expect(permission.can({ action: ProjectPermissionActions.Edit, subject: ProjectPermissionSub.SecretImports })).toBe(
      false
    );
  });

  test("should allow nothing for a token delegated with an empty scope list", () => {
    // Setup
    const principal = userPrincipal({ oauth: { clientId: "client", scopes: [] } });

    // Action
    const permission = build({ rules: projectAdminPermissions, principal });

    // Assert
    expect(permission.rules).toEqual([]);
  });

  test("should keep the full rules for a fully delegated token with no scope list", () => {
    // Setup
    const principal = userPrincipal({ oauth: { clientId: "client" } });

    // Action
    const permission = build({ rules: projectAdminPermissions, principal });

    // Assert
    expect(permission.can(createMember)).toBe(true);
  });
});

describe("ProjectPermission.hasRole", () => {
  test("should report the actor's roles, and none for a delegated OAuth token", async () => {
    // Setup
    const grants = await adminGrants();
    const delegated = userPrincipal({ oauth: { clientId: "client", scopes: ["secrets:read"] } });

    // Action
    const full = build({ rules: projectAdminPermissions, grants });
    const narrowed = build({ rules: projectAdminPermissions, grants, principal: delegated });

    // Assert
    expect([full.hasRole({ slug: "admin" }), full.isAdmin]).toEqual([true, true]);
    expect([narrowed.hasRole({ slug: "admin" }), narrowed.hasBuiltInRole({ slug: "admin" }), narrowed.isAdmin]).toEqual(
      [false, false, false]
    );
  });
});

describe("ProjectPermission.forServiceToken", () => {
  test("should allow what the token's scopes and permissions name, and nothing else", () => {
    // Setup
    const scopes = [{ environment: "dev", secretPath: "/app/**" }];

    // Action
    const permission = ProjectPermission.forServiceToken({ project: project(), scopes, permissions: ["read"] });

    // Assert
    const read = (fields: Record<string, unknown>) =>
      permission.can({ action: ProjectPermissionActions.Read, subject: ProjectPermissionSub.Secrets, fields });
    expect(read({ environment: "dev", secretPath: "/app/db" })).toBe(true);
    expect(read({ environment: "prod", secretPath: "/app/db" })).toBe(false);
    expect(
      permission.can({
        action: ProjectPermissionActions.Edit,
        subject: ProjectPermissionSub.Secrets,
        fields: { environment: "dev", secretPath: "/app/db" }
      })
    ).toBe(false);
  });

  test("should hold no roles or memberships", () => {
    // Action
    const permission = ProjectPermission.forServiceToken({ project: project(), scopes: [], permissions: ["write"] });

    // Assert
    expect(permission.hasRole({ slug: "admin" })).toBe(false);
    expect(permission.memberships).toEqual([]);
  });
});

describe("ProjectPermission.hasProjectEnforcement", () => {
  test("should report the project's encrypted secret metadata enforcement", () => {
    // Setup
    const [enforced, relaxed] = [true, false].map((enforceEncryptedSecretManagerSecretMetadata) =>
      ProjectPermission.forServiceToken({
        project: project({ enforceEncryptedSecretManagerSecretMetadata }),
        scopes: [],
        permissions: []
      })
    );

    // Action
    const answers = [enforced, relaxed].map((permission) =>
      permission.hasProjectEnforcement({ name: "enforceEncryptedSecretManagerSecretMetadata" })
    );

    // Assert
    expect(answers).toEqual([true, false]);
  });
});

describe("Project roles and identity auth configuration", () => {
  const admin = createMongoAbility<MongoAbility<ProjectPermissionSet>>(projectAdminPermissions);
  const member = createMongoAbility<MongoAbility<ProjectPermissionSet>>(projectMemberPermissions);

  test("should let a project admin configure identity auth methods", () => {
    // Action
    const can = admin.can(ProjectPermissionIdentityActions.EditAuth, ProjectPermissionSub.Identity);

    // Assert
    expect(can).toBe(true);
  });

  test("should not let a project member configure identity auth methods, while it may still edit identities", () => {
    // Action
    const canEditAuth = member.can(ProjectPermissionIdentityActions.EditAuth, ProjectPermissionSub.Identity);
    const canEdit = member.can(ProjectPermissionIdentityActions.Edit, ProjectPermissionSub.Identity);

    // Assert
    expect(canEditAuth).toBe(false);
    expect(canEdit).toBe(true);
  });
});
