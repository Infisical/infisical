import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import { OrgPermissionCan } from "@app/components/permissions";
import { Button, Switch } from "@app/components/v2";
import {
  OrgPermissionActions,
  OrgPermissionSubjects,
  useOrganization,
} from "@app/context";
import { 
    useCreateLDAPConfig,
    useGetLDAPConfig,
    useUpdateLDAPConfig
} from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";

import { LDAPModal } from "./LDAPModal";

export const OrgLDAPSection = (): JSX.Element => {
  const { currentOrg } = useOrganization();
  const { createNotification } = useNotificationContext();
  const { data, isLoading } = useGetLDAPConfig(currentOrg?.id ?? "");
  const { mutateAsync } = useUpdateLDAPConfig();
  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "addLDAP"
  ] as const);
  
  const { mutateAsync: createMutateAsync } = useCreateLDAPConfig();

  const handleSamlSSOToggle = async (value: boolean) => { // TODO: rename to LDAP toggle
    try {
      if (!currentOrg?.id) return;

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
      if (currentOrg) {
        if (!data) {
          // case: LDAP is not configured
          // -> initialize empty LDAP configuration
          await createMutateAsync({
            organizationId: currentOrg.id,
            isActive: false,
            url: "",
            bindDN: "",
            bindPass: "",
            searchBase: "",
          });
        }

        handlePopUpOpen("addLDAP");
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="p-4 bg-mineshaft-900 mb-6 rounded-lg border border-mineshaft-600">
      <div className="flex items-center mb-8">
        <h2 className="text-xl font-semibold flex-1 text-white">LDAP Configuration</h2>
        {!isLoading && (
          <OrgPermissionCan I={OrgPermissionActions.Create} a={OrgPermissionSubjects.Sso}>
            {(isAllowed) => (
              <Button
                onClick={addLDAPBtnClick}
                colorSchema="secondary"
                isDisabled={!isAllowed}
                leftIcon={<FontAwesomeIcon icon={faPlus} />}
              >
                {data ? "Update LDAP" : "Set up LDAP"}
              </Button>
            )}
          </OrgPermissionCan>
        )}
      </div>
      {data && (
        <div className="mb-4">
          <OrgPermissionCan I={OrgPermissionActions.Edit} a={OrgPermissionSubjects.Sso}>
            {(isAllowed) => (
              <Switch
                id="enable-saml-sso"
                onCheckedChange={(value) => handleSamlSSOToggle(value)}
                isChecked={data ? data.isActive : false}
                isDisabled={!isAllowed}
              >
                Enable LDAP
              </Switch>
            )}
          </OrgPermissionCan>
        </div>
      )}
      <div className="mb-4">
        <h3 className="text-mineshaft-400 text-sm">URL</h3>
        <p className="text-gray-400 text-md">{data && data.url !== "" ? data.url : "-"}</p>
      </div>
      <div className="mb-4">
        <h3 className="text-mineshaft-400 text-sm">Bind DN</h3>
        <p className="text-gray-400 text-md">{data && data.bindDN !== "" ? data.bindDN : "-"}</p>
      </div>
      <div className="mb-4">
        <h3 className="text-mineshaft-400 text-sm">Bind Pass</h3>
        <p className="text-gray-400 text-md">
          {data && data.bindPass !== "" ? "*".repeat(data.bindPass.length) : "-"}
        </p>
      </div>
      <div className="mb-4">
        <h3 className="text-mineshaft-400 text-sm">Search Base / User DN</h3>
        <p className="text-gray-400 text-md">{data && data.searchBase !== "" ? data.searchBase : "-"}</p>
      </div>
      <LDAPModal
        popUp={popUp}
        handlePopUpClose={handlePopUpClose}
        handlePopUpToggle={handlePopUpToggle}
      />
    </div>
  );
};