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
import { useGetOIDCConfig } from "@app/hooks/api";
import { useUpdateOIDCConfig } from "@app/hooks/api/oidcConfig/mutations";
import { SubscriptionProductCategory } from "@app/hooks/api/subscriptions/types";
import { usePopUp } from "@app/hooks/usePopUp";

import { OIDCModal } from "./OIDCModal";

export const OrgOIDCSection = (): JSX.Element => {
  const { currentOrg } = useOrganization();
  const { subscription } = useSubscription();

  const { data, isPending } = useGetOIDCConfig(currentOrg?.id ?? "");
  const { mutateAsync } = useUpdateOIDCConfig();

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "addOIDC",
    "upgradePlan"
  ] as const);

  const handleOIDCToggle = async (value: boolean) => {
    if (!currentOrg?.id) return;

    if (!subscription?.get(SubscriptionProductCategory.Platform, "oidcSSO")) {
      handlePopUpOpen("upgradePlan");
      return;
    }

    await mutateAsync({
      organizationId: currentOrg?.id,
      isActive: value
    });

    createNotification({
      text: `Successfully ${value ? "enabled" : "disabled"} OIDC SSO`,
      type: "success"
    });
  };

  const handleOIDCGroupManagement = async (value: boolean) => {
    if (!currentOrg?.id) return;

    if (!subscription?.get(SubscriptionProductCategory.Platform, "oidcSSO")) {
      handlePopUpOpen("upgradePlan");
      return;
    }

    await mutateAsync({
      organizationId: currentOrg?.id,
      manageGroupMemberships: value
    });

    createNotification({
      text: `Successfully ${value ? "enabled" : "disabled"} OIDC group membership mapping`,
      type: "success"
    });
  };

  const addOidcButtonClick = async () => {
    if (subscription?.get(SubscriptionProductCategory.Platform, "oidcSSO") && currentOrg) {
      handlePopUpOpen("addOIDC");
    } else {
      handlePopUpOpen("upgradePlan");
    }
  };

  const isGoogleOAuthEnabled = currentOrg.googleSsoAuthEnforced;

  return (
    <div className="mb-4 rounded-lg border-mineshaft-600 bg-mineshaft-900">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xl font-medium text-gray-200">OIDC</p>
          <p className="mb-2 text-gray-400">Manage OIDC authentication configuration</p>
        </div>

        {!isPending && (
          <OrgPermissionCan I={OrgPermissionActions.Create} a={OrgPermissionSubjects.Sso}>
            {(isAllowed) => (
              <Button onClick={addOidcButtonClick} colorSchema="secondary" isDisabled={!isAllowed}>
                Manage
              </Button>
            )}
          </OrgPermissionCan>
        )}
      </div>
      {data && (
        <div className="py-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-md text-mineshaft-100">Enable OIDC</h2>
            {!isPending && (
              <OrgPermissionCan
                I={OrgPermissionActions.Edit}
                a={OrgPermissionSubjects.Sso}
                tooltipProps={{
                  className: "max-w-sm",
                  side: "left"
                }}
                allowedLabel={
                  isGoogleOAuthEnabled
                    ? "You cannot enable OIDC SSO while Google OAuth is enforced. Disable Google OAuth enforcement to enable OIDC SSO."
                    : undefined
                }
                renderTooltip={isGoogleOAuthEnabled}
              >
                {(isAllowed) => (
                  <div>
                    <Switch
                      id="enable-oidc-sso"
                      onCheckedChange={(value) => handleOIDCToggle(value)}
                      isChecked={data ? data.isActive : false}
                      isDisabled={!isAllowed || isGoogleOAuthEnabled}
                    />
                  </div>
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
                className="mt-0.5 ml-1 inline-block text-mineshaft-400"
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
        text="Your current plan does not include access to OIDC SSO. To unlock this feature, please upgrade to Infisical Pro plan."
      />
    </div>
  );
};
