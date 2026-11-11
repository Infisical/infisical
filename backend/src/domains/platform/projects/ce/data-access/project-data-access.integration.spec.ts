import { randomUUID } from "node:crypto";

import { ProjectType, TableName } from "@app/db/schemas";
import { DataAccessDb } from "@app/domains/lib/data-access-db";
import { setupIntegration } from "@app/domains/lib/testing/integration";
import { buildAccessControlForTests } from "@app/domains/platform/access-control/ce/testing/build-access-control";
import { FakeLicenseRegistry } from "@app/domains/platform/license/ce/testing/fake-license-registry";
import { OrganizationsModule } from "@app/domains/platform/organizations/ce/module";
import { ActorType, AuthMethod } from "@app/lib/auth/actor-types";

import { ProjectsModule } from "../module";
import { ProjectDataAccess } from "./project-data-access";

describe("ProjectsModule organizations for License", () => {
  const h = setupIntegration();

  const build = () => {
    const licenseRegistry = new FakeLicenseRegistry();
    const db = DataAccessDb.fromClient(h.db);
    // eslint-disable-next-line no-new
    new ProjectsModule({
      db,
      accessControlDomain: buildAccessControlForTests({ db }).service,
      organizationsDomain: new OrganizationsModule({
        db,
        accessControlDomain: buildAccessControlForTests({ db }).service
      }).service,
      licenseRegistry
    });
    return { organizations: licenseRegistry.organizations! };
  };

  const orgTree = async () => {
    const root = await h.factories.organization();
    const sub = await h.factories.organization({ rootOrgId: root.id, parentOrgId: root.id });
    return { root, sub };
  };

  test("should find a sub-org's root, and a root org itself", async () => {
    // Setup
    const { root, sub } = await orgTree();
    const { organizations } = build();

    // Action
    const found = await Promise.all([organizations.findRootOrgId(sub.id), organizations.findRootOrgId(root.id)]);

    // Assert
    expect(found).toEqual([root.id, root.id]);
  });

  test("should find no root for an org that does not exist", async () => {
    // Setup
    const { organizations } = build();

    // Action
    const found = await organizations.findRootOrgId(randomUUID());

    // Assert
    expect(found).toBeNull();
  });

  test("should count live workspaces across the org tree, leaving out products that take no workspace slot", async () => {
    // Setup
    const { root, sub } = await orgTree();
    await h.factories.project({ orgId: root.id, type: ProjectType.SecretManager });
    await h.factories.project({ orgId: sub.id, type: ProjectType.KMS });
    await h.factories.project({ orgId: root.id, type: ProjectType.SecretManager, deleteAfter: new Date() });
    await Promise.all(
      [ProjectType.CertificateManager, ProjectType.SecretScanning, ProjectType.PAM, ProjectType.AgentVault].map(
        (type) => h.factories.project({ orgId: root.id, type })
      )
    );
    const { organizations } = build();

    // Action
    const used = await organizations.countWorkspacesUsed(root.id);

    // Assert
    expect(used).toBe(2);
  });
});

describe("ProjectsModule.getProjectPermission on Postgres", () => {
  const h = setupIntegration();

  const build = () => {
    const db = DataAccessDb.fromClient(h.db);
    const accessControlDomain = buildAccessControlForTests({ db }).service;
    const organizationsDomain = new OrganizationsModule({ db, accessControlDomain }).service;
    return new ProjectsModule({
      db,
      accessControlDomain,
      organizationsDomain,
      licenseRegistry: new FakeLicenseRegistry()
    });
  };

  const actorFor = (tenant: Awaited<ReturnType<typeof h.newTenant>>) => ({
    principal: {
      type: ActorType.USER as const,
      id: tenant.admin.id,
      username: tenant.admin.username,
      email: tenant.admin.email ?? null,
      authMethod: AuthMethod.EMAIL,
      isSuperAdmin: false
    },
    org: {
      id: tenant.org.id,
      name: tenant.org.name,
      rootOrgId: tenant.org.id,
      parentOrgId: tenant.org.id,
      shouldUseNewPrivilegeSystem: true,
      ssoPolicy: { authEnforced: false, googleSsoAuthEnforced: false, bypassOrgAuthEnabled: false }
    },
    plan: async () => {
      throw new Error("not needed");
    }
  });

  test("should give the project admin admin rights in its project", async () => {
    // Setup
    const tenant = await h.newTenant();
    const projects = build();

    // Action
    const permission = await projects.service.getProjectPermission({
      actor: actorFor(tenant),
      projectId: tenant.project.id
    });

    // Assert
    expect(permission.isAdmin).toBe(true);
    expect(permission.project.id).toBe(tenant.project.id);
  });

  test("should report a project's deletion state only once it is scheduled for deletion", async () => {
    // Setup
    const tenant = await h.newTenant();
    const projects = new ProjectDataAccess(DataAccessDb.fromClient(h.db));
    const before = await projects.findDeletionState(tenant.project.id);
    await h.db(TableName.Project).where({ id: tenant.project.id }).update({ deleteAfter: new Date() });

    // Action
    const after = await projects.findDeletionState(tenant.project.id);

    // Assert
    expect(before).toBe("");
    expect(after).not.toBe("");
  });
});
