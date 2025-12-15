import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import { Button, Switch } from "@app/components/v2";
import {
  OrgPermissionActions,
  OrgPermissionSubjects,
  useOrganization,
  useSubscription
} from "@app/context";
import { useUpdateOrg } from "@app/hooks/api";
import { SubscriptionProductCategory } from "@app/hooks/api/subscriptions/types";
import { usePopUp } from "@app/hooks/usePopUp";

import { ExternalGroupOrgRoleMappings } from "./ExternalGroupOrgRoleMappings";
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
    if (subscription?.get(SubscriptionProductCategory.Platform, "scim")) {
      handlePopUpOpen("scimToken");
    } else {
      handlePopUpOpen("upgradePlan", {
        isEnterpriseFeature: true
      });
    }
  };

  const handleEnableSCIMToggle = async (value: boolean) => {
    if (!currentOrg?.id) return;
    if (!subscription?.get(SubscriptionProductCategory.Platform, "scim")) {
      handlePopUpOpen("upgradePlan", {
        isEnterpriseFeature: true
      });
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
  };

  return (
    <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-6">
      <p className="text-xl font-medium text-gray-200">Provision users via SCIM</p>
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
                  if (subscription?.get(SubscriptionProductCategory.Platform, "scim")) {
                    handleEnableSCIMToggle(value);
                  } else {
                    handlePopUpOpen("upgradePlan", {
                      isEnterpriseFeature: true
                    });
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
        text="Your current plan does not include access to SCIM Provisioning. To unlock this feature, please upgrade to Infisical Enterprise plan."
        isEnterpriseFeature={popUp.upgradePlan.data?.isEnterpriseFeature}
      />
    </div>
  );
};
