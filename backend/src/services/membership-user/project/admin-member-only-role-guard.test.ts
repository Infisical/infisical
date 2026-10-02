import { createMongoAbility } from "@casl/ability";
import { describe, expect, test, vi } from "vitest";

import { AccessScope, getAdminMemberOnlyProductLabel, ProjectMembershipRole, ProjectType } from "@app/db/schemas";
import { newProjectMembershipGroupFactory } from "@app/services/membership-group/project/project-membership-group-factory";
import { newProjectMembershipIdentityFactory } from "@app/services/membership-identity/project/project-membership-identity-factory";

import { newProjectMembershipUserFactory } from "./project-membership-user-factory";

const PROJECT_ID = "project-1";

// Only the collaborators reached before the role check; anything later is left undefined so a guard
// that fails to reject shows up as a crash rather than a silent pass.
const buildDeps = (projectType: ProjectType) => ({
  permissionService: {
    getProjectPermission: vi
      .fn()
      .mockResolvedValue({ permission: createMongoAbility([{ action: "manage", subject: "all" }]) })
  },
  projectDAL: { findById: vi.fn().mockResolvedValue({ id: PROJECT_ID, type: projectType }) },
  orgDAL: {},
  groupDAL: {},
  membershipGroupDAL: {},
  membershipUserDAL: {},
  membershipIdentityDAL: {},
  userDAL: {},
  identityDAL: {},
  additionalPrivilegeDAL: {},
  projectKeyDAL: {},
  projectBotDAL: {},
  smtpService: {},
  licenseService: {}
});

const dto = (role: string) => ({
  scopeData: { scope: AccessScope.Project, projectId: PROJECT_ID },
  permission: { type: "user", id: "actor-1", authMethod: undefined, orgId: "org-1" },
  data: { roles: [{ role }], groupId: "group-1", identityId: "identity-1", username: "user-1" },
  selector: { username: "user-1" }
});

type Guard = (guardDto: unknown) => Promise<unknown>;

const guards: { name: string; build: (projectType: ProjectType) => Guard }[] = [
  {
    name: "user",
    build: (projectType) =>
      newProjectMembershipUserFactory(
        buildDeps(projectType) as unknown as Parameters<typeof newProjectMembershipUserFactory>[0]
      ).onUpdateMembershipUserGuard as unknown as Guard
  },
  {
    name: "identity",
    build: (projectType) =>
      newProjectMembershipIdentityFactory(
        buildDeps(projectType) as unknown as Parameters<typeof newProjectMembershipIdentityFactory>[0]
      ).onUpdateMembershipIdentityGuard as unknown as Guard
  },
  {
    name: "group",
    build: (projectType) =>
      newProjectMembershipGroupFactory(
        buildDeps(projectType) as unknown as Parameters<typeof newProjectMembershipGroupFactory>[0]
      ).onUpdateMembershipGroupGuard as unknown as Guard
  }
];

describe("getAdminMemberOnlyProductLabel", () => {
  // The set is the whole contract: a product missing from it silently accepts a role that its
  // permission resolver then upgrades to the member rule set.
  test.each([
    [ProjectType.CertificateManager, "Certificate Manager"],
    [ProjectType.PAM, "Privileged Access Manager"],
    [ProjectType.AgentVault, "Agent Vault"]
  ])("covers %s", (type, label) => {
    expect(getAdminMemberOnlyProductLabel(type)).toBe(label);
  });

  test.each([[ProjectType.SecretManager], [ProjectType.KMS], [ProjectType.SecretScanning]])(
    "leaves %s alone",
    (type) => {
      expect(getAdminMemberOnlyProductLabel(type)).toBeUndefined();
    }
  );

  test("tolerates a missing project", () => {
    expect(getAdminMemberOnlyProductLabel(undefined)).toBeUndefined();
    expect(getAdminMemberOnlyProductLabel(null)).toBeUndefined();
  });
});

describe.each(guards)("$name membership guard", ({ build }) => {
  test.each([[ProjectType.AgentVault], [ProjectType.PAM], [ProjectType.CertificateManager]])(
    "refuses a viewer role on %s",
    async (type) => {
      await expect(build(type)(dto(ProjectMembershipRole.Viewer))).rejects.toThrow(
        "only supports Admin and Member roles"
      );
    }
  );

  test("refuses a custom role slug too", async () => {
    await expect(build(ProjectType.AgentVault)(dto("some-custom-role"))).rejects.toThrow(
      "only supports Admin and Member roles"
    );
  });

  test.each([[ProjectMembershipRole.Admin], [ProjectMembershipRole.Member]])(
    "allows %s past the check",
    async (role) => {
      // The guard runs before the rest of the collaborators, which are undefined here, so getting past
      // it surfaces as some other failure rather than the role message.
      await expect(build(ProjectType.AgentVault)(dto(role))).rejects.not.toThrow(
        "only supports Admin and Member roles"
      );
    }
  );

  test("does not apply to Secrets Management", async () => {
    await expect(build(ProjectType.SecretManager)(dto(ProjectMembershipRole.Viewer))).rejects.not.toThrow(
      "only supports Admin and Member roles"
    );
  });
});
