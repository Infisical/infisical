import { describe, expect, it } from "vitest";

import {
  CustomRolesUpgradeIntent,
  getCapabilityUpgradeUrl,
  GroupsUpgradeIntent,
  InstanceHsmUpgradeIntent,
  InstanceUserManagementUpgradeIntent
} from "./capability-upgrade-intents";

describe("capability upgrade intents", () => {
  it.each([GroupsUpgradeIntent, CustomRolesUpgradeIntent])(
    "routes platform capability $featureKey to root billing without a product filter",
    (intent) => {
      expect(intent.scope).toBe("platform");
      expect(getCapabilityUpgradeUrl(intent, { id: "child", rootOrgId: "root" })).toBe(
        "/organizations/root/billing"
      );
      expect(getCapabilityUpgradeUrl(intent, { id: "org" })).toBe("/organizations/org/billing");
      expect("productKey" in intent).toBe(false);
    }
  );

  it.each([InstanceUserManagementUpgradeIntent, InstanceHsmUpgradeIntent])(
    "never sends instance capability $featureKey to organization checkout",
    (intent) => {
      expect(intent.scope).toBe("instance");
      expect(getCapabilityUpgradeUrl(intent, { id: "org" })).toBe(
        "https://infisical.com/talk-to-us"
      );
      expect("productKey" in intent).toBe(false);
    }
  );
});
