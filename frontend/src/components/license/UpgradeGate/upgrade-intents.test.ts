import { describe, expect, it } from "vitest";

import {
  BillingPlan,
  BillingProduct,
  buildUpgradeReturnPath,
  CrossProjectSecretSharingUpgradeIntent,
  DynamicSecretsUpgradeIntent,
  EnvironmentLimitUpgradeIntent,
  getSafeUpgradeReturnPath,
  SecretAccessRequestsUpgradeIntent,
  SecretApprovalPoliciesUpgradeIntent
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

describe("bounded upgrade return targets", () => {
  it("bounds oversized project state before starting a trial", () => {
    const location = {
      pathname: "/source",
      search: `?search=${"a".repeat(2100)}`,
      hash: ""
    } as Location;

    expect(buildUpgradeReturnPath(DynamicSecretsUpgradeIntent, location)).toBe(
      "/source?upgradeContinuation=create-dynamic-secret"
    );
  });

  it("preserves the action target when unrelated search state is oversized", () => {
    expect(
      buildUpgradeReturnPath(
        DynamicSecretsUpgradeIntent,
        { pathname: "/source", search: `?search=${"a".repeat(2100)}`, hash: "" } as Location,
        { environment: "prod", folderPath: "/service" }
      )
    ).toBe(
      "/source?upgradeContinuation=create-dynamic-secret&upgradeEnvironment=prod&upgradeFolderPath=%2Fservice"
    );
  });
});

describe("Secrets upgrade intents", () => {
  it.each([
    ["overview", "?secretPath=%2Fproduction&environments=prod"],
    ["settings", "?selectedTab=tab-secret-environments"]
  ])("keeps environment creation on its source %s surface", (surface, search) => {
    expect(
      buildUpgradeReturnPath(EnvironmentLimitUpgradeIntent, {
        pathname: `/organizations/org-1/projects/secret-management/project-1/${surface}`,
        search,
        hash: "#environments"
      } as Location)
    ).toBe(
      `/organizations/org-1/projects/secret-management/project-1/${surface}${search}&upgradeContinuation=create-environment#environments`
    );
  });

  it.each([
    [SecretApprovalPoliciesUpgradeIntent, "create-secret-approval-policy"],
    [SecretAccessRequestsUpgradeIntent, "request-secret-access"],
    [CrossProjectSecretSharingUpgradeIntent, "share-secrets-across-projects"],
    [EnvironmentLimitUpgradeIntent, "create-environment"]
  ] as const)("routes $0.featureKey to the Secrets Pro product", (intent, continuation) => {
    expect(intent.productKey).toBe(BillingProduct.SecretsManagement);
    expect(intent.planKey).toBe(BillingPlan.Pro);
    expect(intent.continuation).toBe(continuation);
    expect(intent.upgradeLabel).toMatch(/^Unlock /);
    expect(
      buildUpgradeReturnPath(intent, {
        pathname: "/source",
        search: "?tab=policies",
        hash: ""
      } as Location)
    ).toBe(`/source?tab=policies&upgradeContinuation=${continuation}`);
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
