import { pamResourceRoles } from "./pam-permission";
import { pamResourceConnectorPermissions } from "./pam-roles";

describe("pamResourceRoles.resolveRole", () => {
  test("should resolve a PAM folder or account role to its rules", () => {
    // Setup
    const role = "connector";

    // Action
    const rules = pamResourceRoles.resolveRole(role);

    // Assert
    expect(rules).toBe(pamResourceConnectorPermissions);
  });

  test("should refuse a slug PAM does not define, custom included", () => {
    // Setup
    const role = "custom";

    // Action
    const resolve = () => pamResourceRoles.resolveRole(role);

    // Assert
    expect(resolve).toThrow("PAM role 'custom' not found");
  });

  test("should give a project admin nothing on a folder it has no role on", () => {
    // Setup
    const { projectAdminFallback } = pamResourceRoles;

    // Action
    const count = projectAdminFallback.length;

    // Assert
    expect(count).toBe(0);
  });
});
