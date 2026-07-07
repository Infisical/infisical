import { FolderOpen, History, type LucideIcon, Settings, Settings2, Users } from "lucide-react";

import { PamResourcePermissionActions } from "@app/hooks/api/pam";
import { PamSheetTab } from "@app/hooks/usePamSheetState";

export type PamResourceTab = {
  value: PamSheetTab;
  label: string;
  icon: LucideIcon;
  action?: PamResourcePermissionActions;
};

export const PAM_ACCOUNT_TABS: PamResourceTab[] = [
  {
    value: PamSheetTab.Permissions,
    label: "Permissions",
    icon: Users,
    action: PamResourcePermissionActions.ManageMembers
  },
  {
    value: PamSheetTab.Configuration,
    label: "Configuration",
    icon: Settings,
    action: PamResourcePermissionActions.EditAccounts
  },
  {
    value: PamSheetTab.Advanced,
    label: "Advanced",
    icon: Settings2,
    action: PamResourcePermissionActions.EditAccounts
  }
];

export const PAM_FOLDER_TABS: PamResourceTab[] = [
  {
    value: PamSheetTab.Permissions,
    label: "Permissions",
    icon: Users,
    action: PamResourcePermissionActions.ManageMembers
  },
  {
    value: PamSheetTab.Configuration,
    label: "Configuration",
    icon: Settings,
    action: PamResourcePermissionActions.EditFolder
  }
];

export const PAM_TEMPLATE_TABS: PamResourceTab[] = [
  { value: PamSheetTab.General, label: "General", icon: Settings2 },
  { value: PamSheetTab.Configuration, label: "Configuration", icon: Settings }
];

export const PAM_DISCOVERY_TABS: PamResourceTab[] = [
  { value: PamSheetTab.General, label: "Staged Accounts", icon: FolderOpen },
  { value: PamSheetTab.Runs, label: "Runs", icon: History },
  { value: PamSheetTab.Configuration, label: "Configuration", icon: Settings }
];

export const visiblePamTabs = (
  tabs: PamResourceTab[],
  can: (action: PamResourcePermissionActions) => boolean
) => tabs.filter((tab) => !tab.action || can(tab.action));
