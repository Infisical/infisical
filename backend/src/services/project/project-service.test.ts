import { describe, expect, test, vi } from "vitest";

import { OrgMembershipStatus, ProjectType } from "@app/db/schemas";
import { BadRequestError } from "@app/lib/errors";
import { ActorType } from "@app/services/auth/auth-type";

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
  const licenseService = { getPlan: vi.fn().mockResolvedValue({ workspaceLimit: null }) };
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
