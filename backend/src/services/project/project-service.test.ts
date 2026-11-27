import { describe, expect, test, vi } from "vitest";

import { OrgMembershipStatus, ProjectType } from "@app/db/schemas";
import { applicationAuditorPermissions } from "@app/domains/certificates/cert-manager/ce/module";
import type { TActorContext } from "@app/domains/lib/actor-context";
import { PermissionDeniedError } from "@app/domains/lib/errors";
import { Permission } from "@app/domains/platform/access-control/ce/module";
import { FakeLicenseService } from "@app/domains/platform/license/ce/testing/fake-license-service";
import { ProjectPermissionCertificateActions, ProjectPermissionSub } from "@app/domains/platform/projects/ce/module";
import { ActorType } from "@app/lib/auth/actor-types";
import { BadRequestError } from "@app/lib/errors";
import { TCertificateDALFactory } from "@app/services/certificate/certificate-dal";
import { CertStatus } from "@app/services/certificate/certificate-types";

import { projectServiceFactory } from "./project-service";
import { ProjectFilterType, TListProjectCertsDTO } from "./project-types";

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

const actorContext = (type: ActorType.USER | ActorType.IDENTITY, id: string) =>
  ({ principal: { type, id }, org: { id: "org" } }) as TActorContext;

const setupCertificateSearch = ({
  memberOf = [],
  readableApplications = [],
  productRules
}: {
  memberOf?: string[];
  readableApplications?: string[];
  productRules: Parameters<typeof Permission.fromRules>[0]["rules"];
}) => {
  const certificateDAL = {
    findWithPrivateKeyInfo: vi.fn<TCertificateDALFactory["findWithPrivateKeyInfo"]>().mockResolvedValue([]),
    countCertificatesInProject: vi.fn<TCertificateDALFactory["countCertificatesInProject"]>().mockResolvedValue(0)
  };
  const membershipDAL = {
    findResourceMembershipsForActor: vi
      .fn()
      .mockResolvedValue(memberOf.map((scopeResourceId) => ({ scopeResourceId, isActive: true })))
  };
  const applicationPermissionService = {
    getApplicationPermission: vi.fn(async ({ applicationId }: { applicationId: string }) =>
      Permission.fromRules({
        rules: readableApplications.includes(applicationId) ? applicationAuditorPermissions : []
      })
    )
  };
  const projectPermissionService = {
    getProjectPermission: vi.fn().mockResolvedValue(Permission.fromRules({ rules: productRules }))
  };
  const service = projectServiceFactory({
    projectDAL: { findProjectByFilter: vi.fn().mockResolvedValue({ id: "project" }) },
    applicationPermissionService,
    projectPermissionService,
    membershipDAL,
    certificateDAL,
    licenseService: new FakeLicenseService()
  } as unknown as Parameters<typeof projectServiceFactory>[0]);

  return { service, certificateDAL, membershipDAL, applicationPermissionService, projectPermissionService };
};

describe("certificate search with current status", () => {
  test("derives each status and reads rows and count at the same instant", async () => {
    const past = new Date(Date.now() - 86_400_000);
    const future = new Date(Date.now() + 86_400_000);
    const { service, certificateDAL } = setupCertificateSearch({
      productRules: [{ action: "manage", subject: "all" }]
    });
    certificateDAL.findWithPrivateKeyInfo.mockResolvedValue([
      { id: "expired", status: CertStatus.ACTIVE, notAfter: past, deletedAt: null },
      { id: "active", status: CertStatus.ACTIVE, notAfter: future, deletedAt: null },
      { id: "deleted", status: CertStatus.ACTIVE, notAfter: future, deletedAt: past }
    ] as never);
    certificateDAL.countCertificatesInProject.mockResolvedValue(3);

    const result = await service.searchCertificatesWithCurrentStatus({
      filter: { type: ProjectFilterType.ID, projectId: "project" },
      offset: 0,
      limit: 25,
      actor: actorContext(ActorType.USER, "user"),
      sortBy: "status",
      authorizeByApplicationRoles: true
    });

    expect(result.certificates.map(({ id, status }) => ({ id, status }))).toEqual([
      { id: "expired", status: CertStatus.EXPIRED },
      { id: "active", status: CertStatus.ACTIVE },
      { id: "deleted", status: CertStatus.DELETED }
    ]);
    expect(result.totalCount).toBe(3);

    const [, listOptions] = certificateDAL.findWithPrivateKeyInfo.mock.calls[0];
    expect(listOptions?.sortByCurrentStatus).toBe(true);
    expect(listOptions?.statusAt).toBeInstanceOf(Date);
    expect(certificateDAL.countCertificatesInProject.mock.calls[0][2]).toBe(listOptions?.statusAt);
  });
});

describe("certificate search scoped to applications", () => {
  const readCertificates = [
    { action: ProjectPermissionCertificateActions.Read, subject: ProjectPermissionSub.Certificates }
  ];

  const setupSearch = (options: Parameters<typeof setupCertificateSearch>[0]) => {
    const { service, certificateDAL, membershipDAL, applicationPermissionService, projectPermissionService } =
      setupCertificateSearch(options);

    const request = (applicationIds?: string[]): TListProjectCertsDTO => ({
      filter: { type: ProjectFilterType.ID, projectId: "project" },
      offset: 0,
      limit: 25,
      actor: actorContext(ActorType.IDENTITY, "identity"),
      applicationIds
    });
    const search = (applicationIds?: string[]) =>
      service.searchCertificatesWithCurrentStatus({ ...request(applicationIds), authorizeByApplicationRoles: true });
    const list = (applicationIds?: string[]) => service.listProjectCertificates(request(applicationIds));
    const searchedWith = () => {
      const [filters, , permissionFilters] = certificateDAL.findWithPrivateKeyInfo.mock.calls[0];
      return { applicationIds: filters.applicationIds, permissionFilters };
    };

    return {
      search,
      list,
      searchedWith,
      certificateDAL,
      membershipDAL,
      applicationPermissionService,
      projectPermissionService
    };
  };

  test("allows a caller who can read certificates in every listed application without product-level Read", async () => {
    const { search, searchedWith, applicationPermissionService, projectPermissionService } = setupSearch({
      memberOf: ["app-a", "app-b"],
      readableApplications: ["app-a", "app-b"],
      productRules: []
    });

    await search(["app-a", "app-b"]);

    expect(projectPermissionService.getProjectPermission).not.toHaveBeenCalled();
    expect(applicationPermissionService.getApplicationPermission).toHaveBeenCalledTimes(2);
    expect(searchedWith()).toEqual({ applicationIds: ["app-a", "app-b"], permissionFilters: undefined });
  });

  test("checks one application's permission at a time", async () => {
    const { search, applicationPermissionService } = setupSearch({
      memberOf: ["app-a", "app-b"],
      readableApplications: ["app-a", "app-b"],
      productRules: []
    });
    const check = applicationPermissionService.getApplicationPermission.getMockImplementation()!;
    let firstDone = false;
    let secondStartedAfterFirst = false;
    applicationPermissionService.getApplicationPermission
      .mockImplementationOnce(async (args) => {
        const result = await check(args);
        firstDone = true;
        return result;
      })
      .mockImplementationOnce(async (args) => {
        secondStartedAfterFirst = firstDone;
        return check(args);
      });

    await search(["app-a", "app-b"]);

    expect(applicationPermissionService.getApplicationPermission).toHaveBeenCalledTimes(2);
    expect(secondStartedAfterFirst).toBe(true);
  });

  test("matches application IDs in any case", async () => {
    const { search, applicationPermissionService, projectPermissionService } = setupSearch({
      memberOf: ["app-a"],
      readableApplications: ["app-a"],
      productRules: []
    });

    await search(["APP-A", "app-a"]);

    expect(projectPermissionService.getProjectPermission).not.toHaveBeenCalled();
    expect(applicationPermissionService.getApplicationPermission).toHaveBeenCalledOnce();
  });

  test("lets application Read take precedence over a product role limited by conditions", async () => {
    const { search, searchedWith, projectPermissionService } = setupSearch({
      memberOf: ["app-a"],
      readableApplications: ["app-a"],
      productRules: [{ ...readCertificates[0], conditions: { commonName: "a.example.com" } }]
    });

    await search(["app-a"]);

    expect(projectPermissionService.getProjectPermission).not.toHaveBeenCalled();
    expect(searchedWith().permissionFilters).toBeUndefined();
  });

  test("rejects the whole request when one application's role doesn't grant certificate Read", async () => {
    const { search, certificateDAL } = setupSearch({
      memberOf: ["app-a", "app-b"],
      readableApplications: ["app-a"],
      productRules: []
    });

    await expect(search(["app-a", "app-b"])).rejects.toBeInstanceOf(PermissionDeniedError);
    expect(certificateDAL.findWithPrivateKeyInfo).not.toHaveBeenCalled();
  });

  test("rejects without per-application checks when the caller isn't a member of a listed application", async () => {
    const { search, certificateDAL, applicationPermissionService } = setupSearch({
      memberOf: ["app-a"],
      readableApplications: ["app-a"],
      productRules: []
    });

    await expect(search(["app-a", "app-b"])).rejects.toBeInstanceOf(PermissionDeniedError);
    expect(applicationPermissionService.getApplicationPermission).not.toHaveBeenCalled();
    expect(certificateDAL.findWithPrivateKeyInfo).not.toHaveBeenCalled();
  });

  test("falls back to product-level Read for applications the caller can't read", async () => {
    const { search, searchedWith, projectPermissionService } = setupSearch({
      memberOf: [],
      readableApplications: [],
      productRules: readCertificates
    });

    await search(["app-a", "app-b"]);

    expect(projectPermissionService.getProjectPermission).toHaveBeenCalledOnce();
    const { applicationIds, permissionFilters } = searchedWith();
    expect(applicationIds).toEqual(["app-a", "app-b"]);
    expect(permissionFilters).toBeDefined();
  });

  test("keeps product-level Read on the project certificate listing, which doesn't bound applicationIds", async () => {
    const { list, membershipDAL, applicationPermissionService } = setupSearch({
      memberOf: ["app-a"],
      readableApplications: ["app-a"],
      productRules: []
    });

    await expect(list(["app-a"])).rejects.toBeInstanceOf(PermissionDeniedError);
    expect(membershipDAL.findResourceMembershipsForActor).not.toHaveBeenCalled();
    expect(applicationPermissionService.getApplicationPermission).not.toHaveBeenCalled();
  });

  test.each([{ productRead: true }, { productRead: false }])(
    "uses only product-level Read without applicationIds (product Read: $productRead)",
    async ({ productRead }) => {
      const { search, membershipDAL, applicationPermissionService } = setupSearch({
        memberOf: ["app-a"],
        readableApplications: ["app-a"],
        productRules: productRead ? readCertificates : []
      });

      if (productRead) {
        await expect(search()).resolves.toEqual({ certificates: [], totalCount: 0 });
      } else {
        await expect(search()).rejects.toBeInstanceOf(PermissionDeniedError);
      }
      expect(membershipDAL.findResourceMembershipsForActor).not.toHaveBeenCalled();
      expect(applicationPermissionService.getApplicationPermission).not.toHaveBeenCalled();
    }
  );
});
