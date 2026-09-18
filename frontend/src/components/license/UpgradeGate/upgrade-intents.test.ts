import { describe, expect, it } from "vitest";

import {
  buildUpgradeReturnPath,
  DynamicSecretsUpgradeIntent,
  getSafeUpgradeReturnPath
} from "./upgrade-intents";

describe("buildUpgradeReturnPath", () => {
  it("preserves source state and adds the typed continuation", () => {
    const location = {
      pathname: "/organizations/org-1/projects/secret-management/project-1/overview",
      search: "?secretPath=%2Fproduction&environments=prod",
      hash: "#secrets"
    } as Location;

    expect(buildUpgradeReturnPath(DynamicSecretsUpgradeIntent, location)).toBe(
      "/organizations/org-1/projects/secret-management/project-1/overview?secretPath=%2Fproduction&environments=prod&upgradeContinuation=create-dynamic-secret#secrets"
    );
  });
});

describe("getSafeUpgradeReturnPath", () => {
  it("accepts same-origin relative paths", () => {
    expect(
      getSafeUpgradeReturnPath(
        "/organizations/org-1/projects?checkout=success",
        "https://app.infisical.com"
      )
    ).toBe("/organizations/org-1/projects?checkout=success");
  });

  it("rejects paths that normalize to an external origin", () => {
    expect(getSafeUpgradeReturnPath("/\t/evil.example", "https://app.infisical.com")).toBeNull();
    expect(getSafeUpgradeReturnPath("/\\evil.example", "https://app.infisical.com")).toBeNull();
  });
});
