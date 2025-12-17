import { useState } from "react";
import { faInfoCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import { Button, Modal, ModalClose, ModalContent, Switch, Tooltip } from "@app/components/v2";
import { NoticeBannerV2 } from "@app/components/v2/NoticeBannerV2/NoticeBannerV2";
import {
  OrgPermissionActions,
  OrgPermissionSubjects,
  useOrganization,
  useSubscription
} from "@app/context";
import { useLogoutUser, useUpdateOrg } from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";

enum EnforceAuthType {
  SAML = "saml",
  GOOGLE = "google",
  OIDC = "oidc"
}

export const OrgGeneralAuthSection = ({
  isSamlConfigured,
  isOidcConfigured,
  isGoogleConfigured,
  isSamlActive,
  isOidcActive,
  isLdapActive
}: {
  isSamlConfigured: boolean;
  isOidcConfigured: boolean;
  isGoogleConfigured: boolean;
  isSamlActive: boolean;
  isOidcActive: boolean;
  isLdapActive: boolean;
}) => {
  const { currentOrg } = useOrganization();
  const { subscription } = useSubscription();
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
    "upgradePlan",
    "enforceSamlSsoConfirmation"
  ] as const);

  const { mutateAsync } = useUpdateOrg();

  const logout = useLogoutUser();
  const [bypassEnabledInModal, setBypassEnabledInModal] = useState(false);
  const [enforcementTypeInModal, setEnforcementTypeInModal] = useState<EnforceAuthType | null>(
    null
  );

  const handleEnforceSsoConfirm = async () => {
    if (!currentOrg?.id || !enforcementTypeInModal) return;

    try {
      if (bypassEnabledInModal && !currentOrg?.bypassOrgAuthEnabled) {
        await mutateAsync({
          orgId: currentOrg?.id,
          bypassOrgAuthEnabled: true
        });
      }

      if (enforcementTypeInModal === EnforceAuthType.SAML) {
        await mutateAsync({
          orgId: currentOrg?.id,
          authEnforced: true
        });

        createNotification({
          text: "Successfully enabled org-level SAML SSO enforcement",
          type: "success"
        });

        handlePopUpToggle("enforceSamlSsoConfirmation", false);
        setBypassEnabledInModal(false);
        setEnforcementTypeInModal(null);

        await logout.mutateAsync();
        window.open(`/api/v1/sso/redirect/saml2/organizations/${currentOrg.slug}`);
        window.close();
      } else if (enforcementTypeInModal === EnforceAuthType.GOOGLE) {
        await mutateAsync({
          orgId: currentOrg?.id,
          googleSsoAuthEnforced: true
        });

        createNotification({
          text: "Successfully enabled org-level Google SSO enforcement",
          type: "success"
        });

        handlePopUpToggle("enforceSamlSsoConfirmation", false);
        setBypassEnabledInModal(false);
        setEnforcementTypeInModal(null);

        await logout.mutateAsync();
        window.open(`/api/v1/sso/redirect/google?org_slug=${currentOrg.slug}`);
        window.close();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleEnforceOrgAuthToggle = async (value: boolean, type: EnforceAuthType) => {
    if (!currentOrg?.id) return;

    if (type === EnforceAuthType.SAML) {
      if (!subscription?.samlSSO) {
        handlePopUpOpen("upgradePlan");
        return;
      }

      if (value) {
        setBypassEnabledInModal(currentOrg?.bypassOrgAuthEnabled ?? false);
        setEnforcementTypeInModal(EnforceAuthType.SAML);
        handlePopUpOpen("enforceSamlSsoConfirmation");
        return;
      }

      await mutateAsync({
        orgId: currentOrg?.id,
        authEnforced: value
      });

      createNotification({
        text: "Successfully disabled org-level SAML SSO enforcement",
        type: "success"
      });
      return;
    }

    if (type === EnforceAuthType.GOOGLE) {
      if (!subscription?.enforceGoogleSSO) {
        handlePopUpOpen("upgradePlan");
        return;
      }

      if (value) {
        setBypassEnabledInModal(currentOrg?.bypassOrgAuthEnabled ?? false);
        setEnforcementTypeInModal(EnforceAuthType.GOOGLE);
        handlePopUpOpen("enforceSamlSsoConfirmation");
        return;
      }

      await mutateAsync({
        orgId: currentOrg?.id,
        googleSsoAuthEnforced: value
      });

      createNotification({
        text: "Successfully disabled org-level Google SSO enforcement",
        type: "success"
      });
    } else if (type === EnforceAuthType.OIDC) {
      if (!subscription?.oidcSSO) {
        handlePopUpOpen("upgradePlan");
        return;
      }

      await mutateAsync({
        orgId: currentOrg?.id,
        authEnforced: value
      });

      createNotification({
        text: `Successfully ${value ? "enabled" : "disabled"} org-level OIDC SSO enforcement`,
        type: "success"
      });

      if (value) {
        await logout.mutateAsync();
        window.close();
      }
    } else {
      createNotification({
        text: `Invalid auth enforcement type ${type}`,
        type: "error"
      });
    }
  };

  const handleEnableBypassOrgAuthToggle = async (value: boolean) => {
    try {
      if (!currentOrg?.id) return;
      if (!subscription?.samlSSO) {
        handlePopUpOpen("upgradePlan");
        return;
      }

      await mutateAsync({
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

  const isGoogleOAuthEnforced = currentOrg.googleSsoAuthEnforced;

  const getActiveSsoLabel = () => {
    if (isSamlActive) return "SAML";
    if (isOidcActive) return "OIDC";
    if (isLdapActive) return "LDAP";
    return "";
  };

  return (
    <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-6">
      <div>
        <p className="text-xl font-medium text-gray-200">SSO Enforcement</p>
        <p className="mt-1 mb-2 text-gray-400">
          Manage strict enforcement of specific authentication methods for your organization.
        </p>
      </div>
      <div className="flex flex-col gap-2 py-4">
        <div className={twMerge("mt-4", (!isSamlConfigured || isGoogleOAuthEnforced) && "hidden")}>
          <div className="mb-2 flex justify-between">
            <div className="flex items-center gap-1">
              <span className="text-md text-mineshaft-100">Enforce SAML SSO</span>
            </div>
            <OrgPermissionCan I={OrgPermissionActions.Edit} a={OrgPermissionSubjects.Sso}>
              {(isAllowed) => (
                <Switch
                  id="enforce-saml-auth"
                  onCheckedChange={(value) =>
                    handleEnforceOrgAuthToggle(value, EnforceAuthType.SAML)
                  }
                  isChecked={currentOrg?.authEnforced ?? false}
                  isDisabled={!isAllowed || currentOrg?.googleSsoAuthEnforced}
                />
              )}
            </OrgPermissionCan>
          </div>
          <p className="text-sm text-mineshaft-300">
            Enforce users to authenticate via SAML to access this organization.
            <br />
            When this is enabled your organization members will only be able to login with SAML.
          </p>
        </div>

        <div className={twMerge("mt-4", (!isOidcConfigured || isGoogleOAuthEnforced) && "hidden")}>
          <div className="mb-2 flex justify-between">
            <div className="flex items-center gap-1">
              <span className="text-md text-mineshaft-100">Enforce OIDC SSO</span>
            </div>
            <OrgPermissionCan I={OrgPermissionActions.Edit} a={OrgPermissionSubjects.Sso}>
              {(isAllowed) => (
                <Switch
                  id="enforce-oidc-auth"
                  isChecked={currentOrg?.authEnforced ?? false}
                  onCheckedChange={(value) =>
                    handleEnforceOrgAuthToggle(value, EnforceAuthType.OIDC)
                  }
                  isDisabled={!isAllowed}
                />
              )}
            </OrgPermissionCan>
          </div>
          <p className="text-sm text-mineshaft-300">
            Enforce users to authenticate via OIDC to access this organization.
            <br />
            When this is enabled your organization members will only be able to login with OIDC.
          </p>
        </div>

        <div className={twMerge("mt-2", !isGoogleConfigured && "hidden")}>
          <div className="mb-2 flex justify-between">
            <div className="flex items-center gap-1">
              <span className="text-md text-mineshaft-100">Enforce Google OAuth</span>
            </div>
            <OrgPermissionCan
              I={OrgPermissionActions.Edit}
              a={OrgPermissionSubjects.Sso}
              tooltipProps={{
                className: "max-w-sm",
                side: "left"
              }}
              allowedLabel={
                isOidcActive || isSamlActive || isLdapActive
                  ? `You cannot enforce Google OAuth while ${getActiveSsoLabel()} SSO is enabled. Disable ${getActiveSsoLabel()} SSO to enforce Google OAuth.`
                  : undefined
              }
              renderTooltip={isOidcActive || isSamlActive || isLdapActive}
            >
              {(isAllowed) => (
                <div>
                  <Switch
                    id="enforce-google-sso"
                    onCheckedChange={(value) =>
                      handleEnforceOrgAuthToggle(value, EnforceAuthType.GOOGLE)
                    }
                    isChecked={currentOrg?.googleSsoAuthEnforced ?? false}
                    isDisabled={
                      !isAllowed ||
                      currentOrg?.authEnforced ||
                      isOidcActive ||
                      isSamlActive ||
                      isLdapActive
                    }
                  />
                </div>
              )}
            </OrgPermissionCan>
          </div>
          <p className="text-sm text-mineshaft-300">
            Enforce users to authenticate via Google OAuth to access this organization.
            <br />
            When this is enabled your organization members will only be able to login with Google
            OAuth (not Google SAML).
          </p>
        </div>
      </div>
      <div className="mt-4 py-4">
        <div className="mb-2 flex justify-between">
          <div className="flex items-center gap-1">
            <span className="text-md text-mineshaft-100">Enable Admin SSO Bypass</span>
            <Tooltip
              className="max-w-lg"
              content={
                <div>
                  <span>
                    When enabling admin SSO bypass, we highly recommend enabling MFA enforcement at
                    the organization-level for security reasons.
                  </span>
                  <p className="mt-4">
                    In case of a lockout, admins can use the{" "}
                    <a
                      target="_blank"
                      className="underline underline-offset-2 hover:text-mineshaft-300"
                      href="https://infisical.com/docs/documentation/platform/sso/overview#sso-break-glass"
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
            Allow organization admins to bypass SSO login enforcement when your SSO provider is
            unavailable, misconfigured, or inaccessible.
          </span>
        </p>
      </div>
      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text="Your current plan does not include access to enforce SAML SSO. To unlock this feature, please upgrade to Infisical Pro plan."
      />
      <Modal
        isOpen={popUp.enforceSamlSsoConfirmation.isOpen}
        onOpenChange={(isOpen) => {
          handlePopUpToggle("enforceSamlSsoConfirmation", isOpen);
          setBypassEnabledInModal(currentOrg?.bypassOrgAuthEnabled ?? false);
          if (!isOpen) {
            setEnforcementTypeInModal(null);
          }
        }}
      >
        <ModalContent
          className="max-w-2xl"
          title={`Enforce ${enforcementTypeInModal === EnforceAuthType.SAML ? "SAML" : "Google"} SSO`}
        >
          <NoticeBannerV2
            title={`Warning: This action will enforce ${enforcementTypeInModal === EnforceAuthType.SAML ? "SAML" : "Google"} SSO authentication`}
          >
            <p className="my-2 text-sm text-mineshaft-300">
              All users will be required to authenticate via{" "}
              {enforcementTypeInModal === EnforceAuthType.SAML ? "SAML" : "Google"} SSO to access
              this organization. Other authentication methods will be disabled.
            </p>
            <p className="text-sm font-medium text-mineshaft-200">
              Before proceeding, ensure your{" "}
              {enforcementTypeInModal === EnforceAuthType.SAML ? "SAML" : "Google"} provider is
              available and properly configured to avoid access issues.
            </p>
          </NoticeBannerV2>

          {!currentOrg?.bypassOrgAuthEnabled && (
            <div className="mt-4 flex items-center justify-between rounded-md bg-mineshaft-800/50 py-3 pr-1 pl-2">
              <div className="flex-1 pr-3">
                <p className="text-sm font-medium text-gray-200">Enable Admin SSO Bypass</p>
                <p className="mt-1 text-sm text-gray-400">
                  Allow organization admins to bypass SSO login enforcement if they experience any
                  issues with their{" "}
                  {enforcementTypeInModal === EnforceAuthType.SAML ? "SAML" : "Google"} provider
                </p>
              </div>
              <Switch
                id="bypass-enabled-modal"
                isChecked={bypassEnabledInModal}
                onCheckedChange={setBypassEnabledInModal}
              />
            </div>
          )}

          <div className="mt-6 flex gap-2">
            <Button
              onClick={handleEnforceSsoConfirm}
              className="mr-4"
              size="sm"
              colorSchema="primary"
            >
              Enable Enforcement
            </Button>
            <ModalClose asChild>
              <Button
                colorSchema="secondary"
                variant="plain"
                onClick={() => {
                  handlePopUpToggle("enforceSamlSsoConfirmation", false);
                  setBypassEnabledInModal(currentOrg?.bypassOrgAuthEnabled ?? false);
                  setEnforcementTypeInModal(null);
                }}
              >
                Cancel
              </Button>
            </ModalClose>
          </div>
        </ModalContent>
      </Modal>
    </div>
  );
};
