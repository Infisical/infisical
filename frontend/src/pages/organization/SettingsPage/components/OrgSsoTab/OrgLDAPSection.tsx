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
import { useCreateLDAPConfig, useGetLDAPConfig, useUpdateLDAPConfig } from "@app/hooks/api";
import { SubscriptionProductCategory } from "@app/hooks/api/subscriptions/types";
import { usePopUp } from "@app/hooks/usePopUp";

import { LDAPGroupMapModal } from "./LDAPGroupMapModal";
import { LDAPModal } from "./LDAPModal";

export const OrgLDAPSection = (): JSX.Element => {
  const { currentOrg } = useOrganization();
  const { subscription } = useSubscription();

  const { data } = useGetLDAPConfig(currentOrg?.id ?? "");

  const { mutateAsync } = useUpdateLDAPConfig();
  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "addLDAP",
    "ldapGroupMap",
    "deleteLdapGroupMap",
    "upgradePlan"
  ] as const);

  const { mutateAsync: createMutateAsync } = useCreateLDAPConfig();

  const handleLDAPToggle = async (value: boolean) => {
    if (!currentOrg?.id) return;
    if (!subscription?.get(SubscriptionProductCategory.Platform, "ldap")) {
      handlePopUpOpen("upgradePlan", {
        isEnterpriseFeature: true
      });
      return;
    }

    await mutateAsync({
      organizationId: currentOrg?.id,
      isActive: value
    });

    createNotification({
      text: `Successfully ${value ? "enabled" : "disabled"} LDAP`,
      type: "success"
    });
  };

  const addLDAPBtnClick = async () => {
    try {
      if (subscription?.get(SubscriptionProductCategory.Platform, "ldap") && currentOrg) {
        if (!data) {
          // case: LDAP is not configured
          // -> initialize empty LDAP configuration
          await createMutateAsync({
            organizationId: currentOrg.id,
            isActive: false,
            url: "",
            bindDN: "",
            bindPass: "",
            uniqueUserAttribute: "",
            searchBase: "",
            searchFilter: "",
            groupSearchBase: "",
            groupSearchFilter: ""
          });
        }

        handlePopUpOpen("addLDAP");
      } else {
        handlePopUpOpen("upgradePlan", {
          isEnterpriseFeature: true
        });
      }
    } catch (err) {
      console.error(err);
    }
  };

  const openLDAPGroupMapModal = () => {
    if (!subscription?.get(SubscriptionProductCategory.Platform, "ldap")) {
      handlePopUpOpen("upgradePlan", {
        isEnterpriseFeature: true
      });
      return;
    }

    handlePopUpOpen("ldapGroupMap");
  };

  const isGoogleOAuthEnabled = currentOrg.googleSsoAuthEnforced;

  return (
    <div className="mb-4">
      <div className="py-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-xl font-medium text-gray-200">LDAP</p>
            <p className="mb-2 text-gray-400">Manage LDAP authentication configuration</p>
          </div>
          <OrgPermissionCan I={OrgPermissionActions.Create} a={OrgPermissionSubjects.Ldap}>
            {(isAllowed) => (
              <Button onClick={addLDAPBtnClick} colorSchema="secondary" isDisabled={!isAllowed}>
                Manage
              </Button>
            )}
          </OrgPermissionCan>
        </div>
      </div>

      {data && (
        <div className="pt-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-md text-mineshaft-100">Enable LDAP</h2>
            <OrgPermissionCan
              I={OrgPermissionActions.Edit}
              a={OrgPermissionSubjects.Ldap}
              tooltipProps={{
                className: "max-w-sm",
                side: "left"
              }}
              allowedLabel={
                isGoogleOAuthEnabled
                  ? "You cannot enable LDAP SSO while Google OAuth is enforced. Disable Google OAuth enforcement to enable LDAP SSO."
                  : undefined
              }
              renderTooltip={isGoogleOAuthEnabled}
            >
              {(isAllowed) => (
                <div>
                  <Switch
                    id="enable-ldap-sso"
                    onCheckedChange={(value) => handleLDAPToggle(value)}
                    isChecked={data ? data.isActive : false}
                    isDisabled={!isAllowed || isGoogleOAuthEnabled}
                  >
                    Enable
                  </Switch>
                </div>
              )}
            </OrgPermissionCan>
          </div>
          <p className="text-sm text-mineshaft-300">
            Allow members to authenticate into Infisical with LDAP
          </p>
        </div>
      )}

      <div className="py-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-md text-mineshaft-100">LDAP Group Mappings</h2>
          <OrgPermissionCan I={OrgPermissionActions.Create} a={OrgPermissionSubjects.Ldap}>
            {(isAllowed) => (
              <Button
                onClick={openLDAPGroupMapModal}
                colorSchema="secondary"
                isDisabled={!isAllowed}
              >
                Configure
              </Button>
            )}
          </OrgPermissionCan>
        </div>
        <p className="text-sm text-mineshaft-300">
          Manage how LDAP groups are mapped to internal groups in Infisical
        </p>
      </div>

      <LDAPModal
        popUp={popUp}
        handlePopUpClose={handlePopUpClose}
        handlePopUpToggle={handlePopUpToggle}
      />
      <LDAPGroupMapModal
        popUp={popUp}
        handlePopUpOpen={handlePopUpOpen}
        handlePopUpToggle={handlePopUpToggle}
      />
      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text="Your current plan does not include access to LDAP authentication. To unlock this feature, please upgrade to Infisical Enterprise plan."
        isEnterpriseFeature={popUp.upgradePlan.data?.isEnterpriseFeature}
      />
    </div>
  );
};
