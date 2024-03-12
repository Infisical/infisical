import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import { OrgPermissionCan } from "@app/components/permissions";
import { Button, Switch, UpgradePlanModal } from "@app/components/v2";
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
  const { createNotification } = useNotificationContext();
  const { data, isLoading } = useGetSSOConfig(currentOrg?.id ?? "");
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
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="mb-8 flex items-center">
        <h2 className="flex-1 text-xl font-semibold text-white">SAML</h2>
        {!isLoading && (
          <OrgPermissionCan I={OrgPermissionActions.Create} a={OrgPermissionSubjects.Sso}>
            {(isAllowed) => (
              <Button
                onClick={addSSOBtnClick}
                colorSchema="secondary"
                isDisabled={!isAllowed}
                leftIcon={<FontAwesomeIcon icon={faPlus} />}
              >
                Configure
              </Button>
            )}
          </OrgPermissionCan>
        )}
      </div>
      {/* {data && ( */}
        <div className="mb-4">
          <OrgPermissionCan I={OrgPermissionActions.Edit} a={OrgPermissionSubjects.Sso}>
            {(isAllowed) => (
              <Switch
                id="enable-saml-sso"
                onCheckedChange={(value) => handleSamlSSOToggle(value)}
                isChecked={data ? data.isActive : false}
                isDisabled={!isAllowed}
              >
                Enable
              </Switch>
            )}
          </OrgPermissionCan>
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
    </div>
  );
};
