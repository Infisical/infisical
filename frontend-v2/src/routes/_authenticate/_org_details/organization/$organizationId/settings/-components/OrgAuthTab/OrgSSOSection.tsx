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
import { useCreateSSOConfig, useGetSSOConfig, useUpdateSSOConfig } from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";

import { SSOModal } from "./SSOModal";

export const OrgSSOSection = (): JSX.Element => {
  const { currentOrg } = useOrganization();
  const { subscription } = useSubscription();

  const { data, isPending } = useGetSSOConfig(currentOrg?.id ?? "");
  const { mutateAsync } = useUpdateSSOConfig();
  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "upgradePlan",
    "addSSO"
  ] as const);

  const { mutateAsync: createMutateAsync } = useCreateSSOConfig();

  const handleSamlSSOToggle = async (value: boolean) => {
    try {
      if (!currentOrg?.id) return;

      if (!subscription?.samlSSO) {
        handlePopUpOpen("upgradePlan");
        return;
      }

      await mutateAsync({
        organizationId: currentOrg?.id,
        isActive: value
      });

      createNotification({
        text: `Successfully ${value ? "enabled" : "disabled"} SAML SSO`,
        type: "success"
      });
    } catch (err) {
      console.error(err);
      createNotification({
        text: `Failed to ${value ? "enable" : "disable"} SAML SSO`,
        type: "error"
      });
    }
  };

  const addSSOBtnClick = async () => {
    try {
      if (subscription?.samlSSO && currentOrg) {
        if (!data) {
          // case: SAML SSO is not configured
          // -> initialize empty SAML SSO configuration
          await createMutateAsync({
            organizationId: currentOrg.id,
            authProvider: "okta-saml",
            isActive: false,
            entryPoint: "",
            issuer: "",
            cert: ""
          });
        }

        handlePopUpOpen("addSSO");
      } else {
        handlePopUpOpen("upgradePlan");
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <>
      <hr className="border-mineshaft-600" />
      <div className="py-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-md text-mineshaft-100">SAML</h2>
          {!isPending && (
            <OrgPermissionCan I={OrgPermissionActions.Create} a={OrgPermissionSubjects.Sso}>
              {(isAllowed) => (
                <Button onClick={addSSOBtnClick} colorSchema="secondary" isDisabled={!isAllowed}>
                  Manage
                </Button>
              )}
            </OrgPermissionCan>
          )}
        </div>
        <p className="text-sm text-mineshaft-300">Manage SAML authentication configuration</p>
      </div>
      <div className="py-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-md text-mineshaft-100">Enable SAML</h2>
          {!isPending && (
            <OrgPermissionCan I={OrgPermissionActions.Edit} a={OrgPermissionSubjects.Sso}>
              {(isAllowed) => (
                <Switch
                  id="enable-saml-sso"
                  onCheckedChange={(value) => handleSamlSSOToggle(value)}
                  isChecked={data ? data.isActive : false}
                  isDisabled={!isAllowed}
                />
              )}
            </OrgPermissionCan>
          )}
        </div>
        <p className="text-sm text-mineshaft-300">
          Allow members to authenticate into Infisical with SAML
        </p>
      </div>
      <SSOModal
        popUp={popUp}
        handlePopUpClose={handlePopUpClose}
        handlePopUpToggle={handlePopUpToggle}
      />
      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text="You can use SAML SSO if you switch to Infisical's Pro plan."
      />
    </>
  );
};
