import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { twMerge } from "tailwind-merge";

import { SsoEnforcementUpgradeIntent, UpgradeGate } from "@app/components/license/UpgradeGate";
import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldTitle,
  Toggle
} from "@app/components/v3";
import {
  OrgPermissionActions,
  OrgPermissionSubjects,
  useOrganization,
  useSubscription
} from "@app/context";
import { useLogoutUser, useUpdateOrg } from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";

import { SsoMfaTrustField } from "./SsoMfaTrustField";

enum EnforceAuthType {
  SAML = "saml",
  GOOGLE = "google",
  OIDC = "oidc"
}

const upgradeDescriptions: Record<string, string> = {
  "enforce SAML SSO": "Require SAML single sign-on for organization members.",
  "enforce Google OAuth": "Require Google sign-in for organization members.",
  "OIDC SSO": "Authenticate organization members with OIDC single sign-on.",
  "Admin SSO Bypass": "Allow organization admins to sign in without single sign-on."
};

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
        handlePopUpOpen("upgradePlan", { featureName: "enforce SAML SSO", planName: "Pro" });
        return;
      }

      if (value) {
        setBypassEnabledInModal(true);
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
        handlePopUpOpen("upgradePlan", {
          featureName: "enforce Google OAuth",
          planName: "Advanced"
        });
        return;
      }

      if (value) {
        setBypassEnabledInModal(true);
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
        handlePopUpOpen("upgradePlan", { featureName: "OIDC SSO", planName: "Enterprise" });
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
        handlePopUpOpen("upgradePlan", { featureName: "Admin SSO Bypass", planName: "Pro" });
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
  const isAnySsoEnforced = Boolean(currentOrg?.authEnforced || isGoogleOAuthEnforced);
  const enforcementLabel = enforcementTypeInModal === EnforceAuthType.SAML ? "SAML" : "Google";

  return (
    <>
      <Card>
        <CardHeader className="border-b">
          <CardTitle>
            <ShieldCheck className="size-4 text-accent" />
            Enforcement
            {isAnySsoEnforced && <Badge variant="success">Active</Badge>}
          </CardTitle>
          <CardDescription>Require all members to sign in via your IdP.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field
              orientation="horizontal"
              className={twMerge((!isSamlConfigured || isGoogleOAuthEnforced) && "hidden")}
            >
              <FieldContent>
                <FieldTitle>Enforce SAML SSO</FieldTitle>
                <FieldDescription>Members can only sign in via SAML.</FieldDescription>
              </FieldContent>
              <OrgPermissionCan I={OrgPermissionActions.Edit} a={OrgPermissionSubjects.Sso}>
                {(isAllowed) => (
                  <Toggle
                    id="enforce-saml-auth"
                    variant="org"
                    checked={currentOrg?.authEnforced ?? false}
                    onCheckedChange={(value) =>
                      handleEnforceOrgAuthToggle(value, EnforceAuthType.SAML)
                    }
                    disabled={!isAllowed || currentOrg?.googleSsoAuthEnforced}
                  />
                )}
              </OrgPermissionCan>
            </Field>

            <Field
              orientation="horizontal"
              className={twMerge((!isOidcConfigured || isGoogleOAuthEnforced) && "hidden")}
            >
              <FieldContent>
                <FieldTitle>Enforce OIDC SSO</FieldTitle>
                <FieldDescription>Members can only sign in via OIDC.</FieldDescription>
              </FieldContent>
              <OrgPermissionCan I={OrgPermissionActions.Edit} a={OrgPermissionSubjects.Sso}>
                {(isAllowed) => (
                  <Toggle
                    id="enforce-oidc-auth"
                    variant="org"
                    checked={currentOrg?.authEnforced ?? false}
                    onCheckedChange={(value) =>
                      handleEnforceOrgAuthToggle(value, EnforceAuthType.OIDC)
                    }
                    disabled={!isAllowed}
                  />
                )}
              </OrgPermissionCan>
            </Field>

            <Field
              orientation="horizontal"
              className={twMerge(
                (!isGoogleConfigured || isSamlActive || isOidcActive || isLdapActive) && "hidden"
              )}
            >
              <FieldContent>
                <FieldTitle>Enforce Google OAuth</FieldTitle>
                <FieldDescription>Members can only sign in via Google OAuth.</FieldDescription>
              </FieldContent>
              <OrgPermissionCan I={OrgPermissionActions.Edit} a={OrgPermissionSubjects.Sso}>
                {(isAllowed) => (
                  <Toggle
                    id="enforce-google-sso"
                    variant="org"
                    checked={currentOrg?.googleSsoAuthEnforced ?? false}
                    onCheckedChange={(value) =>
                      handleEnforceOrgAuthToggle(value, EnforceAuthType.GOOGLE)
                    }
                    disabled={!isAllowed || currentOrg?.authEnforced}
                  />
                )}
              </OrgPermissionCan>
            </Field>

            <div className="ml-1 border-l border-border pl-4">
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldTitle>Admin SSO Bypass</FieldTitle>
                  <FieldDescription>
                    Admins can sign in with a password at{" "}
                    <a
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono underline underline-offset-2 hover:text-foreground"
                      href={`${window.location.origin}/login/admin`}
                    >
                      /login/admin
                    </a>{" "}
                    if your IdP is inaccessible.
                  </FieldDescription>
                </FieldContent>
                <OrgPermissionCan I={OrgPermissionActions.Edit} a={OrgPermissionSubjects.Sso}>
                  {(isAllowed) => (
                    <Toggle
                      id="allow-admin-bypass"
                      variant="org"
                      checked={currentOrg?.bypassOrgAuthEnabled ?? false}
                      onCheckedChange={(value) => handleEnableBypassOrgAuthToggle(value)}
                      disabled={!isAllowed}
                    />
                  )}
                </OrgPermissionCan>
              </Field>
              {isAnySsoEnforced && currentOrg?.bypassOrgAuthEnabled && !currentOrg?.enforceMfa && (
                <Alert variant="warning" className="mt-3">
                  <AlertTriangle />
                  <AlertDescription>
                    Org MFA is off, so bypass is password-only.{" "}
                    <Link
                      to="/organizations/$orgId/settings"
                      params={{ orgId: currentOrg.id }}
                      search={{ selectedTab: "tab-org-security" }}
                      className="underline underline-offset-2 hover:text-foreground"
                    >
                      Enforce MFA
                    </Link>
                  </AlertDescription>
                </Alert>
              )}
            </div>

            <SsoMfaTrustField />
          </FieldGroup>
        </CardContent>
      </Card>

      <UpgradeGate
        paywallKey="organization.org-general-auth"
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        intent={{
          ...SsoEnforcementUpgradeIntent,
          description:
            upgradeDescriptions[popUp.upgradePlan.data?.featureName ?? ""] ??
            SsoEnforcementUpgradeIntent.description,
          isEnterpriseFeature: popUp.upgradePlan.data?.planName === "Enterprise"
        }}
      />

      <Dialog
        open={popUp.enforceSamlSsoConfirmation.isOpen}
        onOpenChange={(isOpen) => {
          handlePopUpToggle("enforceSamlSsoConfirmation", isOpen);
          setBypassEnabledInModal(currentOrg?.bypassOrgAuthEnabled ?? false);
          if (!isOpen) {
            setEnforcementTypeInModal(null);
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Enforce {enforcementLabel} SSO</DialogTitle>
          </DialogHeader>

          <Alert variant="warning">
            <AlertTriangle />
            <AlertTitle>This action will enforce {enforcementLabel} SSO authentication</AlertTitle>
            <AlertDescription>
              <p>
                All users will be required to authenticate via {enforcementLabel} SSO to access this
                organization. Other authentication methods will be disabled.
              </p>
              <p className="font-medium">
                Before proceeding, ensure your {enforcementLabel} provider is available and properly
                configured to avoid access issues.
              </p>
              {enforcementTypeInModal !== EnforceAuthType.GOOGLE && (
                <p>
                  This also disables email & password signup for your verified domain(s) and skips
                  email verification for SSO sign-ins. Make sure a break-glass admin already has a
                  password and SSO bypass access before continuing — the signup block prevents
                  creating new password accounts for the domain afterwards.
                </p>
              )}
            </AlertDescription>
          </Alert>

          {!currentOrg?.bypassOrgAuthEnabled && (
            <Field orientation="horizontal">
              <FieldContent>
                <FieldTitle>Enable Admin SSO Bypass</FieldTitle>
                <FieldDescription>
                  Allow organization admins to bypass SSO login enforcement if they experience any
                  issues with their {enforcementLabel} provider.
                </FieldDescription>
              </FieldContent>
              <Toggle
                id="bypass-enabled-modal"
                variant="org"
                checked={bypassEnabledInModal}
                onCheckedChange={setBypassEnabledInModal}
              />
            </Field>
          )}

          <DialogFooter>
            <DialogClose asChild>
              <Button
                variant="ghost"
                onClick={() => {
                  handlePopUpToggle("enforceSamlSsoConfirmation", false);
                  setBypassEnabledInModal(currentOrg?.bypassOrgAuthEnabled ?? false);
                  setEnforcementTypeInModal(null);
                }}
              >
                Cancel
              </Button>
            </DialogClose>
            <Button variant="org" onClick={handleEnforceSsoConfirm}>
              Enable Enforcement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
