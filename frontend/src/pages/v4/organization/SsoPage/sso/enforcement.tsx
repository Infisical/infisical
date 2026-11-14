import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@infisical/cipher/ui/alert";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { Card } from "@infisical/cipher/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@infisical/cipher/ui/dialog";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldTitle
} from "@infisical/cipher/ui/field";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { Switch } from "@infisical/cipher/ui/switch";
import { TooltipText } from "@infisical/cipher/ui/tooltip";
import { Link } from "@tanstack/react-router";

import {
  SsoEnforcementUpgradeIntent,
  MfaEnforcementUpgradeIntent
} from "@app/components/license/UpgradeGate/capability-upgrade-intents";
import {
  OrgPermissionSsoActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { SsoMfaTrust } from "@app/hooks/api/organization/types";

import { useOrgId, useOrgPermission } from "../../../access/permissions";
import { failed, saved } from "../../../access/toast";
import { Gate, RESTRICTED } from "../../../access/ui";
import { useV4Adapter } from "../../../data/adapters";
import { useUpgradeGate } from "../../../license";
import { orgHref, useGo } from "../../../links";

export type EnforcementSectionProps = {
  isSamlConfigured: boolean;
  isOidcConfigured: boolean;
  isGoogleConfigured: boolean;
  isSamlActive: boolean;
  isOidcActive: boolean;
  isLdapActive: boolean;
};

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

type SettingKey = EnforceAuthType | "bypass" | "mfaTrust";

const SettingRow = ({
  id,
  title,
  badge,
  description,
  checked,
  pending,
  disabledReason,
  onChange
}: {
  id: string;
  title: string;
  badge?: React.ReactNode;
  description: React.ReactNode;
  checked: boolean;
  pending: boolean;
  disabledReason?: string;
  onChange: (value: boolean) => void;
}) => (
  <Field orientation="horizontal">
    <FieldContent>
      <FieldTitle>
        <span id={`${id}-title`}>{title}</span>
        {badge}
      </FieldTitle>
      <FieldDescription>{description}</FieldDescription>
    </FieldContent>
    <Gate allowed={!disabledReason} reason={disabledReason}>
      <Switch
        id={id}
        aria-labelledby={`${id}-title`}
        checked={checked}
        disabled={Boolean(disabledReason) || pending}
        onChange={onChange}
      />
    </Gate>
  </Field>
);

export const EnforcementSection = ({
  isSamlConfigured,
  isOidcConfigured,
  isGoogleConfigured,
  isSamlActive,
  isOidcActive,
  isLdapActive
}: EnforcementSectionProps) => {
  const orgId = useOrgId();
  const go = useGo();
  const org = useV4Adapter("org");
  const { data: currentOrg } = org.useOrganization(orgId);
  const { data: subscription } = useV4Adapter("sso").useSubscription(orgId);
  const updateOrg = org.useUpdateOrganization();
  const logout = org.useLogout();
  const { permission } = useOrgPermission();
  const { openUpgradeGate, upgradeGate } = useUpgradeGate();

  const [pendingKey, setPendingKey] = useState<SettingKey | null>(null);
  const [confirmPending, setConfirmPending] = useState(false);
  const [bypassEnabledInModal, setBypassEnabledInModal] = useState(false);
  const [enforcementTypeInModal, setEnforcementTypeInModal] = useState<EnforceAuthType | null>(
    null
  );

  const canEditSso = permission.can(OrgPermissionSsoActions.Edit, OrgPermissionSubjects.Sso);

  const openUpgrade = (featureName: string, planName: string) =>
    openUpgradeGate({
      paywallKey: "organization.org-general-auth",
      intent: {
        ...SsoEnforcementUpgradeIntent,
        description: upgradeDescriptions[featureName] ?? SsoEnforcementUpgradeIntent.description,
        isEnterpriseFeature: planName === "Enterprise"
      }
    });

  const closeConfirmation = () => {
    setBypassEnabledInModal(currentOrg?.bypassOrgAuthEnabled ?? false);
    setEnforcementTypeInModal(null);
  };

  const runSetting = async (key: SettingKey, action: () => Promise<void>) => {
    setPendingKey(key);
    try {
      await action();
    } catch (error) {
      failed("Failed to update organization authentication settings", error);
    } finally {
      setPendingKey(null);
    }
  };

  const handleEnforceSsoConfirm = async () => {
    if (!currentOrg?.id || !enforcementTypeInModal) return;
    setConfirmPending(true);
    try {
      if (bypassEnabledInModal && !currentOrg.bypassOrgAuthEnabled) {
        await updateOrg.mutateAsync({ orgId: currentOrg.id, bypassOrgAuthEnabled: true });
      }

      if (enforcementTypeInModal === EnforceAuthType.SAML) {
        await updateOrg.mutateAsync({ orgId: currentOrg.id, authEnforced: true });
        saved("Successfully enabled org-level SAML SSO enforcement");
        setConfirmPending(false);
        setBypassEnabledInModal(false);
        setEnforcementTypeInModal(null);
        await logout.mutateAsync();
        window.open(`/api/v1/sso/redirect/saml2/organizations/${currentOrg.slug}`);
        window.close();
      } else if (enforcementTypeInModal === EnforceAuthType.GOOGLE) {
        await updateOrg.mutateAsync({ orgId: currentOrg.id, googleSsoAuthEnforced: true });
        saved("Successfully enabled org-level Google SSO enforcement");
        setConfirmPending(false);
        setBypassEnabledInModal(false);
        setEnforcementTypeInModal(null);
        await logout.mutateAsync();
        window.open(`/api/v1/sso/redirect/google?org_slug=${currentOrg.slug}`);
        window.close();
      }
    } catch (error) {
      failed("Failed to enable SSO enforcement", error);
    } finally {
      setConfirmPending(false);
    }
  };

  const handleEnforceOrgAuthToggle = async (value: boolean, type: EnforceAuthType) => {
    if (!currentOrg?.id) return;

    if (type === EnforceAuthType.SAML) {
      if (!subscription?.samlSSO) {
        openUpgrade("enforce SAML SSO", "Pro");
        return;
      }
      if (value) {
        setBypassEnabledInModal(true);
        setEnforcementTypeInModal(EnforceAuthType.SAML);
        return;
      }
      await runSetting(type, async () => {
        await updateOrg.mutateAsync({ orgId: currentOrg.id, authEnforced: value });
        saved("Successfully disabled org-level SAML SSO enforcement");
      });
      return;
    }

    if (type === EnforceAuthType.GOOGLE) {
      if (!subscription?.enforceGoogleSSO) {
        openUpgrade("enforce Google OAuth", "Advanced");
        return;
      }
      if (value) {
        setBypassEnabledInModal(true);
        setEnforcementTypeInModal(EnforceAuthType.GOOGLE);
        return;
      }
      await runSetting(type, async () => {
        await updateOrg.mutateAsync({ orgId: currentOrg.id, googleSsoAuthEnforced: value });
        saved("Successfully disabled org-level Google SSO enforcement");
      });
      return;
    }

    if (!subscription?.oidcSSO) {
      openUpgrade("OIDC SSO", "Enterprise");
      return;
    }
    await runSetting(type, async () => {
      await updateOrg.mutateAsync({ orgId: currentOrg.id, authEnforced: value });
      saved(`Successfully ${value ? "enabled" : "disabled"} org-level OIDC SSO enforcement`);
      if (value) {
        await logout.mutateAsync();
        window.close();
      }
    });
  };

  const handleEnableBypassOrgAuthToggle = async (value: boolean) => {
    if (!currentOrg?.id) return;
    if (!subscription?.samlSSO) {
      openUpgrade("Admin SSO Bypass", "Pro");
      return;
    }
    await runSetting("bypass", async () => {
      await updateOrg.mutateAsync({ orgId: currentOrg.id, bypassOrgAuthEnabled: value });
      saved(`Successfully ${value ? "enabled" : "disabled"} admin bypassing of org-level auth`);
    });
  };

  const handleMfaTrustToggle = async (value: boolean) => {
    if (!currentOrg?.id) return;
    if (value && !subscription?.enforceMfa) {
      openUpgradeGate({
        paywallKey: "organization.org-sso-mfa",
        intent: { ...MfaEnforcementUpgradeIntent, isEnterpriseFeature: false }
      });
      return;
    }
    await runSetting("mfaTrust", async () => {
      await updateOrg.mutateAsync({
        orgId: currentOrg.id,
        ssoMfaTrust: value ? SsoMfaTrust.Signal : SsoMfaTrust.None
      });
      saved(`Successfully ${value ? "enabled" : "disabled"} IdP MFA trust`);
    });
  };

  const restricted = canEditSso ? undefined : RESTRICTED;
  const isAuthEnforced = currentOrg?.authEnforced ?? false;
  const isGoogleOAuthEnforced = currentOrg?.googleSsoAuthEnforced ?? false;
  const isBypassEnabled = currentOrg?.bypassOrgAuthEnabled ?? false;
  const isAnySsoEnforced = isAuthEnforced || isGoogleOAuthEnforced;
  const enforcementLabel = enforcementTypeInModal === EnforceAuthType.SAML ? "SAML" : "Google";

  return (
    <>
      <Card
        variant="framed"
        title={
          <Inline gap={8} wrap={false}>
            Enforcement
            {isAnySsoEnforced && <Badge tone="ok">Active</Badge>}
          </Inline>
        }
      >
        <FieldGroup>
          {isSamlConfigured && !isGoogleOAuthEnforced && (
            <SettingRow
              id="enforce-saml-auth"
              title="Enforce SAML SSO"
              description="Members can only sign in via SAML."
              checked={isAuthEnforced}
              pending={pendingKey === EnforceAuthType.SAML}
              disabledReason={restricted}
              onChange={(value) => handleEnforceOrgAuthToggle(value, EnforceAuthType.SAML)}
            />
          )}
          {isOidcConfigured && !isGoogleOAuthEnforced && (
            <SettingRow
              id="enforce-oidc-auth"
              title="Enforce OIDC SSO"
              description="Members can only sign in via OIDC."
              checked={isAuthEnforced}
              pending={pendingKey === EnforceAuthType.OIDC}
              disabledReason={restricted}
              onChange={(value) => handleEnforceOrgAuthToggle(value, EnforceAuthType.OIDC)}
            />
          )}
          {isGoogleConfigured && !isSamlActive && !isOidcActive && !isLdapActive && (
            <SettingRow
              id="enforce-google-sso"
              title="Enforce Google OAuth"
              description="Members can only sign in via Google OAuth."
              checked={isGoogleOAuthEnforced}
              pending={pendingKey === EnforceAuthType.GOOGLE}
              disabledReason={
                restricted ??
                (isAuthEnforced ? "Turn off SAML or OIDC enforcement first" : undefined)
              }
              onChange={(value) => handleEnforceOrgAuthToggle(value, EnforceAuthType.GOOGLE)}
            />
          )}
          <Stack gap={12}>
            <SettingRow
              id="allow-admin-bypass"
              title="Admin SSO bypass"
              description={
                <>
                  Admins can sign in with a password at{" "}
                  <span>
                    <a
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono no-underline hover:underline"
                      href={`${window.location.origin}/login/admin`}
                    >
                      /login/admin
                    </a>
                  </span>{" "}
                  if your IdP is inaccessible.
                </>
              }
              checked={isBypassEnabled}
              pending={pendingKey === "bypass"}
              disabledReason={restricted}
              onChange={handleEnableBypassOrgAuthToggle}
            />
            {isAnySsoEnforced && isBypassEnabled && !currentOrg?.enforceMfa && (
              <Alert tone="warn">
                <AlertDescription>
                  Org MFA is off, so bypass is password-only.{" "}
                  <Button asChild variant="link" underline="hover">
                    <Link {...go.link(orgHref(orgId, "/settings?selectedTab=tab-org-security"))}>
                      Enforce MFA
                    </Link>
                  </Button>
                </AlertDescription>
              </Alert>
            )}
          </Stack>
          <SettingRow
            id="trust-idp-mfa"
            title="Trust IdP MFA"
            badge={
              !currentOrg?.enforceMfa && (
                <TooltipText content="Applies once Enforce MFA is on under Security. Until then every login is prompted as usual.">
                  <Badge tone="soft">No effect</Badge>
                </TooltipText>
              )
            }
            description="Skip the Infisical MFA prompt for SAML and OIDC logins that completed MFA at your IdP."
            checked={currentOrg?.ssoMfaTrust === SsoMfaTrust.Signal}
            pending={pendingKey === "mfaTrust"}
            disabledReason={restricted}
            onChange={handleMfaTrustToggle}
          />
        </FieldGroup>
      </Card>

      {upgradeGate}

      <Dialog
        open={Boolean(enforcementTypeInModal)}
        onOpenChange={(open) => !open && closeConfirmation()}
      >
        <DialogContent pending={confirmPending}>
          <DialogHeader>
            <DialogTitle>Enforce {enforcementLabel} SSO</DialogTitle>
          </DialogHeader>
          <Stack gap={16}>
            <Alert tone="warn">
              <AlertTitle>
                This action will enforce {enforcementLabel} SSO authentication
              </AlertTitle>
              <AlertDescription>
                <Stack gap={8}>
                  <div>
                    All users will be required to authenticate via {enforcementLabel} SSO to access
                    this organization. Other authentication methods will be disabled.
                  </div>
                  <div className="font-medium">
                    Before proceeding, ensure your {enforcementLabel} provider is available and
                    properly configured to avoid access issues.
                  </div>
                  {enforcementTypeInModal !== EnforceAuthType.GOOGLE && (
                    <div>
                      This also disables email and password signup for your verified domain(s) and
                      skips email verification for SSO sign-ins. Make sure a break-glass admin
                      already has a password and SSO bypass access before continuing. The signup
                      block prevents creating new password accounts for the domain afterwards.
                    </div>
                  )}
                </Stack>
              </AlertDescription>
            </Alert>
            {!isBypassEnabled && (
              <Switch
                layout="row"
                label="Enable admin SSO bypass"
                description={`Allow organization admins to bypass SSO login enforcement if they experience any issues with their ${enforcementLabel} provider.`}
                checked={bypassEnabledInModal}
                onChange={setBypassEnabledInModal}
              />
            )}
          </Stack>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button loading={confirmPending} onClick={handleEnforceSsoConfirm}>
              Enable enforcement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
