import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import { Button, Switch, UpgradePlanModal } from "@app/components/v2";
import {
  OrgPermissionActions,
  OrgPermissionSubjects,
  useOrganization,
  useSubscription
} from "@app/context";
import { useUpdateOrg } from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";
import { ExternalGroupOrgRoleMappings } from "@app/views/Settings/OrgSettingsPage/components/OrgAuthTab/ExternalGroupOrgRoleMappings";

import { ScimTokenModal } from "./ScimTokenModal";

export const OrgScimSection = () => {
  const { currentOrg } = useOrganization();
  const { subscription } = useSubscription();
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
    "scimToken",
    "deleteScimToken",
    "upgradePlan"
  ] as const);

  const { mutateAsync } = useUpdateOrg();

  const addScimTokenBtnClick = () => {
    if (subscription?.scim) {
      handlePopUpOpen("scimToken");
    } else {
      handlePopUpOpen("upgradePlan");
    }
  };

  const handleEnableSCIMToggle = async (value: boolean) => {
    try {
      if (!currentOrg?.id) return;
      if (!subscription?.scim) {
        handlePopUpOpen("upgradePlan");
        return;
      }

      await mutateAsync({
        orgId: currentOrg?.id,
        scimEnabled: value
      });

      createNotification({
        text: `Successfully ${value ? "enabled" : "disabled"} SCIM provisioning`,
        type: "success"
      });
    } catch (err) {
      createNotification({
        text: (err as { response: { data: { message: string } } }).response.data.message,
        type: "error"
      });
    }
  };

  return (
    <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-6">
      <p className="text-xl font-semibold text-gray-200">Provision users via SCIM</p>
      <div className="py-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-md text-mineshaft-100">SCIM</h2>
          <OrgPermissionCan I={OrgPermissionActions.Read} a={OrgPermissionSubjects.Scim}>
            {(isAllowed) => (
              <Button
                onClick={addScimTokenBtnClick}
                colorSchema="secondary"
                isDisabled={!isAllowed}
              >
                Configure
              </Button>
            )}
          </OrgPermissionCan>
        </div>
        <p className="text-sm text-mineshaft-300">Manage SCIM configuration</p>
      </div>
      <ExternalGroupOrgRoleMappings />
      <div className="py-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-md text-mineshaft-100">Enable SCIM</h2>
          <OrgPermissionCan I={OrgPermissionActions.Edit} a={OrgPermissionSubjects.Scim}>
            {(isAllowed) => (
              <Switch
                id="enable-scim"
                onCheckedChange={(value) => {
                  if (subscription?.scim) {
                    handleEnableSCIMToggle(value);
                  } else {
                    handlePopUpOpen("upgradePlan");
                  }
                }}
                isChecked={currentOrg?.scimEnabled ?? false}
                isDisabled={!isAllowed}
              />
            )}
          </OrgPermissionCan>
        </div>
        <p className="text-sm text-mineshaft-300">
          Allow member provisioning/deprovisioning with SCIM
        </p>
      </div>
      <ScimTokenModal
        popUp={popUp}
        handlePopUpOpen={handlePopUpOpen}
        handlePopUpToggle={handlePopUpToggle}
      />
      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text="You can use SCIM Provisioning if you switch to Infisical's Enterprise plan."
      />
    </div>
  );
};
