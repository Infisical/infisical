import { describe, expect, it } from "vitest";

import {
  BillingPlan,
  BillingProduct,
  buildUpgradeReturnPath,
  CrossProjectSecretSharingUpgradeIntent,
  EnvironmentLimitUpgradeIntent,
  getSafeUpgradeReturnPath,
  SecretAccessRequestsUpgradeIntent,
  SecretApprovalPoliciesUpgradeIntent
} from "./upgrade-intents";

describe("buildUpgradeReturnPath", () => {
  it("preserves the originating product page and source state", () => {
    const location = {
      pathname: "/organizations/org-1/projects/secret-management/project-1/overview",
      search: "?secretPath=%2Fproduction&environments=prod",
      hash: "#secrets"
    } as Location;

    expect(buildUpgradeReturnPath(location)).toBe(
      "/organizations/org-1/projects/secret-management/project-1/overview?secretPath=%2Fproduction&environments=prod#secrets"
    );
  });
});

describe("bounded upgrade return targets", () => {
  it("bounds oversized project state before starting a trial", () => {
    const location = {
      pathname: "/source",
      search: `?search=${"a".repeat(2100)}`,
      hash: ""
    } as Location;

    expect(buildUpgradeReturnPath(location)).toBe("/source");
  });

  it("removes stale activation and panel-reopen markers", () => {
    expect(
      buildUpgradeReturnPath({
        pathname: "/source",
        search:
          "?tab=policies&checkout=success&card=setup_success&upgradeContinuation=create-dynamic-secret&upgradeEnvironment=prod&upgradeFolderPath=%2Fservice",
        hash: ""
      } as Location)
    ).toBe("/source?tab=policies");
  });
});

describe("Secrets upgrade intents", () => {
  it.each([
    ["overview", "?secretPath=%2Fproduction&environments=prod"],
    ["settings", "?selectedTab=tab-secret-environments"]
  ])("keeps environment creation on its source %s surface", (surface, search) => {
    expect(
      buildUpgradeReturnPath({
        pathname: `/organizations/org-1/projects/secret-management/project-1/${surface}`,
        search,
        hash: "#environments"
      } as Location)
    ).toBe(
      `/organizations/org-1/projects/secret-management/project-1/${surface}${search}#environments`
    );
  });

  it.each([
    SecretApprovalPoliciesUpgradeIntent,
    SecretAccessRequestsUpgradeIntent,
    CrossProjectSecretSharingUpgradeIntent,
    EnvironmentLimitUpgradeIntent
  ] as const)("routes $featureKey to the Secrets Pro product", (intent) => {
    expect(intent.productKey).toBe(BillingProduct.SecretsManagement);
    expect(intent.planKey).toBe(BillingPlan.Pro);
    expect(intent.upgradeLabel).toMatch(/^Unlock /);
    expect(
      buildUpgradeReturnPath({
        pathname: "/source",
        search: "?tab=policies",
        hash: ""
      } as Location)
    ).toBe("/source?tab=policies");
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
