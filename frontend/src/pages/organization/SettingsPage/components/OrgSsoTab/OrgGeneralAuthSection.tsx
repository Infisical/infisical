import { useState } from "react";
import { AlertTriangle, Info, ShieldCheck } from "lucide-react";
import { twMerge } from "tailwind-merge";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
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
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
  Switch
} from "@app/components/v3";
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
          <CardDescription>Require all members to sign in via your IDP.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field
              orientation="horizontal"
              className={twMerge((!isSamlConfigured || isGoogleOAuthEnforced) && "hidden")}
            >
              <FieldContent>
                <FieldTitle>Enforce SAML SSO</FieldTitle>
                <FieldDescription>Only allow members to sign in via SAML.</FieldDescription>
              </FieldContent>
              <OrgPermissionCan I={OrgPermissionActions.Edit} a={OrgPermissionSubjects.Sso}>
                {(isAllowed) => (
                  <Switch
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
                <FieldDescription>Only allow members to sign in via OIDC.</FieldDescription>
              </FieldContent>
              <OrgPermissionCan I={OrgPermissionActions.Edit} a={OrgPermissionSubjects.Sso}>
                {(isAllowed) => (
                  <Switch
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
                <FieldDescription>
                  Only allow members to sign in via Google OAuth (not SAML).
                </FieldDescription>
              </FieldContent>
              <OrgPermissionCan I={OrgPermissionActions.Edit} a={OrgPermissionSubjects.Sso}>
                {(isAllowed) => (
                  <Switch
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

            <Field orientation="horizontal">
              <FieldContent>
                <FieldTitle>
                  Enable Admin SSO Bypass
                  <HoverCard openDelay={150} closeDelay={150}>
                    <HoverCardTrigger asChild>
                      <Info className="text-muted" />
                    </HoverCardTrigger>
                    <HoverCardContent className="w-80">
                      <p>
                        Enable org-level MFA before turning this on — without a second factor, an
                        admin password is the weakest way into the org.
                      </p>
                      <p className="mt-3 mb-0.5">
                        If locked out, admins can sign in via the{" "}
                        <a
                          target="_blank"
                          rel="noreferrer"
                          className="underline underline-offset-2 hover:text-foreground"
                          href="https://infisical.com/docs/documentation/platform/sso/overview#sso-break-glass"
                        >
                          Admin Login Portal
                        </a>{" "}
                        at{" "}
                        <a
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline underline-offset-2 hover:text-foreground"
                          href={`${window.location.origin}/login/admin`}
                        >
                          /login/admin
                        </a>
                        .
                      </p>
                    </HoverCardContent>
                  </HoverCard>
                </FieldTitle>
                <FieldDescription>
                  Admins can sign in with a password if your IDP is inaccessible.
                </FieldDescription>
              </FieldContent>
              <OrgPermissionCan I={OrgPermissionActions.Edit} a={OrgPermissionSubjects.Sso}>
                {(isAllowed) => (
                  <Switch
                    id="allow-admin-bypass"
                    variant="org"
                    checked={currentOrg?.bypassOrgAuthEnabled ?? false}
                    onCheckedChange={(value) => handleEnableBypassOrgAuthToggle(value)}
                    disabled={!isAllowed}
                  />
                )}
              </OrgPermissionCan>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text="Your current plan does not include access to enforce SAML SSO. To unlock this feature, please upgrade to Infisical Pro plan."
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
              <Switch
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
