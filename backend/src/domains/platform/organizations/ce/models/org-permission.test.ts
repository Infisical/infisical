import { randomUUID } from "node:crypto";

import { createMongoAbility, MongoAbility } from "@casl/ability";
import { packRules, unpackRules } from "@casl/ability/extra";

import { AccessScope, OrgMembershipRole } from "@app/db/schemas";
import { Grant, RuleIdentity, TPermissionRule } from "@app/domains/platform/access-control/ce/module";
import { buildAccessControl } from "@app/domains/platform/access-control/ce/testing/build-access-control";
import { PAST, TSeedRole } from "@app/domains/platform/access-control/ce/testing/grant-fixture";
import { ActorType } from "@app/lib/auth/actor-types";

import { userPrincipal } from "../testing/actor-context-fixture";
import { OrgPermission } from "./org-permission";
import {
  orgAdminPermissions,
  orgMemberPermissions,
  OrgPermissionIdentityActions,
  OrgPermissionMemberActions,
  OrgPermissionSet,
  OrgPermissionSsoActions,
  OrgPermissionSubjects
} from "./org-permission-set";

type TOrgRule = TPermissionRule<OrgPermissionSet>;

const createMember = { action: OrgPermissionMemberActions.Create, subject: OrgPermissionSubjects.Member } as const;
const readMember = { action: OrgPermissionMemberActions.Read, subject: OrgPermissionSubjects.Member } as const;

// The grants a user holds in one org, read back through the in-memory store.
const grantsWith = async ({ roles = [], customRules }: { roles?: TSeedRole[]; customRules?: TOrgRule[] }) => {
  const { grantStore, seed } = buildAccessControl();
  const orgId = randomUUID();
  const userId = randomUUID();
  const custom = customRules
    ? await seed.role({ owner: { orgId }, slug: "inviter", permissions: packRules(customRules) })
    : null;
  await seed.membership({
    scope: AccessScope.Organization,
    orgId,
    actor: { userId },
    roles: custom ? [...roles, { role: OrgMembershipRole.Custom, customRoleId: custom.id }] : roles
  });
  return grantStore.findActorGrants({ type: ActorType.USER, id: userId }, { scope: AccessScope.Organization, orgId });
};

describe("OrgPermission.fromGrants", () => {
  test("should let a deny from one role stand over another role's allow", async () => {
    // Setup
    const grants = await grantsWith({
      roles: [{ role: OrgMembershipRole.Admin }],
      customRules: [{ ...createMember, inverted: true }]
    });

    // Action
    const permission = OrgPermission.fromGrants({ grants });

    // Assert
    expect(permission.can(createMember)).toBe(false);
    expect(permission.can(readMember)).toBe(true);
  });

  test("should leave out a temporary role that has ended", async () => {
    // Setup
    const grants = await grantsWith({
      roles: [{ role: OrgMembershipRole.Admin, temporaryAccessEndTime: PAST() }, { role: OrgMembershipRole.Member }]
    });

    // Action
    const permission = OrgPermission.fromGrants({ grants });

    // Assert
    expect(permission.can(createMember)).toBe(false);
    expect(permission.can(readMember)).toBe(true);
  });

  test("should keep only the deny rules for a delegated OAuth token", async () => {
    // Setup
    const grants = await grantsWith({
      roles: [{ role: OrgMembershipRole.Admin }],
      customRules: [{ ...createMember, inverted: true }]
    });
    const principal = userPrincipal({ oauth: { clientId: "client", scopes: ["secrets:read"] } });

    // Action
    const permission = OrgPermission.fromGrants({ grants, principal });

    // Assert
    expect(permission.rules).toEqual(unpackRules(packRules([{ ...createMember, inverted: true }])));
    expect(permission.can(readMember)).toBe(false);
  });

  test("should leave a fully delegated token, with no scope list, its full roles", async () => {
    // Setup
    const grants = await grantsWith({ roles: [{ role: OrgMembershipRole.Admin }] });
    const principal = userPrincipal({ oauth: { clientId: "client" } });

    // Action
    const permission = OrgPermission.fromGrants({ grants, principal });

    // Assert
    expect(permission.can(createMember)).toBe(true);
  });

  test("should tell a held built-in role from a custom role that only shares its slug", async () => {
    // Setup
    const { grantStore, seed } = buildAccessControl();
    const orgId = randomUUID();
    const userId = randomUUID();
    const fakeAdmin = await seed.role({ owner: { orgId }, slug: OrgMembershipRole.Admin });
    await seed.membership({
      scope: AccessScope.Organization,
      orgId,
      actor: { userId },
      roles: [{ role: OrgMembershipRole.Custom, customRoleId: fakeAdmin.id }]
    });
    const grants = await grantStore.findActorGrants(
      { type: ActorType.USER, id: userId },
      { scope: AccessScope.Organization, orgId }
    );

    // Action
    const permission = OrgPermission.fromGrants({ grants });

    // Assert
    expect(permission.hasRole({ slug: OrgMembershipRole.Admin })).toBe(true);
    expect(permission.hasBuiltInRole({ slug: OrgMembershipRole.Admin })).toBe(false);
  });
});

describe("OrgPermission.canBypassSso", () => {
  test("should let an org admin bypass SSO enforcement and not an org member", async () => {
    // Setup
    const [admin, member] = await Promise.all([
      grantsWith({ roles: [{ role: OrgMembershipRole.Admin }] }),
      grantsWith({ roles: [{ role: OrgMembershipRole.Member }] })
    ]);

    // Action
    const can = [admin, member].map((grants) => OrgPermission.fromGrants({ grants }).canBypassSso());

    // Assert
    expect(can).toEqual([true, false]);
  });

  test("should let a custom role that grants the bypass through", async () => {
    // Setup
    const grants = await grantsWith({
      roles: [{ role: OrgMembershipRole.Member }],
      customRules: [{ action: OrgPermissionSsoActions.BypassSsoEnforcement, subject: OrgPermissionSubjects.Sso }]
    });

    // Action
    const can = OrgPermission.fromGrants({ grants }).canBypassSso();

    // Assert
    expect(can).toBe(true);
  });
});

describe("OrgPermission.forGrant", () => {
  const scopedRead: TOrgRule = {
    action: OrgPermissionMemberActions.Read,
    subject: OrgPermissionSubjects.Member,
    conditions: { username: "{{identity.username}}", team: "{{identity.metadata.team}}" }
  } as TOrgRule;

  test("should fill a stored identity's username and metadata", () => {
    // Setup
    const grant = Grant.restore({ slug: OrgMembershipRole.Custom, packedRules: packRules([scopedRead]) });
    const identity = RuleIdentity.create({ id: randomUUID(), username: "ada", metadata: { team: "payments" } });

    // Action
    const permission = OrgPermission.forGrant({ grant, identity });

    // Assert
    expect(permission.rules[0].conditions).toEqual({ username: "ada", team: "payments" });
  });

  test("should leave a metadata key the identity does not carry as its placeholder", () => {
    // Setup
    const grant = Grant.restore({ slug: OrgMembershipRole.Custom, packedRules: packRules([scopedRead]) });
    const identity = RuleIdentity.create({ id: randomUUID(), username: "ada", metadata: {} });

    // Action
    const permission = OrgPermission.forGrant({ grant, identity });

    // Assert
    expect(permission.rules[0].conditions).toEqual({ username: "ada", team: "{{identity.metadata.team}}" });
  });

  test("should leave a rule that reads identity.auth unrendered", () => {
    // Setup
    const authScoped = {
      ...scopedRead,
      conditions: { username: "{{identity.username}}", namespace: "{{identity.auth.kubernetes.namespace}}" }
    } as TOrgRule;
    const grant = Grant.restore({ slug: OrgMembershipRole.Custom, packedRules: packRules([authScoped]) });
    const identity = RuleIdentity.create({ id: randomUUID(), username: "ada", metadata: {} });

    // Action
    const permission = OrgPermission.forGrant({ grant, identity });

    // Assert
    expect(permission.rules[0].conditions).toEqual(authScoped.conditions);
  });

  test("should give a built-in slug its rules", () => {
    // Setup
    const grant = Grant.restore({ slug: OrgMembershipRole.Member });

    // Action
    const permission = OrgPermission.forGrant({ grant });

    // Assert
    expect(permission.rules).toEqual(orgMemberPermissions);
  });
});

describe("Org roles and identity auth configuration", () => {
  const admin = createMongoAbility<MongoAbility<OrgPermissionSet>>(orgAdminPermissions);
  const member = createMongoAbility<MongoAbility<OrgPermissionSet>>(orgMemberPermissions);

  test("should let an org admin configure identity auth methods", () => {
    // Action
    const can = admin.can(OrgPermissionIdentityActions.EditAuth, OrgPermissionSubjects.Identity);

    // Assert
    expect(can).toBe(true);
  });

  test("should not let an org member configure identity auth methods, while it may still edit identities", () => {
    // Action
    const canEditAuth = member.can(OrgPermissionIdentityActions.EditAuth, OrgPermissionSubjects.Identity);
    const canEdit = member.can(OrgPermissionIdentityActions.Edit, OrgPermissionSubjects.Identity);

    // Assert
    expect(canEditAuth).toBe(false);
    expect(canEdit).toBe(true);
  });
});
