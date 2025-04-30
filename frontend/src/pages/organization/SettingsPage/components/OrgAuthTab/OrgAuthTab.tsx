import { twMerge } from "tailwind-merge";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { Button, ContentLoader } from "@app/components/v2";
import {
  OrgPermissionActions,
  OrgPermissionSubjects,
  useOrganization,
  useServerConfig,
  useSubscription
} from "@app/context";
import { withPermission } from "@app/hoc";
import { usePopUp } from "@app/hooks";
import { useGetLDAPConfig, useGetOIDCConfig, useGetSSOConfig } from "@app/hooks/api";
import { LoginMethod } from "@app/hooks/api/admin/types";

import { LDAPModal } from "./LDAPModal";
import { OIDCModal } from "./OIDCModal";
import { OrgGeneralAuthSection } from "./OrgGeneralAuthSection";
import { OrgGenericAuthSection } from "./OrgGenericAuthSection";
import { OrgGithubSyncSection } from "./OrgGithubSyncSection";
import { OrgLDAPSection } from "./OrgLDAPSection";
import { OrgOIDCSection } from "./OrgOIDCSection";
import { OrgScimSection } from "./OrgSCIMSection";
import { OrgSSOSection } from "./OrgSSOSection";
import { OrgUserAccessTokenLimitSection } from "./OrgUserAccessTokenLimitSection";
import { SSOModal } from "./SSOModal";

export const OrgAuthTab = withPermission(
  () => {
    const {
      config: { enabledLoginMethods }
    } = useServerConfig();
    const { currentOrg } = useOrganization();
    const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
      "addLDAP",
      "addSSO",
      "addOIDC",
      "upgradePlan"
    ] as const);

    const { subscription } = useSubscription();

    const { data: oidcConfig, isPending: isLoadingOidcConfig } = useGetOIDCConfig(
      currentOrg?.slug ?? ""
    );
    const { data: samlConfig, isPending: isLoadingSamlConfig } = useGetSSOConfig(
      currentOrg?.id ?? ""
    );

    const { data: ldapConfig, isPending: isLoadingLdapConfig } = useGetLDAPConfig(
      currentOrg?.id ?? ""
    );
    const areConfigsLoading = isLoadingOidcConfig || isLoadingSamlConfig || isLoadingLdapConfig;

    const shouldDisplaySection = (method: LoginMethod) =>
      !enabledLoginMethods || enabledLoginMethods.includes(method);

    const isOidcConfigured = oidcConfig && (oidcConfig.discoveryURL || oidcConfig.issuer);
    const isSamlConfigured =
      samlConfig && (samlConfig.entryPoint || samlConfig.issuer || samlConfig.cert);
    const isLdapConfigured = ldapConfig && ldapConfig.url;

    const shouldShowCreateIdentityProviderView =
      !isOidcConfigured && !isSamlConfigured && !isLdapConfigured;

    const createIdentityProviderView = (shouldDisplaySection(LoginMethod.SAML) ||
      shouldDisplaySection(LoginMethod.OIDC) ||
      shouldDisplaySection(LoginMethod.LDAP)) && (
      <>
        <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-6">
          <p className="text-xl font-semibold text-gray-200">Connect an Identity Provider</p>
          <p className="mb-2 mt-1 text-gray-400">
            Connect your identity provider to simplify user management
          </p>
          {shouldDisplaySection(LoginMethod.SAML) && (
            <div
              className={twMerge(
                "mt-4 flex items-center justify-between",
                (shouldDisplaySection(LoginMethod.OIDC) ||
                  shouldDisplaySection(LoginMethod.LDAP)) &&
                  "border-b border-mineshaft-500 pb-4"
              )}
            >
              <p className="text-lg text-gray-200">SAML</p>
              <Button
                colorSchema="secondary"
                onClick={() => {
                  if (!subscription?.samlSSO) {
                    handlePopUpOpen("upgradePlan", { feature: "SAML SSO", plan: "Pro" });
                    return;
                  }

                  handlePopUpOpen("addSSO");
                }}
              >
                Connect
              </Button>
            </div>
          )}
          {shouldDisplaySection(LoginMethod.OIDC) && (
            <div
              className={twMerge(
                "mt-4 flex items-center justify-between",
                shouldDisplaySection(LoginMethod.LDAP) && "border-b border-mineshaft-500 pb-4"
              )}
            >
              <p className="text-lg text-gray-200">OIDC</p>
              <Button
                colorSchema="secondary"
                onClick={() => {
                  if (!subscription?.oidcSSO) {
                    handlePopUpOpen("upgradePlan", { feature: "OIDC SSO", plan: "Pro" });
                    return;
                  }

                  handlePopUpOpen("addOIDC");
                }}
              >
                Connect
              </Button>
            </div>
          )}
          {shouldDisplaySection(LoginMethod.LDAP) && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-lg text-gray-200">LDAP</p>
              <Button
                colorSchema="secondary"
                onClick={() => {
                  if (!subscription?.ldap) {
                    handlePopUpOpen("upgradePlan", { feature: "LDAP", plan: "Enterprise" });
                    return;
                  }

                  handlePopUpOpen("addLDAP");
                }}
              >
                Connect
              </Button>
            </div>
          )}
        </div>
        <SSOModal
          hideDelete
          popUp={popUp}
          handlePopUpClose={handlePopUpClose}
          handlePopUpToggle={handlePopUpToggle}
        />
        <OIDCModal
          hideDelete
          popUp={popUp}
          handlePopUpClose={handlePopUpClose}
          handlePopUpToggle={handlePopUpToggle}
        />
        <LDAPModal
          hideDelete
          popUp={popUp}
          handlePopUpClose={handlePopUpClose}
          handlePopUpToggle={handlePopUpToggle}
        />
      </>
    );

    if (areConfigsLoading) {
      return <ContentLoader />;
    }

    return (
      <>
        <OrgGenericAuthSection />
        <OrgUserAccessTokenLimitSection />
        {shouldShowCreateIdentityProviderView ? (
          createIdentityProviderView
        ) : (
          <>
            {isSamlConfigured && shouldDisplaySection(LoginMethod.SAML) && (
              <div className="mb-4 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-6">
                <OrgGeneralAuthSection />
                <OrgSSOSection />
              </div>
            )}
            {isOidcConfigured && shouldDisplaySection(LoginMethod.OIDC) && <OrgOIDCSection />}
            {isLdapConfigured && shouldDisplaySection(LoginMethod.LDAP) && <OrgLDAPSection />}
          </>
        )}
        <OrgScimSection />
        <OrgGithubSyncSection />
        <UpgradePlanModal
          isOpen={popUp.upgradePlan.isOpen}
          onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
          text={`You can use ${
            (popUp.upgradePlan.data as { feature: string })?.feature
          } if you switch to Infisical's ${
            (popUp.upgradePlan.data as { plan: string })?.plan
          } plan.`}
        />
      </>
    );
  },
  { action: OrgPermissionActions.Read, subject: OrgPermissionSubjects.Sso }
);
