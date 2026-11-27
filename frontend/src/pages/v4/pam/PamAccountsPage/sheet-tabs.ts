import { isRotatablePamAccountType, PamResourcePermissionActions } from "@app/hooks/api/pam";
import { PamSheetTab } from "@app/hooks/usePamSheetState";

const ACCOUNT_TABS = [
  {
    value: PamSheetTab.Permissions,
    label: "Permissions",
    action: PamResourcePermissionActions.ManageMembers
  },
  {
    value: PamSheetTab.Configuration,
    label: "Configuration",
    action: PamResourcePermissionActions.EditAccounts
  },
  {
    value: PamSheetTab.Rotation,
    label: "Rotation",
    action: PamResourcePermissionActions.ManageRotation
  },
  {
    value: PamSheetTab.Advanced,
    label: "Advanced",
    action: PamResourcePermissionActions.EditAccounts
  }
];

export const visibleAccountTabs = (
  can: (action: PamResourcePermissionActions) => boolean,
  accountType: string
) =>
  ACCOUNT_TABS.filter(
    ({ value, action }) =>
      can(action) && (value !== PamSheetTab.Rotation || isRotatablePamAccountType(accountType))
  );

export const FOLDER_TABS = [
  {
    value: PamSheetTab.Permissions,
    label: "Permissions",
    action: PamResourcePermissionActions.ManageMembers
  },
  {
    value: PamSheetTab.Approvals,
    label: "Approvals",
    action: PamResourcePermissionActions.ManagePolicies
  },
  {
    value: PamSheetTab.Configuration,
    label: "Configuration",
    action: PamResourcePermissionActions.EditFolder
  }
];
