import { signerRoles } from "./signer-permission";
import { signerOperatorPermissions } from "./signer-roles";

describe("signerRoles.resolveRole", () => {
  test("should resolve a signer role to its rules", () => {
    // Setup
    const role = "operator";

    // Action
    const rules = signerRoles.resolveRole(role);

    // Assert
    expect(rules).toBe(signerOperatorPermissions);
  });

  test("should refuse a custom signer role and an unknown one", () => {
    // Setup
    const resolve = (role: string) => () => signerRoles.resolveRole(role);

    // Action
    const [custom, unknown] = [resolve("custom"), resolve("ghost")];

    // Assert
    expect(custom).toThrow("Custom resource-level roles are not supported yet");
    expect(unknown).toThrow("Signer role 'ghost' not found");
  });
});
