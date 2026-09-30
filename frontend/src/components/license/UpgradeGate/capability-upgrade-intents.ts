export type CapabilityUpgradeIntent = {
  scope: "platform" | "instance";
  featureKey: "groups" | "rbac" | "instance_user_management" | "hsm";
  title: string;
  description: string;
  isEnterpriseFeature: boolean;
};

export const getCapabilityUpgradeUrl = (
  intent: CapabilityUpgradeIntent,
  organization: { id: string; rootOrgId?: string | null }
) =>
  intent.scope === "instance"
    ? "https://infisical.com/talk-to-us"
    : `/organizations/${organization.rootOrgId ?? organization.id}/billing`;

export const GroupsUpgradeIntent = {
  scope: "platform",
  featureKey: "groups",
  title: "Unlock Groups",
  description: "Manage access for teams by organizing members into groups.",
  isEnterpriseFeature: true
} satisfies CapabilityUpgradeIntent;

export const CustomRolesUpgradeIntent = {
  scope: "platform",
  featureKey: "rbac",
  title: "Unlock Custom Roles",
  description: "Control access with custom roles and granular permissions.",
  isEnterpriseFeature: true
} satisfies CapabilityUpgradeIntent;

export const InstanceUserManagementUpgradeIntent = {
  scope: "instance",
  featureKey: "instance_user_management",
  title: "Unlock Instance User Management",
  description: "Manage server administrators and user access across your Infisical instance.",
  isEnterpriseFeature: false
} satisfies CapabilityUpgradeIntent;

export const InstanceHsmUpgradeIntent = {
  scope: "instance",
  featureKey: "hsm",
  title: "Unlock Hardware Security Modules",
  description: "Protect your instance's encryption keys with a Hardware Security Module (HSM).",
  isEnterpriseFeature: true
} satisfies CapabilityUpgradeIntent;
