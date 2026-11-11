import { randomUUID } from "node:crypto";

import { DataAccessDb } from "@app/domains/lib/data-access-db";
import { setupIntegration } from "@app/domains/lib/testing/integration";

import { OrganizationsModule } from "../module";

describe("OrganizationsModule.findActorOrg", () => {
  const h = setupIntegration();

  const build = () => new OrganizationsModule({ db: DataAccessDb.fromClient(h.db) }).service;

  test("should give a sub-org its root org's sign-in policy and the root and parent ids", async () => {
    // Setup
    const root = await h.factories.organization({ authEnforced: true, bypassOrgAuthEnabled: true });
    const sub = await h.factories.organization({ rootOrgId: root.id, parentOrgId: root.id });

    // Action
    const org = await build().findActorOrg({ orgId: sub.id });

    // Assert
    expect(org).toMatchObject({ id: sub.id, rootOrgId: root.id, parentOrgId: root.id });
    expect(org?.ssoPolicy).toEqual({ authEnforced: true, googleSsoAuthEnforced: false, bypassOrgAuthEnabled: true });
  });

  test("should give a root org itself as root and parent", async () => {
    // Setup
    const root = await h.factories.organization({ shouldUseNewPrivilegeSystem: false });

    // Action
    const org = await build().findActorOrg({ orgId: root.id });

    // Assert
    expect(org).toMatchObject({ rootOrgId: root.id, parentOrgId: root.id, shouldUseNewPrivilegeSystem: false });
  });

  test("should find nothing for an org that does not exist", async () => {
    // Setup
    const service = build();

    // Action
    const org = await service.findActorOrg({ orgId: randomUUID() });

    // Assert
    expect(org).toBeUndefined();
  });

  test("should resolve a sub-org to its root, and a root org to itself", async () => {
    // Setup
    const root = await h.factories.organization();
    const sub = await h.factories.organization({ rootOrgId: root.id, parentOrgId: root.id });
    const service = build();

    // Action
    const roots = await Promise.all([service.resolveRootOrgId(sub.id), service.resolveRootOrgId(root.id)]);

    // Assert
    expect(roots).toEqual([root.id, root.id]);
  });
});
