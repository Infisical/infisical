import { describe, expect, it } from "vitest";

import {
  getCapabilityUpgradeUrl,
  GroupsUpgradeIntent,
  InstanceUserManagementUpgradeIntent
} from "./capability-upgrade-intents";

describe("capability upgrade intents", () => {
  it("routes platform capabilities to root organization billing", () => {
    expect(getCapabilityUpgradeUrl(GroupsUpgradeIntent, { id: "child", rootOrgId: "root" })).toBe(
      "/organizations/root/billing"
    );
    expect(getCapabilityUpgradeUrl(GroupsUpgradeIntent, { id: "org" })).toBe(
      "/organizations/org/billing"
    );
  });

  it("routes instance capabilities to sales instead of organization checkout", () => {
    expect(getCapabilityUpgradeUrl(InstanceUserManagementUpgradeIntent, { id: "org" })).toBe(
      "https://infisical.com/talk-to-us"
    );
  });
});
