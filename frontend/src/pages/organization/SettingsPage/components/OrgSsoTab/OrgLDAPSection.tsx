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
    try {
      if (!currentOrg?.id) return;
      if (!subscription?.ldap) {
        handlePopUpOpen("upgradePlan");
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
    } catch (err) {
      console.error(err);
      createNotification({
        text: `Failed to ${value ? "enable" : "disable"} LDAP`,
        type: "error"
      });
    }
  };

  const addLDAPBtnClick = async () => {
    try {
      if (subscription?.ldap && currentOrg) {
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
        handlePopUpOpen("upgradePlan");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const openLDAPGroupMapModal = () => {
    if (!subscription?.ldap) {
      handlePopUpOpen("upgradePlan");
      return;
    }

    handlePopUpOpen("ldapGroupMap");
  };

  return (
    <div className="mb-4 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-6">
      <div className="py-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-md text-mineshaft-100">LDAP</h2>
          <div className="flex">
            <OrgPermissionCan I={OrgPermissionActions.Create} a={OrgPermissionSubjects.Ldap}>
              {(isAllowed) => (
                <Button onClick={addLDAPBtnClick} colorSchema="secondary" isDisabled={!isAllowed}>
                  Manage
                </Button>
              )}
            </OrgPermissionCan>
          </div>
        </div>
        <p className="text-sm text-mineshaft-300">Manage LDAP authentication configuration</p>
      </div>
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
                Manage
              </Button>
            )}
          </OrgPermissionCan>
        </div>
        <p className="text-sm text-mineshaft-300">
          Manage how LDAP groups are mapped to internal groups in Infisical
        </p>
      </div>
      {data && (
        <div className="py-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-md text-mineshaft-100">Enable LDAP</h2>
            <OrgPermissionCan I={OrgPermissionActions.Edit} a={OrgPermissionSubjects.Ldap}>
              {(isAllowed) => (
                <Switch
                  id="enable-saml-sso"
                  onCheckedChange={(value) => handleLDAPToggle(value)}
                  isChecked={data ? data.isActive : false}
                  isDisabled={!isAllowed}
                >
                  Enable
                </Switch>
              )}
            </OrgPermissionCan>
          </div>
          <p className="text-sm text-mineshaft-300">
            Allow members to authenticate into Infisical with LDAP
          </p>
        </div>
      )}
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
        text="You can use LDAP authentication if you switch to Infisical's Enterprise plan."
      />
    </div>
  );
};
