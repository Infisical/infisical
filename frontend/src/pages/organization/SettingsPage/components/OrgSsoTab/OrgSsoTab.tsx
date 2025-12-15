import { twMerge } from "tailwind-merge";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { Button, ContentLoader, EmptyState } from "@app/components/v2";
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
import { SubscriptionProductCategory } from "@app/hooks/api/subscriptions/types";

import { LDAPModal } from "./LDAPModal";
import { OIDCModal } from "./OIDCModal";
import { OrgGeneralAuthSection } from "./OrgGeneralAuthSection";
import { OrgLDAPSection } from "./OrgLDAPSection";
import { OrgOIDCSection } from "./OrgOIDCSection";
import { OrgSSOSection } from "./OrgSSOSection";
import { SSOModal } from "./SSOModal";

export const OrgSsoTab = withPermission(
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
      currentOrg?.id ?? ""
    );
    const { data: samlConfig, isPending: isLoadingSamlConfig } = useGetSSOConfig(
      currentOrg?.id ?? ""
    );

    const { data: ldapConfig, isPending: isLoadingLdapConfig } = useGetLDAPConfig(
      currentOrg?.id ?? ""
    );
    const areConfigsLoading = isLoadingOidcConfig || isLoadingSamlConfig || isLoadingLdapConfig;

    const shouldDisplaySection = (method: LoginMethod[] | LoginMethod) => {
      if (Array.isArray(method)) {
        return method.some((m) => !enabledLoginMethods || enabledLoginMethods.includes(m));
      }

      return !enabledLoginMethods || enabledLoginMethods.includes(method);
    };

    const isOidcConfigured = Boolean(oidcConfig && (oidcConfig.discoveryURL || oidcConfig.issuer));
    const isSamlConfigured =
      samlConfig && (samlConfig.entryPoint || samlConfig.issuer || samlConfig.cert);
    const isLdapConfigured = ldapConfig && ldapConfig.url;
    const isGoogleConfigured = shouldDisplaySection(LoginMethod.GOOGLE);

    const shouldShowCreateIdentityProviderView =
      !isOidcConfigured && !isSamlConfigured && !isLdapConfigured;

    const createIdentityProviderView =
      shouldDisplaySection(LoginMethod.SAML) ||
      shouldDisplaySection(LoginMethod.OIDC) ||
      shouldDisplaySection(LoginMethod.LDAP) ? (
        <>
          <div className="mb-4 space-y-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-6">
            <div>
              <p className="text-xl font-medium text-gray-200">Connect an Identity Provider</p>
              <p className="mt-1 mb-2 text-gray-400">
                Connect your identity provider to simplify user management with options like SAML,
                OIDC, and LDAP.
              </p>
            </div>
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
                    if (!subscription?.get(SubscriptionProductCategory.Platform, "samlSSO")) {
                      handlePopUpOpen("upgradePlan", { featureName: "SAML SSO" });
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
                    if (!subscription?.get(SubscriptionProductCategory.Platform, "oidcSSO")) {
                      handlePopUpOpen("upgradePlan", { featureName: "OIDC SSO" });
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
                    if (!subscription?.get(SubscriptionProductCategory.Platform, "ldap")) {
                      handlePopUpOpen("upgradePlan", {
                        featureName: "LDAP",
                        isEnterpriseFeature: true
                      });
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
      ) : (
        <EmptyState title="" iconSize="2x" className="pt-14 pb-10!">
          <p className="text-center text-lg">Single Sign-On (SSO) has been disabled</p>
          <p className="text-center">Contact your server administrator</p>
        </EmptyState>
      );

    if (areConfigsLoading) {
      return <ContentLoader />;
    }

    return (
      <>
        <div className="space-y-4">
          {shouldDisplaySection([LoginMethod.SAML, LoginMethod.GOOGLE]) && (
            <OrgGeneralAuthSection
              isSamlConfigured={isSamlConfigured}
              isOidcConfigured={isOidcConfigured}
              isGoogleConfigured={isGoogleConfigured}
              isSamlActive={Boolean(samlConfig?.isActive)}
              isOidcActive={Boolean(oidcConfig?.isActive)}
              isLdapActive={Boolean(ldapConfig?.isActive)}
            />
          )}

          {shouldShowCreateIdentityProviderView ? (
            createIdentityProviderView
          ) : (
            <div className="mb-4 space-y-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-6">
              <div>
                {isSamlConfigured && shouldDisplaySection(LoginMethod.SAML) && <OrgSSOSection />}
                {isOidcConfigured && shouldDisplaySection(LoginMethod.OIDC) && <OrgOIDCSection />}
                {isLdapConfigured && shouldDisplaySection(LoginMethod.LDAP) && <OrgLDAPSection />}
              </div>
            </div>
          )}
        </div>
        <UpgradePlanModal
          isOpen={popUp.upgradePlan.isOpen}
          onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
          text={`Your current plan does not include access to ${popUp.upgradePlan.data?.featureName}. To unlock this feature, please upgrade to Infisical ${popUp.upgradePlan.data?.isEnterpriseFeature ? "Enterprise" : "Pro"} plan.`}
          isEnterpriseFeature={popUp.upgradePlan.data?.isEnterpriseFeature}
        />
      </>
    );
  },
  { action: OrgPermissionActions.Read, subject: OrgPermissionSubjects.Sso }
);
