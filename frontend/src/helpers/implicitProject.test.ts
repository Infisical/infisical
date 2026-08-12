import { describe, expect, it } from "vitest";

import { resolveImplicitProjectId } from "./implicitProject";

const org = { pamProjectId: "pam-project", sandboxProjectId: "sandbox-project" };

describe("resolveImplicitProjectId", () => {
  it("resolves the sandbox project on sandbox routes even when a PAM project exists", () => {
    expect(resolveImplicitProjectId("/organizations/o1/sandboxes", org)).toBe("sandbox-project");
    expect(resolveImplicitProjectId("/organizations/o1/sandboxes/abc", org)).toBe("sandbox-project");
    expect(resolveImplicitProjectId("/organizations/o1/sandboxes/access-management", org)).toBe(
      "sandbox-project"
    );
  });

  it("keeps resolving the PAM project on PAM routes", () => {
    expect(resolveImplicitProjectId("/organizations/o1/pam/accounts", org)).toBe("pam-project");
  });

  it("preserves the previous PAM fallback for every other route", () => {
    expect(resolveImplicitProjectId("/organizations/o1/audit-logs", org)).toBe("pam-project");
  });

  it("returns null when the product has no project yet", () => {
    expect(
      resolveImplicitProjectId("/organizations/o1/sandboxes", {
        pamProjectId: null,
        sandboxProjectId: null
      })
    ).toBeNull();
  });

  it("falls back to PAM on sandbox routes only when sandbox has no project", () => {
    expect(
      resolveImplicitProjectId("/organizations/o1/sandboxes", {
        pamProjectId: "pam-project",
        sandboxProjectId: null
      })
    ).toBe("pam-project");
  });
});
