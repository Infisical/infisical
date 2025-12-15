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
import { useCreateSSOConfig, useGetSSOConfig, useUpdateSSOConfig } from "@app/hooks/api";
import { SubscriptionProductCategory } from "@app/hooks/api/subscriptions/types";
import { usePopUp } from "@app/hooks/usePopUp";

import { SSOModal } from "./SSOModal";

// Auth providers that support group sync
const GROUP_SYNC_SUPPORTED_PROVIDERS = ["google-saml"] as const;

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
    if (!currentOrg?.id) return;

    if (!subscription?.get(SubscriptionProductCategory.Platform, "samlSSO")) {
      handlePopUpOpen("upgradePlan", {
        text: "Your current plan does not include access to SAML SSO. To unlock this feature, please upgrade to Infisical Pro plan."
      });
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
  };

  const handleSamlGroupManagement = async (value: boolean) => {
    if (!currentOrg?.id) return;

    if (
      !subscription?.get(SubscriptionProductCategory.Platform, "samlSSO") ||
      !subscription?.get(SubscriptionProductCategory.Platform, "groups")
    ) {
      handlePopUpOpen("upgradePlan", {
        isEnterpriseFeature: true,
        text: "Your current plan does not include access to SAML group mapping. To unlock this feature, please upgrade to Infisical Enterprise plan."
      });
      return;
    }

    await mutateAsync({
      organizationId: currentOrg?.id,
      enableGroupSync: value
    });

    createNotification({
      text: `Successfully ${value ? "enabled" : "disabled"} SAML group membership mapping`,
      type: "success"
    });
  };

  const addSSOBtnClick = async () => {
    try {
      if (subscription?.get(SubscriptionProductCategory.Platform, "samlSSO") && currentOrg) {
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
        handlePopUpOpen("upgradePlan", {
          text: "Your current plan does not include access to SAML SSO. To unlock this feature, please upgrade to Infisical Pro plan."
        });
      }
    } catch (err) {
      console.error(err);
    }
  };

  const isGoogleOAuthEnabled = currentOrg.googleSsoAuthEnforced;

  return (
    <div className="space-y-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xl font-medium text-gray-200">SAML</p>
          <p className="mb-2 text-gray-400">Manage SAML authentication configuration</p>
        </div>
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
      <div>
        <div className="mb-2 flex items-center justify-between pt-4">
          <h2 className="text-md text-mineshaft-100">Enable SAML</h2>
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
                  ? "You cannot enable SAML SSO while Google OAuth is enforced. Disable Google OAuth enforcement to enable SAML SSO."
                  : undefined
              }
              renderTooltip={isGoogleOAuthEnabled}
            >
              {(isAllowed) => (
                <div>
                  <Switch
                    id="enable-saml-sso"
                    onCheckedChange={(value) => handleSamlSSOToggle(value)}
                    isChecked={data ? data.isActive : false}
                    isDisabled={!isAllowed || isGoogleOAuthEnabled}
                  />
                </div>
              )}
            </OrgPermissionCan>
          )}
        </div>
        <p className="text-sm text-mineshaft-300">
          Allow members to authenticate into Infisical with SAML
        </p>
      </div>
      {data && GROUP_SYNC_SUPPORTED_PROVIDERS.includes(data.authProvider) && (
        <div className="py-4">
          <div className="mb-2 flex justify-between">
            <div className="text-md flex items-center text-mineshaft-100">
              <span>SAML Group Membership Mapping</span>
              <Tooltip
                className="max-w-lg"
                content={
                  <>
                    <p>
                      When this feature is enabled, Infisical will automatically sync group
                      memberships between the SAML provider and Infisical. Users will be added to
                      Infisical groups that match their SAML group names.
                    </p>
                    <p className="mt-4">
                      To use this feature you must include group claims in the SAML response as a
                      &quot;groups&quot; attribute.
                    </p>
                    <a
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline underline-offset-2 hover:text-mineshaft-300"
                      href="https://infisical.com/docs/documentation/platform/sso/overview"
                    >
                      See your SAML provider docs for details.
                    </a>
                    <p className="mt-4 text-yellow">
                      <FontAwesomeIcon className="mr-1" icon={faWarning} />
                      Group membership changes in the SAML provider only sync with Infisical when a
                      user logs in via SAML. For example, if you remove a user from a group in the
                      SAML provider, this change will not be reflected in Infisical until their next
                      SAML login. To ensure this behavior, Infisical recommends enabling Enforce
                      SAML SSO.
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
                  id="enable-saml-group-sync"
                  isChecked={data?.enableGroupSync ?? false}
                  onCheckedChange={(value) => handleSamlGroupManagement(value)}
                  isDisabled={!isAllowed}
                />
              )}
            </OrgPermissionCan>
          </div>
          <p className="text-sm text-mineshaft-300">
            Infisical will manage user group memberships based on the SAML provider
          </p>
        </div>
      )}
      <SSOModal
        popUp={popUp}
        handlePopUpClose={handlePopUpClose}
        handlePopUpToggle={handlePopUpToggle}
      />
      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text={popUp.upgradePlan.data?.text}
        isEnterpriseFeature={popUp.upgradePlan.data?.isEnterpriseFeature}
      />
    </div>
  );
};
