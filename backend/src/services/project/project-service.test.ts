import { describe, expect, test, vi } from "vitest";

import { projectServiceFactory } from "./project-service";

const setup = () => {
  const orgDAL = {
    listOrganizationsWithSubOrgs: vi.fn().mockResolvedValue([
      { id: "root", subOrganizations: [{ id: "accessible-sub-org" }] },
      { id: "other-root", subOrganizations: [{ id: "other-sub-org" }] }
    ])
  };
  const projectDAL = { findUserProjects: vi.fn().mockResolvedValue([]) };
  const service = projectServiceFactory({
    orgDAL,
    projectDAL
  } as unknown as Parameters<typeof projectServiceFactory>[0]);

  return { service, orgDAL, projectDAL };
};

describe("project navigation across sub-organizations", () => {
  test("limits project membership lookup to the current root and its accessible sub-organizations", async () => {
    const { service, orgDAL, projectDAL } = setup();

    await service.getAccessibleProjectsWithSubOrgs({ actorId: "user", actorOrgId: "root" });

    expect(orgDAL.listOrganizationsWithSubOrgs).toHaveBeenCalledWith({ actorId: "user" });
    expect(projectDAL.findUserProjects).toHaveBeenCalledExactlyOnceWith("user", ["root", "accessible-sub-org"]);
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
