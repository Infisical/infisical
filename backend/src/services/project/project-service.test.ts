import { createMongoAbility } from "@casl/ability";
import { describe, expect, test, vi } from "vitest";

import { OrgMembershipStatus, ProjectType } from "@app/db/schemas";
import { FakeLicenseService } from "@app/domains/platform/license/ce/testing/fake-license-service";
import { BadRequestError } from "@app/lib/errors";
import { ActorType } from "@app/services/auth/auth-type";
import { CertStatus } from "@app/services/certificate/certificate-types";

import { projectServiceFactory } from "./project-service";

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
  const permissionService = {
    getOrgPermission: vi.fn().mockResolvedValue({ permission: { cannot: () => false } })
  };
  const licenseService = new FakeLicenseService();
  const service = projectServiceFactory({
    orgDAL,
    projectDAL,
    permissionService,
    licenseService
  } as unknown as Parameters<typeof projectServiceFactory>[0]);

  return { service, orgDAL, projectDAL, permissionService, licenseService, memberships, tx };
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
      actor: ActorType.USER,
      actorId: "user",
      actorOrgId: "root",
      actorAuthMethod: null,
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

describe("org-scoped product projects", () => {
  test("rejects creating PAM projects directly", async () => {
    const { service, projectDAL } = setup();

    await expect(
      service.createProject({
        actor: ActorType.USER,
        actorId: "user",
        actorOrgId: "root",
        actorAuthMethod: null,
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
        actor: ActorType.USER,
        actorId: "user",
        actorOrgId: "root",
        actorAuthMethod: null,
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
      permissionService: {
        getProjectPermission: vi.fn().mockResolvedValue({
          permission: createMongoAbility([{ action: "manage", subject: "all" }])
        })
      },
      certificateDAL,
      licenseService: new FakeLicenseService()
    } as unknown as Parameters<typeof projectServiceFactory>[0]);

    const result = await service.searchCertificatesWithCurrentStatus({
      filter: { type: "id", projectId: "project" },
      actor: ActorType.USER,
      actorId: "user",
      actorOrgId: "org",
      actorAuthMethod: null,
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
