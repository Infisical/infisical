import {
  AppWindow,
  ChevronLeft,
  Cog,
  KeyRound,
  LayoutTemplate,
  Lock,
  Network,
  ShieldUser,
  SlidersHorizontal
} from "lucide-react";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { SidebarGroup, SidebarGroupLabel, SidebarMenu, SubOrgIcon } from "@app/components/v3";
import { useOrganization, useSubscription } from "@app/context";
import { usePopUp } from "@app/hooks/usePopUp";

import { OrgNavLink } from "./OrgNavLink";
import type { OrgNavItem } from "./types";

// --- Org settings submenu (secondary sidebar) ---

type OrgSettingsItem = OrgNavItem & { requiresFeature?: boolean };

export const OrgSettingsSubmenuView = ({ onBack }: { onBack: () => void }) => {
  const { isSubOrganization } = useOrganization();
  const { subscription } = useSubscription();
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["upgradePlan"] as const);

  const items: OrgSettingsItem[] = [
    {
      label: "General",
      icon: Cog,
      pathSuffix: "settings",
      search: { selectedTab: "tab-org-general" },
      isDefaultSearch: true
    },
    {
      label: "SSO & Provisioning",
      icon: ShieldUser,
      pathSuffix: "sso",
      hidden: isSubOrganization
    },
    {
      label: "OAuth Applications",
      icon: AppWindow,
      pathSuffix: "oauth-applications",
      hidden: isSubOrganization
    },
    {
      label: "Networking",
      icon: Network,
      pathSuffix: "networking"
    },
    {
      label: "Security",
      icon: Lock,
      pathSuffix: "settings",
      search: { selectedTab: "tab-org-security" },
      hidden: isSubOrganization
    },
    {
      label: "Encryption",
      icon: KeyRound,
      pathSuffix: "settings",
      search: { selectedTab: "tab-org-encryption" }
    },
    {
      label: "Project Templates",
      icon: LayoutTemplate,
      pathSuffix: "settings",
      search: { selectedTab: "project-templates" }
    },
    {
      label: "Product Settings",
      icon: SlidersHorizontal,
      pathSuffix: "settings",
      search: { selectedTab: "product-settings" }
    },
    {
      label: "Sub Organizations",
      icon: SubOrgIcon,
      pathSuffix: "settings",
      search: { selectedTab: "tab-sub-organizations" },
      hidden: isSubOrganization,
      requiresFeature: !subscription?.subOrganization
    }
  ];

  return (
    <SidebarGroup>
      <SidebarGroupLabel asChild>
        <button
          className="cursor-pointer hover:bg-foreground/[0.025]"
          type="button"
          onClick={onBack}
        >
          <ChevronLeft />
          <span>Settings</span>
        </button>
      </SidebarGroupLabel>
      <SidebarMenu>
        {items
          .filter((item) => !item.hidden)
          .map((item) => (
            <OrgNavLink
              key={item.label}
              item={item}
              onClick={item.requiresFeature ? () => handlePopUpOpen("upgradePlan") : undefined}
            />
          ))}
      </SidebarMenu>
      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text="You need to upgrade your plan to manage sub-organizations."
      />
    </SidebarGroup>
  );
};
