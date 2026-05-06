import { useState } from "react";
import { ArrowLeftRight, IdCardIcon, Info, Plus } from "lucide-react";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DocumentationLinkBadge,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldTitle,
  PageLoader,
  RadioGroup,
  RadioGroupItem,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import {
  OrgPermissionEmailDomainActions,
  OrgPermissionSsoActions,
  OrgPermissionSubjects,
  useOrganization,
  useOrgPermission,
  useServerConfig,
  useSubscription
} from "@app/context";
import { withPermission } from "@app/hoc";
import { usePopUp } from "@app/hooks";
import {
  useCreateSSOConfig,
  useGetEmailDomains,
  useGetLDAPConfig,
  useGetOIDCConfig,
  useGetSSOConfig,
  useUpdateLDAPConfig,
  useUpdateSSOConfig
} from "@app/hooks/api";
import { LoginMethod } from "@app/hooks/api/admin/types";
import { useUpdateOIDCConfig } from "@app/hooks/api/oidcConfig/mutations";

import { LDAPModal } from "./LDAPModal";
import { OIDCModal } from "./OIDCModal";
import { OrgEmailDomainsSection } from "./OrgEmailDomainsSection";
import { OrgGeneralAuthSection } from "./OrgGeneralAuthSection";
import { OrgLDAPSection } from "./OrgLDAPSection";
import { OrgOIDCSection } from "./OrgOIDCSection";
import { OrgSSOSection } from "./OrgSSOSection";
import { SSOModal } from "./SSOModal";

const EmailDomainAlert = () => (
  <Alert variant="info">
    <Info />
    <AlertTitle>Email domain verification required</AlertTitle>
    <AlertDescription>
      You must verify at least one email domain before configuring an identity provider. Add a
      domain in the Email Domains section above.
    </AlertDescription>
  </Alert>
);

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
      "upgradePlan",
      "addDomain",
      "verifyDomain"
    ] as const);

    const [isChooserOpen, setIsChooserOpen] = useState(false);
    const [selectedProvider, setSelectedProvider] = useState<string>("");
    const [chooserExclude, setChooserExclude] = useState<"saml" | "oidc" | "ldap" | null>(null);
    const [pendingSwitch, setPendingSwitch] = useState<{
      from: "saml" | "oidc" | "ldap";
      to: "saml" | "oidc" | "ldap";
    } | null>(null);

    const { mutateAsync: updateSamlAsync } = useUpdateSSOConfig();
    const { mutateAsync: createSamlAsync, isPending: isCreatingSamlConfig } = useCreateSSOConfig();
    const { mutateAsync: updateOidcAsync } = useUpdateOIDCConfig();
    const { mutateAsync: updateLdapAsync } = useUpdateLDAPConfig();

    const { subscription } = useSubscription();
    const { permission } = useOrgPermission();

    const { data: emailDomains, isPending } = useGetEmailDomains(
      subscription?.emailDomainVerification ? currentOrg?.id : ""
    );

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

    const showEmailDomainAlert =
      Boolean(subscription?.emailDomainVerification) && !isPending && !emailDomains?.length;

    const hasUnverifiedEmailDomainsOnly =
      Boolean(subscription?.emailDomainVerification) &&
      !isPending &&
      Boolean(emailDomains?.length) &&
      !emailDomains?.some((d) => d.status === "verified");

    const canSeeEmailDomainAlert =
      showEmailDomainAlert &&
      permission.can(OrgPermissionEmailDomainActions.Read, OrgPermissionSubjects.EmailDomains);

    const anyProviderAvailable =
      shouldDisplaySection(LoginMethod.SAML) ||
      shouldDisplaySection(LoginMethod.OIDC) ||
      shouldDisplaySection(LoginMethod.LDAP);

    const handleConnectSaml = async () => {
      if (!subscription?.samlSSO) {
        handlePopUpOpen("upgradePlan", { featureName: "SAML SSO" });
        return;
      }
      if (!currentOrg) return;
      if (!samlConfig) {
        await createSamlAsync({
          organizationId: currentOrg.id,
          authProvider: "okta-saml",
          isActive: false,
          entryPoint: "",
          issuer: "",
          cert: ""
        });
      }
      handlePopUpOpen("addSSO");
    };

    const handleConnectOidc = () => {
      if (!subscription?.oidcSSO) {
        handlePopUpOpen("upgradePlan", { featureName: "OIDC SSO" });
        return;
      }
      handlePopUpOpen("addOIDC");
    };

    const handleConnectLdap = () => {
      if (!subscription?.ldap) {
        handlePopUpOpen("upgradePlan", {
          featureName: "LDAP",
          isEnterpriseFeature: true
        });
        return;
      }
      handlePopUpOpen("addLDAP");
    };

    const closeChooser = () => {
      setIsChooserOpen(false);
      setSelectedProvider("");
      setChooserExclude(null);
    };

    const openProviderChooser = (exclude: "saml" | "oidc" | "ldap" | null = null) => {
      setChooserExclude(exclude);
      setSelectedProvider("");
      setIsChooserOpen(true);
    };

    const openSelectedProvider = (provider: string) => {
      if (provider === "saml") handleConnectSaml();
      else if (provider === "oidc") handleConnectOidc();
      else if (provider === "ldap") handleConnectLdap();
    };

    const isProviderEntitled = (provider: "saml" | "oidc" | "ldap") => {
      if (provider === "saml") return Boolean(subscription?.samlSSO);
      if (provider === "oidc") return Boolean(subscription?.oidcSSO);
      return Boolean(subscription?.ldap);
    };

    const handleConnectSelected = () => {
      if (!selectedProvider) return;
      const exclude = chooserExclude;
      const target = selectedProvider;
      closeChooser();

      if (exclude && (target === "saml" || target === "oidc" || target === "ldap")) {
        if (!isProviderEntitled(target)) {
          openSelectedProvider(target);
          return;
        }
        setPendingSwitch({ from: exclude, to: target });
        return;
      }

      openSelectedProvider(target);
    };

    const providerLabel = (provider: "saml" | "oidc" | "ldap") => {
      if (provider === "saml") return "SAML";
      if (provider === "oidc") return "OIDC";
      return "LDAP";
    };

    const handleConfirmSwitch = async () => {
      if (!pendingSwitch || !currentOrg) return;
      const { from, to } = pendingSwitch;

      if (!isProviderEntitled(to)) {
        setPendingSwitch(null);
        openSelectedProvider(to);
        return;
      }

      if (from === "saml") {
        await updateSamlAsync({
          organizationId: currentOrg.id,
          isActive: false,
          entryPoint: "",
          issuer: "",
          cert: ""
        });
      } else if (from === "oidc") {
        await updateOidcAsync({
          organizationId: currentOrg.id,
          isActive: false,
          issuer: "",
          discoveryURL: "",
          authorizationEndpoint: "",
          allowedEmailDomains: "",
          jwksUri: "",
          tokenEndpoint: "",
          userinfoEndpoint: "",
          clientId: "",
          clientSecret: ""
        });
      } else {
        await updateLdapAsync({
          organizationId: currentOrg.id,
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

      createNotification({
        text: `Switched from ${providerLabel(from)} to ${providerLabel(to)}.`,
        type: "success"
      });

      setPendingSwitch(null);
      openSelectedProvider(to);
    };

    const createIdentityProviderView = (
      <Card>
        <CardHeader className="border-b">
          <CardTitle>
            <IdCardIcon className="size-4 text-accent" />
            Connect an Identity Provider
          </CardTitle>
          <CardDescription>
            Connect your identity provider to simplify user management with options like SAML, OIDC,
            and LDAP.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {anyProviderAvailable ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyTitle>No identity providers connected</EmptyTitle>
                <EmptyDescription>
                  {showEmailDomainAlert
                    ? "Verify a domain first to add a connection."
                    : "Connect SAML, OIDC, or LDAP to authenticate members."}
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                {showEmailDomainAlert && (
                  <OrgPermissionCan
                    I={OrgPermissionEmailDomainActions.Create}
                    a={OrgPermissionSubjects.EmailDomains}
                  >
                    {(isAllowed) => (
                      <Button
                        variant="org"
                        isDisabled={!isAllowed}
                        onClick={() => handlePopUpOpen("addDomain")}
                      >
                        <Plus />
                        Add Domain
                      </Button>
                    )}
                  </OrgPermissionCan>
                )}
                {!showEmailDomainAlert && hasUnverifiedEmailDomainsOnly && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>
                        <Button variant="org" isDisabled>
                          <Plus />
                          Add Provider
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>Email domain verification pending</TooltipContent>
                  </Tooltip>
                )}
                {!showEmailDomainAlert && !hasUnverifiedEmailDomainsOnly && (
                  <Button variant="org" onClick={() => openProviderChooser()}>
                    <Plus />
                    Add Provider
                  </Button>
                )}
              </EmptyContent>
            </Empty>
          ) : (
            <Empty className="border">
              <EmptyHeader>
                <EmptyTitle>Single Sign-On (SSO) has been disabled</EmptyTitle>
                <EmptyDescription>Contact your server administrator.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>
    );

    if (areConfigsLoading) {
      return <PageLoader />;
    }

    const showEnforcement = shouldDisplaySection([
      LoginMethod.SAML,
      LoginMethod.GOOGLE,
      LoginMethod.OIDC
    ]);

    return (
      <>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="flex flex-col gap-4 lg:col-span-2">
            {shouldShowCreateIdentityProviderView ? (
              createIdentityProviderView
            ) : (
              <>
                {canSeeEmailDomainAlert && <EmailDomainAlert />}
                {isSamlConfigured && shouldDisplaySection(LoginMethod.SAML) && (
                  <OrgSSOSection onSwitchProvider={() => openProviderChooser("saml")} />
                )}
                {isOidcConfigured && shouldDisplaySection(LoginMethod.OIDC) && (
                  <OrgOIDCSection onSwitchProvider={() => openProviderChooser("oidc")} />
                )}
                {isLdapConfigured && shouldDisplaySection(LoginMethod.LDAP) && (
                  <OrgLDAPSection onSwitchProvider={() => openProviderChooser("ldap")} />
                )}
              </>
            )}
            <OrgEmailDomainsSection
              popUp={popUp}
              handlePopUpOpen={handlePopUpOpen}
              handlePopUpClose={handlePopUpClose}
              handlePopUpToggle={handlePopUpToggle}
            />
          </div>
          {showEnforcement && (
            <div className="flex flex-col gap-4">
              <OrgGeneralAuthSection
                isSamlConfigured={isSamlConfigured}
                isOidcConfigured={isOidcConfigured}
                isGoogleConfigured={isGoogleConfigured}
                isSamlActive={Boolean(samlConfig?.isActive)}
                isOidcActive={Boolean(oidcConfig?.isActive)}
                isLdapActive={Boolean(ldapConfig?.isActive)}
              />
            </div>
          )}
        </div>
        {anyProviderAvailable && (
          <>
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
            <Dialog
              open={isChooserOpen}
              onOpenChange={(open) => {
                if (open) {
                  setIsChooserOpen(true);
                } else {
                  closeChooser();
                }
              }}
            >
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-x-2">
                    {chooserExclude ? "Switch Identity Provider" : "Add Identity Provider"}
                    <DocumentationLinkBadge href="https://infisical.com/docs/integrations/user-authentication" />
                  </DialogTitle>
                  <DialogDescription>Pick a protocol to configure.</DialogDescription>
                </DialogHeader>
                <RadioGroup value={selectedProvider} onValueChange={setSelectedProvider}>
                  {shouldDisplaySection(LoginMethod.SAML) && chooserExclude !== "saml" && (
                    <FieldLabel htmlFor="provider-saml" variant="org">
                      <Field orientation="horizontal">
                        <FieldContent>
                          <FieldTitle>SAML</FieldTitle>
                          <FieldDescription>
                            Standard enterprise SSO — Okta, Azure, Google Workspace.
                          </FieldDescription>
                        </FieldContent>
                        <RadioGroupItem value="saml" id="provider-saml" />
                      </Field>
                    </FieldLabel>
                  )}
                  {shouldDisplaySection(LoginMethod.OIDC) && chooserExclude !== "oidc" && (
                    <FieldLabel htmlFor="provider-oidc" variant="org">
                      <Field orientation="horizontal">
                        <FieldContent>
                          <FieldTitle>OIDC</FieldTitle>
                          <FieldDescription>
                            OAuth-based identity layer — Auth0, Keycloak, custom IDPs.
                          </FieldDescription>
                        </FieldContent>
                        <RadioGroupItem value="oidc" id="provider-oidc" />
                      </Field>
                    </FieldLabel>
                  )}
                  {shouldDisplaySection(LoginMethod.LDAP) && chooserExclude !== "ldap" && (
                    <FieldLabel htmlFor="provider-ldap" variant="org">
                      <Field orientation="horizontal">
                        <FieldContent>
                          <FieldTitle>LDAP</FieldTitle>
                          <FieldDescription>
                            Directory protocol for on-prem identity stores.
                          </FieldDescription>
                        </FieldContent>
                        <RadioGroupItem value="ldap" id="provider-ldap" />
                      </Field>
                    </FieldLabel>
                  )}
                </RadioGroup>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="ghost">Cancel</Button>
                  </DialogClose>
                  <Button
                    variant="org"
                    isPending={isCreatingSamlConfig}
                    isDisabled={!selectedProvider}
                    onClick={handleConnectSelected}
                  >
                    Continue
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <AlertDialog
              open={pendingSwitch !== null}
              onOpenChange={(open) => {
                if (!open) setPendingSwitch(null);
              }}
            >
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogMedia>
                    <ArrowLeftRight />
                  </AlertDialogMedia>
                  <AlertDialogTitle>
                    {pendingSwitch
                      ? `Switch to ${providerLabel(pendingSwitch.to)}?`
                      : "Switch identity provider?"}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {pendingSwitch ? (
                      <>
                        This will clear your current {providerLabel(pendingSwitch.from)}{" "}
                        configuration. Members will no longer be able to sign in via{" "}
                        {providerLabel(pendingSwitch.from)} or SSO until{" "}
                        {providerLabel(pendingSwitch.to)} is configured and activated.
                      </>
                    ) : null}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction variant="danger" onClick={handleConfirmSwitch}>
                    Switch
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
        <UpgradePlanModal
          isOpen={popUp.upgradePlan.isOpen}
          onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
          text={`Your current plan does not include access to ${popUp.upgradePlan.data?.featureName}. To unlock this feature, please upgrade to Infisical ${popUp.upgradePlan.data?.isEnterpriseFeature ? "Enterprise" : "Pro"} plan.`}
          isEnterpriseFeature={popUp.upgradePlan.data?.isEnterpriseFeature}
        />
      </>
    );
  },
  { action: OrgPermissionSsoActions.Read, subject: OrgPermissionSubjects.Sso }
);
