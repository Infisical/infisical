import { faInfoCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import { Switch, Tooltip } from "@app/components/v2";
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
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["upgradePlan"] as const);

  const { mutateAsync } = useUpdateOrg();

  const logout = useLogoutUser();

  const handleEnforceOrgAuthToggle = async (value: boolean, type: EnforceAuthType) => {
    if (!currentOrg?.id) return;

    if (type === EnforceAuthType.SAML) {
      if (!subscription?.samlSSO) {
        handlePopUpOpen("upgradePlan");
        return;
      }

      await mutateAsync({
        orgId: currentOrg?.id,
        authEnforced: value
      });
    } else if (type === EnforceAuthType.GOOGLE) {
      if (!subscription?.enforceGoogleSSO) {
        handlePopUpOpen("upgradePlan");
        return;
      }

      await mutateAsync({
        orgId: currentOrg?.id,
        googleSsoAuthEnforced: value
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
    } else {
      createNotification({
        text: `Invalid auth enforcement type ${type}`,
        type: "error"
      });
    }

    createNotification({
      text: `Successfully ${value ? "enabled" : "disabled"} org-level auth`,
      type: "success"
    });

    if (value) {
      await logout.mutateAsync();

      if (type === EnforceAuthType.SAML) {
        window.open(`/api/v1/sso/redirect/saml2/organizations/${currentOrg.slug}`);
      } else if (type === EnforceAuthType.GOOGLE) {
        window.open(`/api/v1/sso/redirect/google?org_slug=${currentOrg.slug}`);
      }

      window.close();
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
      {(currentOrg?.authEnforced || currentOrg?.googleSsoAuthEnforced) && (
        <div className="mt-4 py-4">
          <div className="mb-2 flex justify-between">
            <div className="flex items-center gap-1">
              <span className="text-md text-mineshaft-100">Enable Admin SSO Bypass</span>
              <Tooltip
                className="max-w-lg"
                content={
                  <div>
                    <span>
                      When enabling admin SSO bypass, we highly recommend enabling MFA enforcement
                      at the organization-level for security reasons.
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
              Allow organization admins to bypass SSO login enforcement when your SSO provider is
              unavailable, misconfigured, or inaccessible.
            </span>
          </p>
        </div>
      )}
      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text="Your current plan does not include access to enforce SAML SSO. To unlock this feature, please upgrade to Infisical Pro plan."
      />
    </div>
  );
};
