import { ProjectType } from "@app/db/schemas";
import { getPredefinedRoles } from "@app/services/project-role/project-role-fns";

import { projectAdminPermissions, projectMemberPermissions, projectViewerPermission } from "./default-roles";
import {
  ProjectPermissionActions,
  ProjectPermissionSecretFolderActions,
  ProjectPermissionSub,
  ProjectPermissionV2Schema
} from "./project-permission";

describe("ProjectPermissionV2Schema secret-folders actions", () => {
  test("rejects manage-access, which is only obtainable through the folder access flow", () => {
    const result = ProjectPermissionV2Schema.safeParse({
      subject: ProjectPermissionSub.SecretFolders,
      action: [ProjectPermissionSecretFolderActions.ManageAccess]
    });

    expect(result.success).toBe(false);
  });

  test("accepts the generic CRUD actions", () => {
    const result = ProjectPermissionV2Schema.safeParse({
      subject: ProjectPermissionSub.SecretFolders,
      action: [ProjectPermissionActions.Create, ProjectPermissionActions.Edit, ProjectPermissionActions.Delete]
    });

    expect(result.success).toBe(true);
  });
});

describe("ProjectPermissionV2Schema certificate-application actions", () => {
  test("accepts every action the built-in roles grant, so duplicating them round-trips", () => {
    const granted = [...projectAdminPermissions, ...projectMemberPermissions, ...projectViewerPermission].filter(
      (rule) => rule.subject === ProjectPermissionSub.Application
    );

    expect(granted).not.toHaveLength(0);
    granted.forEach((rule) => {
      expect(ProjectPermissionV2Schema.safeParse(rule).success).toBe(true);
    });
  });
});

describe("built-in project roles round-trip through the role API schema", () => {
  // Actions the role API deliberately refuses because they are only obtainable through another
  // flow, so a duplicate of a built-in role cannot carry them. The duplicate flow strips them.
  const NON_GRANTABLE_ACTIONS_BY_SUBJECT: Record<string, string[]> = {
    [ProjectPermissionSub.SecretFolders]: [ProjectPermissionSecretFolderActions.ManageAccess]
  };

  // The roles tab lists whatever getPredefinedRoles returns and duplicates a role by re-submitting
  // its rules, so enumerate that rather than hardcoding a list of built-in roles here.
  const builtInRoles = [
    ...new Map(
      Object.values(ProjectType)
        .flatMap((projectType) => getPredefinedRoles({ projectId: "project-id", projectType }))
        .map((role) => [role.slug, role.permissions])
    ).entries()
  ];

  test.each(builtInRoles)("every rule of the built-in %s role is writable", (_slug, permissions) => {
    permissions.forEach((rule) => {
      const nonGrantableActions = NON_GRANTABLE_ACTIONS_BY_SUBJECT[String(rule.subject)] ?? [];
      const action = [rule.action].flat().filter((el) => !nonGrantableActions.includes(String(el)));
      if (!action.length) return;

      const result = ProjectPermissionV2Schema.safeParse({ ...rule, action });

      expect(
        result.success,
        `The built-in roles grant '${String(rule.subject)}' but ProjectPermissionV2Schema rejects it, so duplicating the role fails. Add the subject or action to the schema in project-permission.ts, or add it to NON_GRANTABLE_ACTIONS_BY_SUBJECT here and strip it in the duplicate flow.`
      ).toBe(true);
    });
  });
});

describe("ProjectPermissionV2Schema secret paths", () => {
  test("stores secret path conditions canonically and leaves glob patterns alone", () => {
    const result = ProjectPermissionV2Schema.parse({
      subject: ProjectPermissionSub.Secrets,
      action: [ProjectPermissionActions.Read],
      conditions: {
        environment: "dev",
        secretPath: { $eq: "//prod/", $in: ["/a//b", "/c"], $glob: "/app//**" }
      }
    });

    expect(result).toMatchObject({
      conditions: { secretPath: { $eq: "/prod", $in: ["/a/b", "/c"], $glob: "/app//**" } }
    });
  });
});

describe("ProjectPermissionV2Schema Agent Vault id conditions", () => {
  const SERVICE_ID = "8A6F2C1E-3B4D-4E5F-8A9B-0C1D2E3F4A5B";
  const useServices = (conditions: unknown) => ({
    subject: ProjectPermissionSub.AgentVaultServices,
    action: ["use"],
    conditions
  });

  test.each([
    ["a bare id", SERVICE_ID],
    ["$eq", { $eq: SERVICE_ID }],
    ["$in", { $in: [SERVICE_ID] }]
  ])("takes %s and stores the id in lowercase", (_name, condition) => {
    const stored = JSON.stringify(ProjectPermissionV2Schema.parse(useServices({ serviceId: condition })));
    expect(stored).toContain(SERVICE_ID.toLowerCase());
    expect(stored).not.toContain(SERVICE_ID);
  });

  test.each([
    ["conditions that name no id, which would match every id", {}],
    ["$eq and $in together", { serviceId: { $eq: SERVICE_ID, $in: [SERVICE_ID] } }],
    ["an operator object that names nothing", { serviceId: {} }],
    ["an empty $in", { serviceId: { $in: [] } }],
    ["a pattern", { serviceId: { $glob: "*" } }],
    ["a value that isn't an id", { serviceId: "prod-db" }],
    ["a field other than the id", { serviceId: SERVICE_ID, name: "prod-db" }]
  ])("refuses %s", (_name, conditions) => {
    expect(ProjectPermissionV2Schema.safeParse(useServices(conditions)).success).toBe(false);
  });

  test("a rule with no conditions covers every service", () => {
    expect(
      ProjectPermissionV2Schema.safeParse({ subject: ProjectPermissionSub.AgentVaultServices, action: ["use"] }).success
    ).toBe(true);
  });
});
