import { randomUUID } from "node:crypto";

import { OrganizationActionScope } from "@app/db/schemas";
import { PermissionDeniedError } from "@app/domains/lib/errors";
import { AuthMethod } from "@app/lib/auth/actor-types";

import { actorOrg } from "../testing/actor-context-fixture";
import { Organization } from "./organization";
import { FOREIGN_SSO_SESSION_ERROR_NAME } from "./sso-policy";

describe("Organization.assertLevel", () => {
  test("should refuse a sub-org for a parent-only operation", () => {
    // Setup
    const org = Organization.fromActorOrg(actorOrg({ rootOrgId: randomUUID() }));

    // Action
    const result = () => org.assertLevel(OrganizationActionScope.ParentOrganization);

    // Assert
    expect(result).toThrow(PermissionDeniedError);
    expect(result).toThrow("Child organization cannot do this operation");
  });

  test("should refuse a root org for a child-only operation", () => {
    // Setup
    const org = Organization.fromActorOrg(actorOrg());

    // Action
    const result = () => org.assertLevel(OrganizationActionScope.ChildOrganization);

    // Assert
    expect(result).toThrow("Parent organization cannot do this operation");
  });

  test("should allow each level its own operations and any level the shared ones", () => {
    // Setup
    const root = Organization.fromActorOrg(actorOrg());
    const sub = Organization.fromActorOrg(actorOrg({ rootOrgId: randomUUID() }));

    // Action
    const allowed = () => {
      root.assertLevel(OrganizationActionScope.ParentOrganization);
      root.assertLevel(OrganizationActionScope.Any);
      sub.assertLevel(OrganizationActionScope.ChildOrganization);
      sub.assertLevel(OrganizationActionScope.Any);
    };

    // Assert
    expect(allowed).not.toThrow();
  });
});

describe("Organization.ssoPolicy", () => {
  test("should check a sub-org session against the root org's IdP, not the sub-org's own id", () => {
    // Setup
    const rootOrgId = randomUUID();
    const subOrg = actorOrg({ rootOrgId, ssoPolicy: { authEnforced: true } });
    const policy = Organization.fromActorOrg(subOrg).ssoPolicy();

    // Action
    const fromRoot = policy.refusalFor({ authMethod: AuthMethod.OKTA_SAML, sessionRootOrgId: rootOrgId });
    const fromSubOrgId = policy.refusalFor({ authMethod: AuthMethod.OKTA_SAML, sessionRootOrgId: subOrg.id });

    // Assert
    expect(fromRoot).toBeNull();
    expect(fromSubOrgId?.name).toBe(FOREIGN_SSO_SESSION_ERROR_NAME);
  });
});
