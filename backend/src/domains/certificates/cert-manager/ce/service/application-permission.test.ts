import { applicationRoles } from "./application-permission";
import { applicationAuditorPermissions } from "./application-roles";

describe("applicationRoles.resolveRole", () => {
  test("should resolve an application role to its rules", () => {
    // Setup
    const role = "auditor";

    // Action
    const rules = applicationRoles.resolveRole(role);

    // Assert
    expect(rules).toBe(applicationAuditorPermissions);
  });

  test("should refuse a custom application role and an unknown one", () => {
    // Setup
    const resolve = (role: string) => () => applicationRoles.resolveRole(role);

    // Action
    const [custom, unknown] = [resolve("custom"), resolve("ghost")];

    // Assert
    expect(custom).toThrow("Custom resource-level roles are not supported yet");
    expect(unknown).toThrow("Application role 'ghost' not found");
  });
});
