import { faInfoCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

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
import { twMerge } from "tailwind-merge";

enum EnforceAuthType {
  SAML = "saml",
  GOOGLE = "google",
  OIDC = "oidc"
}

export const OrgGeneralAuthSection = ({
  isSamlConfigured,
  isOidcConfigured
}: {
  isSamlConfigured: boolean;
  isOidcConfigured: boolean;
}) => {
  const { currentOrg } = useOrganization();
  const { subscription } = useSubscription();
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["upgradePlan"] as const);

  const { mutateAsync } = useUpdateOrg();

  const logout = useLogoutUser();

  const handleEnforceOrgAuthToggle = async (value: boolean, type: EnforceAuthType) => {
    try {
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
    } catch (err) {
      console.error(err);
      createNotification({
        text: (err as { response: { data: { message: string } } }).response.data.message,
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

  return (
    <>
      <div className="flex flex-col gap-2">
        <div className={twMerge("mt-4", !isSamlConfigured && "hidden")}>
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
          </p>
        </div>

        <div className={twMerge("mt-4", !isOidcConfigured && "hidden")}>
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
            <span>Enforce users to authenticate via OIDC to access this organization.</span>
          </p>
        </div>

        <div className="mt-2">
          <div className="mb-2 flex justify-between">
            <div className="flex items-center gap-1">
              <span className="text-md text-mineshaft-100">Enforce Google SSO</span>
            </div>
            <OrgPermissionCan I={OrgPermissionActions.Edit} a={OrgPermissionSubjects.Sso}>
              {(isAllowed) => (
                <Switch
                  id="enforce-google-sso"
                  onCheckedChange={(value) =>
                    handleEnforceOrgAuthToggle(value, EnforceAuthType.GOOGLE)
                  }
                  isChecked={currentOrg?.googleSsoAuthEnforced ?? false}
                  isDisabled={!isAllowed || currentOrg?.authEnforced}
                />
              )}
            </OrgPermissionCan>
          </div>
          <p className="text-sm text-mineshaft-300">
            Enforce users to authenticate via Google to access this organization.
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
              Allow organization admins to bypass SAML enforcement when SSO is unavailable,
              misconfigured, or inaccessible.
            </span>
          </p>
        </div>
      )}
      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text="You can enforce SAML SSO if you switch to Infisical's Pro plan."
      />
    </>
  );
};
