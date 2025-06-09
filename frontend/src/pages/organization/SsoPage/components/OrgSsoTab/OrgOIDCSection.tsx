import { faInfoCircle, faWarning } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import { Button, Switch, Tooltip } from "@app/components/v2";
import {
  OrgPermissionActions,
  OrgPermissionSubjects,
  useOrganization,
  useSubscription
} from "@app/context";
import { useGetOIDCConfig, useLogoutUser, useUpdateOrg } from "@app/hooks/api";
import { useUpdateOIDCConfig } from "@app/hooks/api/oidcConfig/mutations";
import { usePopUp } from "@app/hooks/usePopUp";

import { OIDCModal } from "./OIDCModal";

export const OrgOIDCSection = (): JSX.Element => {
  const { currentOrg } = useOrganization();
  const { subscription } = useSubscription();

  const { data, isPending } = useGetOIDCConfig(currentOrg?.slug ?? "");
  const { mutateAsync } = useUpdateOIDCConfig();
  const { mutateAsync: updateOrg } = useUpdateOrg();

  const logout = useLogoutUser();
  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "addOIDC",
    "upgradePlan"
  ] as const);

  const handleOIDCToggle = async (value: boolean) => {
    try {
      if (!currentOrg?.id) return;

      if (!subscription?.oidcSSO) {
        handlePopUpOpen("upgradePlan");
        return;
      }

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
    }
  };

  const handleEnforceOrgAuthToggle = async (value: boolean) => {
    try {
      if (!currentOrg?.id) return;
      if (!subscription?.oidcSSO) {
        handlePopUpOpen("upgradePlan");
        return;
      }

      await updateOrg({
        orgId: currentOrg?.id,
        authEnforced: value
      });

      createNotification({
        text: `Successfully ${value ? "enforced" : "un-enforced"} org-level auth`,
        type: "success"
      });

      if (value) {
        await logout.mutateAsync();
        window.open(`/api/v1/sso/oidc/login?orgSlug=${currentOrg.slug}`);
        window.close();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleEnableBypassOrgAuthToggle = async (value: boolean) => {
    try {
      if (!currentOrg?.id) return;
      if (!subscription?.oidcSSO) {
        handlePopUpOpen("upgradePlan");
        return;
      }

      await updateOrg({
        orgId: currentOrg?.id,
        bypassOrgAuthEnabled: value
      });

      createNotification({
        text: `Successfully ${value ? "enabled" : "disabled"} admin bypassing of org-level auth`,
        type: "success"
      });
    } catch (err) {
      console.error(err);
    }
  };

  const handleOIDCGroupManagement = async (value: boolean) => {
    try {
      if (!currentOrg?.id) return;

      if (!subscription?.oidcSSO) {
        handlePopUpOpen("upgradePlan");
        return;
      }

      await mutateAsync({
        orgSlug: currentOrg?.slug,
        manageGroupMemberships: value
      });

      createNotification({
        text: `Successfully ${value ? "enabled" : "disabled"} OIDC group membership mapping`,
        type: "success"
      });
    } catch (err) {
      console.error(err);
    }
  };

  const addOidcButtonClick = async () => {
    if (subscription?.oidcSSO && currentOrg) {
      handlePopUpOpen("addOIDC");
    } else {
      handlePopUpOpen("upgradePlan");
    }
  };

  return (
    <div className="mb-4 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-6">
      <div className="py-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-md text-mineshaft-100">OIDC</h2>
          {!isPending && (
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
            {!isPending && (
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
      <div className="py-4">
        <div className="mb-2 flex justify-between">
          <div className="flex items-center gap-1">
            <span className="text-md text-mineshaft-100">Enforce OIDC SSO</span>
          </div>
          <OrgPermissionCan I={OrgPermissionActions.Edit} a={OrgPermissionSubjects.Sso}>
            {(isAllowed) => (
              <Switch
                id="enforce-org-auth"
                isChecked={currentOrg?.authEnforced ?? false}
                onCheckedChange={(value) => handleEnforceOrgAuthToggle(value)}
                isDisabled={!isAllowed}
              />
            )}
          </OrgPermissionCan>
        </div>
        <p className="text-sm text-mineshaft-300">
          <span>Enforce users to authenticate via OIDC to access this organization.</span>
        </p>
      </div>
      {currentOrg?.authEnforced && (
        <div className="py-4">
          <div className="mb-2 flex justify-between">
            <div className="flex items-center gap-1">
              <span className="text-md text-mineshaft-100">Enable Admin SSO Bypass</span>
              <Tooltip
                className="max-w-lg"
                content={
                  <div>
                    <span>
                      When this is enabled, we strongly recommend enforcing MFA at the organization
                      level.
                    </span>
                    <p className="mt-4">
                      In case of a lockout, admins can use the{" "}
                      <a
                        target="_blank"
                        className="underline underline-offset-2 hover:text-mineshaft-300"
                        href="https://infisical.com/docs/documentation/platform/sso/overview#admin-login-portal"
                        rel="noreferrer"
                      >
                        Admin Login Portal
                      </a>{" "}
                      at{" "}
                      <a
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline underline-offset-2 hover:text-mineshaft-300"
                        href={`${window.location.origin}/login/admin`}
                      >
                        {window.location.origin}/login/admin
                      </a>
                    </p>
                  </div>
                }
              >
                <FontAwesomeIcon
                  icon={faInfoCircle}
                  size="sm"
                  className="mt-0.5 inline-block text-mineshaft-400"
                />
              </Tooltip>
            </div>
            <OrgPermissionCan I={OrgPermissionActions.Edit} a={OrgPermissionSubjects.Sso}>
              {(isAllowed) => (
                <Switch
                  id="allow-admin-bypass"
                  isChecked={currentOrg?.bypassOrgAuthEnabled ?? false}
                  onCheckedChange={(value) => handleEnableBypassOrgAuthToggle(value)}
                  isDisabled={!isAllowed}
                />
              )}
            </OrgPermissionCan>
          </div>
          <p className="text-sm text-mineshaft-300">
            <span>
              Allow organization admins to bypass OIDC enforcement when SSO is unavailable,
              misconfigured, or inaccessible.
            </span>
          </p>
        </div>
      )}
      <div className="py-4">
        <div className="mb-2 flex justify-between">
          <div className="text-md flex items-center text-mineshaft-100">
            <span>OIDC Group Membership Mapping</span>
            <Tooltip
              className="max-w-lg"
              content={
                <>
                  <p>
                    When this feature is enabled, Infisical will automatically sync group
                    memberships between the OIDC provider and Infisical. Users will be added to
                    Infisical groups that match their OIDC group names, and removed from any
                    Infisical groups not present in their groups claim. When enabled, manual
                    management of Infisical group memberships will be disabled.
                  </p>
                  <p className="mt-4">
                    To use this feature you must include group claims in the OIDC token.
                  </p>
                  <a
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-2 hover:text-mineshaft-300"
                    href="https://infisical.com/docs/documentation/platform/sso/overview"
                  >
                    See your OIDC provider docs for details.
                  </a>
                  <p className="mt-4 text-yellow">
                    <FontAwesomeIcon className="mr-1" icon={faWarning} />
                    Group membership changes in the OIDC provider only sync with Infisical when a
                    user logs in via OIDC. For example, if you remove a user from a group in the
                    OIDC provider, this change will not be reflected in Infisical until their next
                    OIDC login. To ensure this behavior, Infisical recommends enabling Enforce OIDC
                    SSO.
                  </p>
                </>
              }
            >
              <FontAwesomeIcon
                icon={faInfoCircle}
                size="sm"
                className="ml-1 mt-0.5 inline-block text-mineshaft-400"
              />
            </Tooltip>
          </div>
          <OrgPermissionCan I={OrgPermissionActions.Edit} a={OrgPermissionSubjects.Sso}>
            {(isAllowed) => (
              <Switch
                id="enforce-org-auth"
                isChecked={data?.manageGroupMemberships ?? false}
                onCheckedChange={(value) => handleOIDCGroupManagement(value)}
                isDisabled={!isAllowed}
              />
            )}
          </OrgPermissionCan>
        </div>
        <p className="text-sm text-mineshaft-300">
          Infisical will manage user group memberships based on the OIDC provider
        </p>
      </div>
      <OIDCModal
        popUp={popUp}
        handlePopUpClose={handlePopUpClose}
        handlePopUpToggle={handlePopUpToggle}
      />
      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text="You can use OIDC SSO if you switch to Infisical's Pro plan."
      />
    </div>
  );
};
