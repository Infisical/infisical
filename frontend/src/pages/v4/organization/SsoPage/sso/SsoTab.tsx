import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@infisical/cipher/ui/alert";
import { Button } from "@infisical/cipher/ui/button";
import { Card } from "@infisical/cipher/ui/card";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Stack } from "@infisical/cipher/ui/layout";
import { Loader } from "@infisical/cipher/ui/loader";

import {
  LdapUpgradeIntent,
  OidcSsoUpgradeIntent,
  SamlSsoUpgradeIntent
} from "@app/components/license/UpgradeGate/capability-upgrade-intents";
import {
  OrgPermissionEmailDomainActions,
  OrgPermissionSsoActions,
  OrgPermissionSubjects
} from "@app/context";
import { LoginMethod } from "@app/hooks/api/admin/types";

import { useOrgId, useOrgPermission } from "../../../access/permissions";
import { failed, saved } from "../../../access/toast";
import { AccessRestricted, RESTRICTED } from "../../../access/ui";
import { useV4Adapter } from "../../../data/adapters";
import { useUpgradeGate } from "../../../license";
import { AddEmailDomainDialog, EmailDomainsSection } from "./email-domains";
import { EnforcementSection } from "./enforcement";
import { LdapConfigDialog } from "./ldap-dialog";
import { OidcConfigDialog } from "./oidc-dialog";
import {
  LdapSection,
  OidcSection,
  ProviderChooserDialog,
  providerLabel,
  SamlSection,
  type SsoProvider,
  SwitchProviderDialog
} from "./providers";
import { SamlConfigDialog } from "./saml-dialog";

const SsoTabContent = () => {
  const orgId = useOrgId();
  const sso = useV4Adapter("sso");
  const { permission } = useOrgPermission();
  const { openUpgradeGate, upgradeGate } = useUpgradeGate();
  const enabledLoginMethods = sso.useServerConfig().data?.enabledLoginMethods;
  const { data: subscription, error: subscriptionError } = sso.useSubscription(orgId);
  const { data: emailDomains, isPending: isLoadingEmailDomains } = sso.useEmailDomains(
    subscription?.emailDomainVerification ? orgId : ""
  );
  const { data: oidcConfig, isPending: isLoadingOidcConfig } = sso.useOidcConfig(orgId);
  const { data: samlConfig, isPending: isLoadingSamlConfig } = sso.useSamlConfig(orgId);
  const { data: ldapConfig, isPending: isLoadingLdapConfig } = sso.useLdapConfig(orgId);
  const createSamlConfig = sso.useCreateSamlConfig();
  const updateSamlConfig = sso.useUpdateSamlConfig();
  const updateOidcConfig = sso.useUpdateOidcConfig();
  const updateLdapConfig = sso.useUpdateLdapConfig();

  const [openDialog, setOpenDialog] = useState<SsoProvider | "addDomain" | null>(null);
  const [isChooserOpen, setIsChooserOpen] = useState(false);
  const [chooserExclude, setChooserExclude] = useState<SsoProvider | null>(null);
  const [pendingSwitch, setPendingSwitch] = useState<{
    from: SsoProvider;
    to: SsoProvider;
  } | null>(null);
  const [isCreatingSamlConfig, setIsCreatingSamlConfig] = useState(false);

  const areConfigsLoading = isLoadingOidcConfig || isLoadingSamlConfig || isLoadingLdapConfig;

  const shouldDisplaySection = (method: LoginMethod[] | LoginMethod) => {
    if (Array.isArray(method)) {
      return method.some((m) => !enabledLoginMethods || enabledLoginMethods.includes(m));
    }
    return !enabledLoginMethods || enabledLoginMethods.includes(method);
  };

  const isOidcConfigured = Boolean(oidcConfig && (oidcConfig.discoveryURL || oidcConfig.issuer));
  const isSamlConfigured = Boolean(
    samlConfig && (samlConfig.entryPoint || samlConfig.issuer || samlConfig.cert)
  );
  const isLdapConfigured = Boolean(ldapConfig && ldapConfig.url);
  const isGoogleConfigured = shouldDisplaySection(LoginMethod.GOOGLE);

  const shouldShowCreateIdentityProviderView =
    !isOidcConfigured && !isSamlConfigured && !isLdapConfigured;

  const showEmailDomainAlert =
    Boolean(subscription?.emailDomainVerification) &&
    !isLoadingEmailDomains &&
    !emailDomains?.length;

  const hasUnverifiedEmailDomainsOnly =
    Boolean(subscription?.emailDomainVerification) &&
    !isLoadingEmailDomains &&
    Boolean(emailDomains?.length) &&
    !emailDomains?.some((d) => d.status === "verified");

  const canSeeEmailDomainAlert =
    showEmailDomainAlert &&
    permission.can(OrgPermissionEmailDomainActions.Read, OrgPermissionSubjects.EmailDomains);
  const canCreateEmailDomain = permission.can(
    OrgPermissionEmailDomainActions.Create,
    OrgPermissionSubjects.EmailDomains
  );

  const anyProviderAvailable =
    shouldDisplaySection(LoginMethod.SAML) ||
    shouldDisplaySection(LoginMethod.OIDC) ||
    shouldDisplaySection(LoginMethod.LDAP);

  const handleConnectSaml = async () => {
    if (!subscription?.samlSSO) {
      openUpgradeGate({
        intent: { ...SamlSsoUpgradeIntent, isEnterpriseFeature: false },
        paywallKey: "organization.org-sso.chooser"
      });
      return;
    }
    if (!samlConfig) {
      setIsCreatingSamlConfig(true);
      try {
        await createSamlConfig.mutateAsync({
          organizationId: orgId,
          authProvider: "okta-saml",
          isActive: false,
          entryPoint: "",
          issuer: "",
          cert: ""
        });
      } catch (error) {
        failed("Failed to start the SAML configuration", error);
        return;
      } finally {
        setIsCreatingSamlConfig(false);
      }
    }
    setOpenDialog("saml");
  };

  const handleConnectOidc = () => {
    if (!subscription?.oidcSSO) {
      openUpgradeGate({
        intent: { ...OidcSsoUpgradeIntent, isEnterpriseFeature: true },
        paywallKey: "organization.org-oidc.chooser"
      });
      return;
    }
    setOpenDialog("oidc");
  };

  const handleConnectLdap = () => {
    if (!subscription?.ldap) {
      openUpgradeGate({
        intent: { ...LdapUpgradeIntent, isEnterpriseFeature: true },
        paywallKey: "organization.org-ldap.chooser"
      });
      return;
    }
    setOpenDialog("ldap");
  };

  const openSelectedProvider = (provider: SsoProvider) => {
    if (provider === "saml") handleConnectSaml();
    else if (provider === "oidc") handleConnectOidc();
    else handleConnectLdap();
  };

  const isProviderEntitled = (provider: SsoProvider) => {
    if (provider === "saml") return Boolean(subscription?.samlSSO);
    if (provider === "oidc") return Boolean(subscription?.oidcSSO);
    return Boolean(subscription?.ldap);
  };

  const closeChooser = () => {
    setIsChooserOpen(false);
    setChooserExclude(null);
  };

  const openProviderChooser = (exclude: SsoProvider | null = null) => {
    setChooserExclude(exclude);
    setIsChooserOpen(true);
  };

  const handleConnectSelected = (target: SsoProvider) => {
    const exclude = chooserExclude;
    closeChooser();

    if (exclude) {
      if (!isProviderEntitled(target)) {
        openSelectedProvider(target);
        return;
      }
      setPendingSwitch({ from: exclude, to: target });
      return;
    }

    openSelectedProvider(target);
  };

  const handleConfirmSwitch = async () => {
    if (!pendingSwitch) return;
    const { from, to } = pendingSwitch;

    if (!isProviderEntitled(to)) {
      setPendingSwitch(null);
      openSelectedProvider(to);
      return;
    }

    try {
      if (from === "saml") {
        await updateSamlConfig.mutateAsync({
          organizationId: orgId,
          isActive: false,
          entryPoint: "",
          issuer: "",
          cert: "",
          mfaSignalAttribute: null,
          mfaAuthnContexts: null
        });
      } else if (from === "oidc") {
        await updateOidcConfig.mutateAsync({
          organizationId: orgId,
          isActive: false,
          issuer: "",
          discoveryURL: "",
          authorizationEndpoint: "",
          allowedEmailDomains: "",
          jwksUri: "",
          tokenEndpoint: "",
          userinfoEndpoint: "",
          clientId: "",
          clientSecret: "",
          mfaClaimName: "amr",
          mfaAmrValues: null
        });
      } else {
        await updateLdapConfig.mutateAsync({
          organizationId: orgId,
          isActive: false,
          url: "",
          bindDN: "",
          bindPass: "",
          searchBase: "",
          searchFilter: "",
          uniqueUserAttribute: "",
          groupSearchBase: "",
          groupSearchFilter: "",
          caCert: ""
        });
      }
    } catch (error) {
      failed(`Failed to switch from ${providerLabel(from)} to ${providerLabel(to)}`, error);
      return;
    }

    saved(`Switched from ${providerLabel(from)} to ${providerLabel(to)}`);
    setPendingSwitch(null);
    openSelectedProvider(to);
  };

  if (subscriptionError) throw subscriptionError;
  if (areConfigsLoading) {
    return <Loader label="Loading SSO configuration" />;
  }

  const showEnforcement = shouldDisplaySection([
    LoginMethod.SAML,
    LoginMethod.GOOGLE,
    LoginMethod.OIDC
  ]);

  const emptyStateActions = () => {
    if (showEmailDomainAlert) {
      return (
        <Button
          icon="plus"
          disabledReason={canCreateEmailDomain ? undefined : RESTRICTED}
          onClick={() => setOpenDialog("addDomain")}
        >
          Add domain
        </Button>
      );
    }
    return (
      <Button
        icon="plus"
        disabledReason={
          hasUnverifiedEmailDomainsOnly ? "Email domain verification pending" : undefined
        }
        onClick={() => openProviderChooser()}
      >
        Add provider
      </Button>
    );
  };

  const createIdentityProviderView = (
    <Card variant="framed" title="Connect an identity provider">
      {anyProviderAvailable ? (
        <EmptyState
          icon="key"
          title="No identity providers connected"
          description={
            showEmailDomainAlert
              ? "Verify a domain first to add a connection."
              : "Connect SAML, OIDC, or LDAP to authenticate members."
          }
          actions={emptyStateActions()}
        />
      ) : (
        <EmptyState
          icon="lock"
          title="Single sign-on (SSO) has been disabled"
          description="Contact your server administrator."
        />
      )}
    </Card>
  );

  return (
    <>
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
        <Stack gap={16} className="lg:col-span-2">
          {shouldShowCreateIdentityProviderView ? (
            createIdentityProviderView
          ) : (
            <>
              {canSeeEmailDomainAlert && (
                <Alert tone="info">
                  <AlertTitle>Email domain verification required</AlertTitle>
                  <AlertDescription>
                    You must verify at least one email domain before configuring an identity
                    provider. Add a domain in the Email domains section.
                  </AlertDescription>
                </Alert>
              )}
              {isSamlConfigured && shouldDisplaySection(LoginMethod.SAML) && (
                <SamlSection onSwitchProvider={() => openProviderChooser("saml")} />
              )}
              {isOidcConfigured && shouldDisplaySection(LoginMethod.OIDC) && (
                <OidcSection onSwitchProvider={() => openProviderChooser("oidc")} />
              )}
              {isLdapConfigured && shouldDisplaySection(LoginMethod.LDAP) && (
                <LdapSection onSwitchProvider={() => openProviderChooser("ldap")} />
              )}
            </>
          )}
          <EmailDomainsSection />
        </Stack>
        {showEnforcement && (
          <Stack gap={16}>
            <EnforcementSection
              isSamlConfigured={isSamlConfigured}
              isOidcConfigured={isOidcConfigured}
              isGoogleConfigured={isGoogleConfigured}
              isSamlActive={Boolean(samlConfig?.isActive)}
              isOidcActive={Boolean(oidcConfig?.isActive)}
              isLdapActive={Boolean(ldapConfig?.isActive)}
            />
          </Stack>
        )}
      </div>
      <AddEmailDomainDialog
        open={openDialog === "addDomain"}
        onOpenChange={(open) => setOpenDialog(open ? "addDomain" : null)}
      />
      {anyProviderAvailable && (
        <>
          <SamlConfigDialog
            hideDelete
            open={openDialog === "saml"}
            onOpenChange={(open) => setOpenDialog(open ? "saml" : null)}
          />
          <OidcConfigDialog
            hideDelete
            open={openDialog === "oidc"}
            onOpenChange={(open) => setOpenDialog(open ? "oidc" : null)}
          />
          <LdapConfigDialog
            hideDelete
            open={openDialog === "ldap"}
            onOpenChange={(open) => setOpenDialog(open ? "ldap" : null)}
          />
          <ProviderChooserDialog
            open={isChooserOpen}
            onOpenChange={(open) => (open ? setIsChooserOpen(true) : closeChooser())}
            exclude={chooserExclude}
            isAvailable={(provider) =>
              shouldDisplaySection(
                {
                  saml: LoginMethod.SAML,
                  oidc: LoginMethod.OIDC,
                  ldap: LoginMethod.LDAP
                }[provider]
              )
            }
            pending={isCreatingSamlConfig}
            onContinue={handleConnectSelected}
          />
          <SwitchProviderDialog
            pendingSwitch={pendingSwitch}
            onOpenChange={(open) => {
              if (!open) setPendingSwitch(null);
            }}
            onConfirm={handleConfirmSwitch}
          />
        </>
      )}
      {upgradeGate}
    </>
  );
};

export const SsoTab = () => {
  const { permission, isPending } = useOrgPermission();
  if (isPending) return <Loader label="Loading permissions" />;
  if (!permission.can(OrgPermissionSsoActions.Read, OrgPermissionSubjects.Sso)) {
    return <AccessRestricted requirement="read SSO" />;
  }
  return <SsoTabContent />;
};
