import { describe, expect, test, vi } from "vitest";

import { OrgMembershipStatus, ProjectType } from "@app/db/schemas";
import type { TActorContext } from "@app/domains/lib/actor-context";
import { Permission } from "@app/domains/platform/access-control/ce/module";
import { FakeLicenseService } from "@app/domains/platform/license/ce/testing/fake-license-service";
import { ActorType } from "@app/lib/auth/actor-types";
import { BadRequestError } from "@app/lib/errors";
import { CertStatus } from "@app/services/certificate/certificate-types";

import { projectServiceFactory } from "./project-service";

const config = { INFISICAL_CLOUD: false };

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => config
}));

const setup = () => {
  const memberships = new Map<
    string,
    { isActive: boolean; status: OrgMembershipStatus | null; actorGroupId: string | null }
  >([["accessible-sub-org", { isActive: true, status: OrgMembershipStatus.Accepted, actorGroupId: null }]]);
  const orgDAL = {
    findOne: vi.fn().mockResolvedValue({ id: "root" }),
    listOrganizationsWithSubOrgs: vi.fn().mockResolvedValue([
      { id: "root", subOrganizations: [{ id: "accessible-sub-org" }] },
      { id: "other-root", subOrganizations: [{ id: "other-sub-org" }] }
    ]),
    findEffectiveOrgMembership: vi.fn(async ({ orgId, status }: { orgId: string; status: OrgMembershipStatus }) => {
      const membership = memberships.get(orgId);
      return membership && (membership.status === status || membership.status === null) ? membership : null;
    })
  };
  const tx = { raw: vi.fn() };
  const projectDAL = {
    findUserProjects: vi.fn().mockResolvedValue([]),
    find: vi.fn().mockResolvedValue([]),
    transaction: vi.fn(<T>(cb: (trx: unknown) => Promise<T>) => cb(tx))
  };
  const orgPermissionService = {
    getOrgPermission: vi.fn().mockResolvedValue({ cannot: () => false })
  };
  const licenseService = new FakeLicenseService();
  const service = projectServiceFactory({
    orgDAL,
    projectDAL,
    orgPermissionService,
    licenseService
  } as unknown as Parameters<typeof projectServiceFactory>[0]);

  return { service, orgDAL, projectDAL, orgPermissionService, licenseService, memberships, tx };
};

describe("project navigation across sub-organizations", () => {
  test("limits project membership lookup to the current root and its accessible sub-organizations", async () => {
    const { service, orgDAL, projectDAL } = setup();

    await service.getAccessibleProjectsWithSubOrgs({ actorId: "user", actorOrgId: "root" });

    expect(orgDAL.listOrganizationsWithSubOrgs).toHaveBeenCalledWith({ actorId: "user" });
    expect(orgDAL.findEffectiveOrgMembership).toHaveBeenCalledExactlyOnceWith({
      actorType: ActorType.USER,
      actorId: "user",
      orgId: "accessible-sub-org",
      status: OrgMembershipStatus.Accepted
    });
    expect(projectDAL.findUserProjects).toHaveBeenCalledExactlyOnceWith("user", ["root", "accessible-sub-org"]);
  });

  test.each([
    { label: "inactive direct", isActive: false, status: OrgMembershipStatus.Accepted, actorGroupId: null },
    { label: "inactive group", isActive: false, status: OrgMembershipStatus.Accepted, actorGroupId: "group" },
    { label: "invited", isActive: true, status: OrgMembershipStatus.Invited, actorGroupId: null }
  ])("excludes projects with $label sub-organization membership", async ({ isActive, status, actorGroupId }) => {
    const { service, projectDAL, memberships } = setup();
    memberships.set("accessible-sub-org", { isActive, status, actorGroupId });
    const retainedProject = {
      id: "project",
      orgId: "accessible-sub-org",
      name: "Platform",
      slug: "platform",
      type: "secret-manager"
    };
    projectDAL.findUserProjects.mockImplementation(async (_userId: string, orgIds: string[]) =>
      orgIds.includes(retainedProject.orgId) ? [retainedProject] : []
    );

    await expect(service.getAccessibleProjectsWithSubOrgs({ actorId: "user", actorOrgId: "root" })).resolves.toEqual(
      []
    );
    expect(projectDAL.findUserProjects).toHaveBeenCalledExactlyOnceWith("user", ["root"]);
  });

  test("excludes a sub-organization whose effective membership no longer exists", async () => {
    const { service, projectDAL, memberships } = setup();
    memberships.delete("accessible-sub-org");

    await service.getAccessibleProjectsWithSubOrgs({ actorId: "user", actorOrgId: "root" });

    expect(projectDAL.findUserProjects).toHaveBeenCalledExactlyOnceWith("user", ["root"]);
  });

  test.each([OrgMembershipStatus.Accepted, null])("retains active group membership with status %s", async (status) => {
    const { service, projectDAL, memberships } = setup();
    memberships.set("accessible-sub-org", { isActive: true, status, actorGroupId: "group" });

    await service.getAccessibleProjectsWithSubOrgs({ actorId: "user", actorOrgId: "root" });

    expect(projectDAL.findUserProjects).toHaveBeenCalledExactlyOnceWith("user", ["root", "accessible-sub-org"]);
  });

  test("does not query projects when membership validation fails", async () => {
    const { service, orgDAL, projectDAL } = setup();
    orgDAL.findEffectiveOrgMembership.mockRejectedValue(new Error("Membership lookup failed"));

    await expect(service.getAccessibleProjectsWithSubOrgs({ actorId: "user", actorOrgId: "root" })).rejects.toThrow(
      "Membership lookup failed"
    );
    expect(projectDAL.findUserProjects).not.toHaveBeenCalled();
  });

  test("does not expand a sub-organization session into its parent or siblings", async () => {
    const { service, projectDAL } = setup();

    await service.getAccessibleProjectsWithSubOrgs({ actorId: "user", actorOrgId: "accessible-sub-org" });

    expect(projectDAL.findUserProjects).toHaveBeenCalledExactlyOnceWith("user", ["accessible-sub-org"]);
  });

  test("keeps the existing organization scope when no accessible root matches", async () => {
    const { service, orgDAL, projectDAL } = setup();
    orgDAL.listOrganizationsWithSubOrgs.mockResolvedValue([]);

    await service.getAccessibleProjectsWithSubOrgs({ actorId: "user", actorOrgId: "root" });

    expect(projectDAL.findUserProjects).toHaveBeenCalledExactlyOnceWith("user", ["root"]);
  });

  test("returns only project navigation metadata", async () => {
    const { service, projectDAL } = setup();
    const project = {
      id: "project",
      orgId: "accessible-sub-org",
      name: "Platform",
      slug: "platform",
      type: "secret-manager"
    };
    projectDAL.findUserProjects.mockResolvedValue([{ ...project, environments: [{ name: "Production" }], roles: [] }]);

    await expect(service.getAccessibleProjectsWithSubOrgs({ actorId: "user", actorOrgId: "root" })).resolves.toEqual([
      project
    ]);
  });
});

describe("secret scanning project uniqueness", () => {
  const createSecretScanningProject = (service: ReturnType<typeof setup>["service"]) =>
    service.createProject({
      actor: { principal: { type: ActorType.USER, id: "user" }, org: { id: "root" } } as TActorContext,
      projectName: "Scanning",
      type: ProjectType.SecretScanning
    });

  test("rejects a second secret scanning project in the same organization", async () => {
    const { service, projectDAL } = setup();
    projectDAL.find.mockResolvedValue([{ id: "existing-scanning-project" }]);

    await expect(createSecretScanningProject(service)).rejects.toThrow(BadRequestError);
    await expect(createSecretScanningProject(service)).rejects.toThrow(
      "Secret Scanning is limited to one project per organization at this time."
    );
  });

  test("scopes the uniqueness lookup to the organization and the secret scanning type", async () => {
    const { service, projectDAL, tx } = setup();
    projectDAL.find.mockResolvedValue([{ id: "existing-scanning-project" }]);

    await expect(createSecretScanningProject(service)).rejects.toThrow(BadRequestError);

    expect(projectDAL.find).toHaveBeenCalledExactlyOnceWith(
      { orgId: "root", type: ProjectType.SecretScanning },
      { limit: 1, tx }
    );
  });
});

describe("projects per organization cap", () => {
  const createProject = (service: ReturnType<typeof setup>["service"], type: ProjectType) =>
    service.createProject({
      actor: { principal: { type: ActorType.USER, id: "user" }, org: { id: "root" } } as TActorContext,
      projectName: "Capped",
      type
    });

  const onCloud = async (run: () => Promise<void>) => {
    config.INFISICAL_CLOUD = true;
    try {
      await run();
    } finally {
      config.INFISICAL_CLOUD = false;
    }
  };

  test("refuses a Secrets Management project once the organization is at the cap on Infisical Cloud", () =>
    onCloud(async () => {
      const { service, projectDAL, tx, licenseService } = setup();
      licenseService.setPlan("root", { smProjectsPerOrgLimit: 1000 });
      projectDAL.find.mockResolvedValue([{ count: "1000" }]);

      await expect(createProject(service, ProjectType.SecretManager)).rejects.toThrow(
        "Organization already has the maximum of 1000 Secrets Management projects. Delete projects you no longer use before creating another."
      );
      expect(projectDAL.find).toHaveBeenCalledExactlyOnceWith(
        { orgId: "root", type: ProjectType.SecretManager },
        { countDistinct: "id", tx }
      );
    }));

  test("does not cap or count projects of other products", () =>
    onCloud(async () => {
      const { service, projectDAL, licenseService } = setup();
      licenseService.setPlan("root", { smProjectsPerOrgLimit: 1000 });
      projectDAL.find.mockResolvedValue([{ id: "existing-scanning-project" }]);

      await expect(createProject(service, ProjectType.SecretScanning)).rejects.toThrow(
        "Secret Scanning is limited to one project per organization at this time."
      );
      expect(projectDAL.find).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ countDistinct: "id" })
      );
    }));

  test("does not count projects on self-hosted instances", async () => {
    const { service, projectDAL } = setup();
    projectDAL.find.mockResolvedValue([{ count: "1000" }]);

    await createProject(service, ProjectType.SecretManager).catch(() => undefined);

    expect(projectDAL.find).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ countDistinct: "id" })
    );
  });
});

describe("org-scoped product projects", () => {
  test("rejects creating PAM projects directly", async () => {
    const { service, projectDAL } = setup();

    await expect(
      service.createProject({
        actor: { principal: { type: ActorType.USER, id: "user" }, org: { id: "root" } } as TActorContext,
        projectName: "Managed",
        type: ProjectType.PAM
      })
    ).rejects.toThrow(BadRequestError);

    expect(projectDAL.transaction).not.toHaveBeenCalled();
  });

  test("rejects a project template on an Agent Vault project", async () => {
    const { service, projectDAL } = setup();

    await expect(
      service.createProject({
        actor: { principal: { type: ActorType.USER, id: "user" }, org: { id: "root" } } as TActorContext,
        projectName: "Apollo",
        type: ProjectType.AgentVault,
        template: "my-template"
      })
    ).rejects.toThrow("Agent Vault projects don't use project templates");

    expect(projectDAL.transaction).not.toHaveBeenCalled();
  });
});

describe("certificate search with current status", () => {
  test("derives each status and reads rows and count at the same instant", async () => {
    const past = new Date(Date.now() - 86_400_000);
    const future = new Date(Date.now() + 86_400_000);
    const certificateDAL = {
      findWithPrivateKeyInfo: vi.fn().mockResolvedValue([
        { id: "expired", status: CertStatus.ACTIVE, notAfter: past, deletedAt: null },
        { id: "active", status: CertStatus.ACTIVE, notAfter: future, deletedAt: null },
        { id: "deleted", status: CertStatus.ACTIVE, notAfter: future, deletedAt: past }
      ]),
      countCertificatesInProject: vi.fn().mockResolvedValue(3)
    };
    const service = projectServiceFactory({
      projectDAL: { findProjectByFilter: vi.fn().mockResolvedValue({ id: "project" }) },
      projectPermissionService: {
        getProjectPermission: vi
          .fn()
          .mockResolvedValue(Permission.fromRules({ rules: [{ action: "manage", subject: "all" }] }))
      },
      certificateDAL,
      licenseService: new FakeLicenseService()
    } as unknown as Parameters<typeof projectServiceFactory>[0]);

    const result = await service.searchCertificatesWithCurrentStatus({
      filter: { type: "id", projectId: "project" },
      actor: { principal: { type: ActorType.USER, id: "user" }, org: { id: "org" } },
      sortBy: "status"
    } as unknown as Parameters<typeof service.searchCertificatesWithCurrentStatus>[0]);

    expect(result.certificates.map(({ id, status }) => ({ id, status }))).toEqual([
      { id: "expired", status: CertStatus.EXPIRED },
      { id: "active", status: CertStatus.ACTIVE },
      { id: "deleted", status: CertStatus.DELETED }
    ]);
    expect(result.totalCount).toBe(3);

    const [, listOptions] = certificateDAL.findWithPrivateKeyInfo.mock.calls[0] as [
      unknown,
      { sortByCurrentStatus?: boolean; statusAt?: Date }
    ];
    expect(listOptions.sortByCurrentStatus).toBe(true);
    expect(listOptions.statusAt).toBeInstanceOf(Date);
    expect(certificateDAL.countCertificatesInProject.mock.calls[0][2]).toBe(listOptions.statusAt);
  });
});
