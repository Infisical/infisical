import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import { Button, Switch } from "@app/components/v2";
import { OrgPermissionActions, OrgPermissionSubjects, useOrganization } from "@app/context";
import { useGetOIDCConfig } from "@app/hooks/api";
import { useUpdateOIDCConfig } from "@app/hooks/api/oidcConfig/mutations";
import { usePopUp } from "@app/hooks/usePopUp";

import { OIDCModal } from "./OIDCModal";

export const OrgOIDCSection = (): JSX.Element => {
  const { currentOrg } = useOrganization();

  const { data, isLoading } = useGetOIDCConfig(currentOrg?.slug ?? "");
  const { mutateAsync } = useUpdateOIDCConfig();
  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "addOIDC"
  ] as const);

  const handleOIDCToggle = async (value: boolean) => {
    try {
      if (!currentOrg?.id) return;

      await mutateAsync({
        orgSlug: currentOrg?.slug,
        isActive: value
      });

      createNotification({
        text: `Successfully ${value ? "enabled" : "disabled"} OIDC SSO`,
        type: "success"
      });
    } catch (err) {
      console.error(err);
      createNotification({
        text: `Failed to ${value ? "enable" : "disable"} OIDC SSO`,
        type: "error"
      });
    }
  };

  const addOidcButtonClick = async () => {
    try {
      handlePopUpOpen("addOIDC");
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <>
      <hr className="border-mineshaft-600" />
      <div className="py-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-md text-mineshaft-100">OIDC</h2>
          {!isLoading && (
            <OrgPermissionCan I={OrgPermissionActions.Create} a={OrgPermissionSubjects.Sso}>
              {(isAllowed) => (
                <Button
                  onClick={addOidcButtonClick}
                  colorSchema="secondary"
                  isDisabled={!isAllowed}
                >
                  Manage
                </Button>
              )}
            </OrgPermissionCan>
          )}
        </div>
        <p className="text-sm text-mineshaft-300">Manage OIDC authentication configuration</p>
      </div>
      {data && (
        <div className="py-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-md text-mineshaft-100">Enable OIDC</h2>
            {!isLoading && (
              <OrgPermissionCan I={OrgPermissionActions.Edit} a={OrgPermissionSubjects.Sso}>
                {(isAllowed) => (
                  <Switch
                    id="enable-oidc-sso"
                    onCheckedChange={(value) => handleOIDCToggle(value)}
                    isChecked={data ? data.isActive : false}
                    isDisabled={!isAllowed}
                  />
                )}
              </OrgPermissionCan>
            )}
          </div>
          <p className="text-sm text-mineshaft-300">
            Allow members to authenticate into Infisical with OIDC
          </p>
        </div>
      )}
      <OIDCModal
        popUp={popUp}
        handlePopUpClose={handlePopUpClose}
        handlePopUpToggle={handlePopUpToggle}
      />
    </>
  );
};
