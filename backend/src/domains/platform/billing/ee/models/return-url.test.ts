import { ExternalSystemError } from "@app/domains/lib/errors";

import { ReturnUrl } from "./return-url";

const SITE = "https://app.infisical.test";

describe("ReturnUrl.build", () => {
  test("should default to the org's billing page", () => {
    // Setup
    const orgId = "org-1";

    // Action
    const result = ReturnUrl.build(SITE, orgId);

    // Assert
    expect(result).toBe(`${SITE}/organizations/org-1/billing`);
  });

  test("should keep a relative return path on the site's origin", () => {
    // Setup
    const returnPath = "/organizations/org-1/billing?tab=usage";

    // Action
    const result = ReturnUrl.build(SITE, "org-1", returnPath);

    // Assert
    expect(result).toBe(`${SITE}${returnPath}`);
  });

  test("should fall back to the default path when the return path is not a path", () => {
    // Setup
    const returnPath = "evil.example/x";

    // Action
    const result = ReturnUrl.build(SITE, "org-1", returnPath);

    // Assert
    expect(result).toBe(`${SITE}/organizations/org-1/billing`);
  });

  test("should refuse a protocol-relative return path that points off the site's origin", () => {
    // Setup
    const returnPath = "//evil.example/x";

    // Action
    const result = () => ReturnUrl.build(SITE, "org-1", returnPath);

    // Assert
    expect(result).toThrow(ExternalSystemError);
    expect(result).toThrow("Failed to build a billing return URL");
  });

  test("should refuse when there is no site URL to return to", () => {
    // Setup
    const siteUrl = undefined;

    // Action
    const result = () => ReturnUrl.build(siteUrl, "org-1");

    // Assert
    expect(result).toThrow(ExternalSystemError);
    expect(result).toThrow("Failed to build a billing return URL");
  });
});
